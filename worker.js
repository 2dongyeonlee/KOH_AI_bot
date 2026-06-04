const DIFY_API_URL = "https://api.dify.ai/v1";
const SUMMARY_PROMPT =
  "다음 파일의 내용을 핵심만 3줄로 요약해줘. 각 줄은 번호를 붙여줘. 한국어로.";
const TONE_RULE =
  "[응답 규칙: 존댓말 격식체 사용. ^^ 이모티콘 사용 금지. 불필요한 감탄사 사용 금지.]\n\n";
const ADMIN_NAME = "권오혁";
const ALLOWED_NAMES = new Set([
  "권오혁", "염성진", "황무연", "함동균",
  "손경배", "한혜승", "박호현", "양서진", "원정호",
]);

const PRIVATE_GREETING =
  "안녕하세요! 저는 권오혁 담당님의 AI 비서입니다.\n" +
  "성함을 알려주시면 누구신지 등록하겠습니다.";

const GROUP_WELCOME =
  "안녕하세요. 저는 권오혁 담당님의 AI 비서 권오혁(A)입니다.\n" +
  "원활한 소통을 위해 구성원 여러분의 성함을 등록해 주세요.\n" +
  "/등록 을 입력하시면 등록됩니다.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 이동연봇에서 전달받는 relay 처리
    if (url.pathname === "/relay" && request.method === "POST") {
      try {
        const body = await request.json();
        const { from, content } = body;
        const kohUser = await findUserByName("권오혁", env);
        if (kohUser?.chat_id) {
          await sendMessage(env, kohUser.chat_id, `[이동연 TL 전달]\n${from}: ${content}`);
        }
        return new Response("ok", { status: 200 });
      } catch (e) {
        console.error("relay error:", e);
        return new Response("error", { status: 500 });
      }
    }

    if (request.method !== "POST") {
      return new Response("OK");
    }
    const isRelay = request.headers.get("X-Bot-Relay") === "true";
    try {
      const update = await request.json();
      await handleUpdate(update, env, isRelay);
    } catch (e) {
      console.error("handleUpdate error:", e);
    }
    return new Response("OK");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyBriefing(env));
  },
};

async function getUser(userId, env) {
  const raw = await env.USERS.get(`user_${userId}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveUser(userId, data, env) {
  await env.USERS.put(`user_${userId}`, JSON.stringify(data));
}

async function findAdminUser(env) {
  if (env.ADMIN_TELEGRAM_ID) {
    const raw = await env.USERS.get(`user_${env.ADMIN_TELEGRAM_ID}`);
    if (raw) return JSON.parse(raw);
  }
  const list = await env.USERS.list({ prefix: "user_" });
  for (const key of list.keys) {
    const raw = await env.USERS.get(key.name);
    if (!raw) continue;
    const u = JSON.parse(raw);
    if (u.name === ADMIN_NAME) return u;
  }
  return null;
}

async function findUserByName(name, env) {
  const list = await env.USERS.list({ prefix: "user_" });
  for (const key of list.keys) {
    const raw = await env.USERS.get(key.name);
    if (!raw) continue;
    const u = JSON.parse(raw);
    if (u.name === name) return u;
  }
  return null;
}

async function checkIsAdmin(userId, env) {
  if (env.ADMIN_TELEGRAM_ID && userId === String(env.ADMIN_TELEGRAM_ID)) return true;
  const user = await getUser(userId, env);
  return user?.name === ADMIN_NAME;
}

async function checkIsRegistered(userId, env) {
  const user = await getUser(userId, env);
  return !!(user?.name);
}

async function saveRoom(chatId, chatTitle, env) {
  await env.ROOMS.put(`room_${chatId}`, JSON.stringify({ id: chatId, title: chatTitle || "" }));
}

async function getAllRooms(env) {
  const list = await env.ROOMS.list({ prefix: "room_" });
  const rooms = [];
  for (const key of list.keys) {
    const raw = await env.ROOMS.get(key.name);
    if (raw) rooms.push(JSON.parse(raw));
  }
  return rooms;
}

// ── D1 (Cloudflare SQLite) ────────────────────────────────────
// 방 대화 저장 (권오혁봇이 방에 있으면 담당)
async function dbInsert(env, { roomId, roomTitle, senderId, senderName, content, savedBy }) {
  if (!env.DB || !content?.trim()) return;
  try {
    await env.DB.prepare(
      `INSERT INTO messages (room_id, room_title, sender_id, sender_name, content, saved_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        String(roomId),
        roomTitle || "",
        String(senderId),
        senderName || "",
        content.slice(0, 4000),
        savedBy || "koh"
      )
      .run();
  } catch (e) {
    console.error("dbInsert:", e);
  }
}

// 멤버십 기록
async function dbUpsertMember(env, roomId, userId, botName) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO room_members (room_id, user_id, bot_name) VALUES (?, ?, ?)`
    )
      .bind(String(roomId), String(userId), botName || "koh")
      .run();
  } catch (e) {
    console.error("dbUpsertMember:", e);
  }
}

// 권오혁봇 존재 등록 (방에 처음 들어올 때)
async function dbRegisterKohInRoom(env, roomId) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO room_members (room_id, user_id, bot_name) VALUES (?, ?, ?)`
    )
      .bind(String(roomId), "koh_bot", "koh")
      .run();
  } catch (e) {
    console.error("dbRegisterKohInRoom:", e);
  }
}

// 방 대화 검색 (두 봇이 같은 DB 공유하므로 전체 검색 가능)
async function dbSearch(env, { roomTitle, keyword, days = 7 }) {
  if (!env.DB) return [];
  try {
    const since = new Date(Date.now() - days * 86400000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    let query = `SELECT * FROM messages WHERE created_at >= ? ORDER BY created_at DESC LIMIT 100`;
    const params = [since];
    if (roomTitle && !keyword) {
      query = `SELECT * FROM messages WHERE created_at >= ? AND room_title LIKE ? ORDER BY created_at DESC LIMIT 100`;
      params.push(`%${roomTitle}%`);
    } else if (keyword && !roomTitle) {
      query = `SELECT * FROM messages WHERE created_at >= ? AND content LIKE ? ORDER BY created_at DESC LIMIT 100`;
      params.push(`%${keyword}%`);
    } else if (roomTitle && keyword) {
      query = `SELECT * FROM messages WHERE created_at >= ? AND room_title LIKE ? AND content LIKE ? ORDER BY created_at DESC LIMIT 100`;
      params.push(`%${roomTitle}%`, `%${keyword}%`);
    }
    const result = await env.DB.prepare(query).bind(...params).all();
    return result.results || [];
  } catch (e) {
    console.error("dbSearch:", e);
    return [];
  }
}

// conversations 테이블에 대화 저장
async function dbSaveConversation(env, { userId, userName, question, answer, context = "" }) {
  if (!env.DB || !question?.trim() || !answer?.trim()) return;
  try {
    await env.DB.prepare(
      `INSERT INTO conversations (user_id, user_name, question, answer, context)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(String(userId), userName || "", question.slice(0, 2000), answer.slice(0, 4000), context)
      .run();
  } catch (e) {
    console.error("dbSaveConversation:", e);
  }
}

async function fetchNewsRaw(env, keyword) {
  try {
    const q = encodeURIComponent(keyword || "AI 산업");
    const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`);
    const xml = await res.text();
    const items = [...xml.matchAll(/<title>(.*?)<\/title>/g)]
      .slice(1, 6)
      .map((m) => m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
    return items.length ? items.join("\n") : "(뉴스 없음)";
  } catch (e) {
    return "(뉴스 조회 실패)";
  }
}

function getTodayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function saveSchedule(env, schedule) {
  const dateKey = schedule.date.replace(/-/g, "");
  const raw = await env.SCHEDULES.get(`schedules_${dateKey}`);
  const list = raw ? JSON.parse(raw) : [];
  list.push(schedule);
  await env.SCHEDULES.put(`schedules_${dateKey}`, JSON.stringify(list));
}

async function getTodaySchedules(env) {
  const today = getTodayKST().replace(/-/g, "");
  const raw = await env.SCHEDULES.get(`schedules_${today}`);
  return raw ? JSON.parse(raw) : [];
}

function extractSchedule(text, todayISO) {
  const hasDate = /오늘|내일|모레|(\d{1,2})월\s*\d{1,2}일/.test(text);
  const hasTime = /오전|오후|(\d{1,2})시|(\d{2}):(\d{2})/.test(text);
  if (!hasDate && !hasTime) return null;

  const today = new Date(todayISO);
  let dateStr = todayISO;

  if (/모레/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    dateStr = d.toISOString().slice(0, 10);
  } else if (/내일/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    dateStr = d.toISOString().slice(0, 10);
  } else if (!/오늘/.test(text)) {
    const m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (m) {
      const month = m[1].padStart(2, "0");
      const day = m[2].padStart(2, "0");
      dateStr = `${today.getFullYear()}-${month}-${day}`;
    }
  }

  let timeStr = "시간 미정";
  const pmMatch = text.match(/오후\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
  const amMatch = text.match(/오전\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
  const colonMatch = text.match(/(\d{2}):(\d{2})/);
  const hourMatch = text.match(/(\d{1,2})시(?:\s*(\d{1,2})분)?/);

  if (pmMatch) {
    let h = parseInt(pmMatch[1]);
    if (h < 12) h += 12;
    const min = (pmMatch[2] || "0").padStart(2, "0");
    timeStr = `${h.toString().padStart(2, "0")}:${min}`;
  } else if (amMatch) {
    const h = amMatch[1].padStart(2, "0");
    const min = (amMatch[2] || "0").padStart(2, "0");
    timeStr = `${h}:${min}`;
  } else if (colonMatch) {
    timeStr = `${colonMatch[1]}:${colonMatch[2]}`;
  } else if (hourMatch) {
    const h = hourMatch[1].padStart(2, "0");
    const min = (hourMatch[2] || "0").padStart(2, "0");
    timeStr = `${h}:${min}`;
  }

  const title = text.replace(/\n+/g, " ").trim().slice(0, 100);
  return { date: dateStr, time: timeStr, title };
}

function isSelfInfoQuery(text) {
  return (
    /내\s*(아이디|[iI][dD])/.test(text) ||
    /나\s*(누구야|뭐로\s*등록됐|어떻게\s*등록됐)/.test(text) ||
    /(아이디|[iI][dD])\s*(는|가)?\s*(뭐야|뭐인가요|뭐에요|알려줘|\?)/.test(text)
  );
}

function isNewsQuery(text) {
  return /뉴스/.test(text) || /최신\s*(기사|소식)/.test(text);
}

function isIntroQuery(text) {
  return (
    /(뭐\s*할\s*수\s*있|기능|도움말|소개)/.test(text) ||
    /너\s*(는|가)?\s*(뭐야|누구야|할\s*수)/.test(text)
  );
}

function isUserListQuery(text) {
  return (
    /(누가|누구|팀원).{0,10}(등록|저장|있어|됐어)/.test(text) ||
    /등록된\s*(사람|팀원|목록)/.test(text)
  );
}

function isRoomSearchQuery(text) {
  return (
    /(방|프로젝트|회의|단톡).{0,12}(에서|얘기|논의|대화|내용|정리|요약|찾)/.test(text) ||
    /무슨\s*(얘기|논의|말)/.test(text)
  );
}

function isCombinedAnalysis(text) {
  return (
    /(종합|교차|총정리).{0,6}(분석|정리|요약|브리핑)/.test(text) ||
    /(뉴스).{0,10}(팀|방|논의).{0,10}(같이|함께|종합|비교)/.test(text)
  );
}

function parseSearch(text) {
  const room = text.match(/([가-힣A-Za-z0-9]+)\s*방/);
  const topic = text.match(/([가-힣A-Za-z0-9]{2,})\s*(관련|에\s*대해|얘기|논의)/);
  const day = text.match(/(\d+)\s*일/);
  return {
    roomTitle: room ? room[1] : null,
    keyword: topic ? topic[1] : null,
    days: day ? parseInt(day[1]) : 7,
  };
}

async function handleNewsQuery(chatId, env) {
  try {
    const res = await fetch("https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`RSS ${res.status}`);
    const xml = await res.text();

    const headlines = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 5)
      .map((m) => {
        const raw =
          m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
          m[1].match(/<title>(.*?)<\/title>/)?.[1] ||
          "";
        return raw.replace(/<[^>]+>/g, "").replace(/\s+-\s+[^-]+$/, "").trim();
      })
      .filter(Boolean);

    if (headlines.length === 0) {
      await sendMessage(env, chatId, "뉴스를 불러오지 못했습니다.");
      return;
    }

    const kst = new Date(Date.now() + 9 * 3600000);
    const dateStr = kst.toISOString().slice(0, 10);
    const msg = `📰 ${dateStr} 주요 뉴스\n\n${headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}`;
    await sendMessage(env, chatId, msg);
  } catch (e) {
    console.error("handleNewsQuery error:", e);
    await sendMessage(env, chatId, "뉴스를 불러오지 못했습니다.");
  }
}

async function handleSelfInfo(user, userId, chatId, env) {
  if (!user?.name) {
    await sendMessage(env, chatId, `아직 등록되지 않으셨습니다.\n텔레그램 ID: ${userId}`);
    return;
  }
  let msg = `${user.name}님으로 등록되어 있습니다.\n텔레그램 ID: ${userId}`;
  if (user.team) msg += `\n소속: ${user.team}`;
  if (user.role) msg += `\n담당: ${user.role}`;
  await sendMessage(env, chatId, msg);
}

async function handleIntro(chatId, env) {
  await sendMessage(
    env,
    chatId,
    `권오혁 담당의 AI 비서입니다.

일정
- 오늘/이번주 일정 알려줘

파일·이미지
- PDF, PPT, 사진 올리면 요약·분석

팀방 검색
- A방 지난주 논의 정리해줘
- HBM 관련 대화 찾아줘

내 정보
- 내 아이디 뭐야
- 누가 등록됐어`
  );
}

async function handleUserList(chatId, env) {
  const list = await env.USERS.list({ prefix: "user_" });
  const users = [];
  for (const key of list.keys) {
    const raw = await env.USERS.get(key.name);
    if (!raw) continue;
    const u = JSON.parse(raw);
    if (u.name && !u.step) {
      users.push(`${u.name} (ID: ${u.id})${u.team ? " / " + u.team : ""}`);
    }
  }
  await sendMessage(
    env,
    chatId,
    users.length
      ? `등록된 팀원 ${users.length}명:\n\n${users.join("\n")}`
      : "아직 등록된 분이 없습니다."
  );
}

function isForwardRequest(text) {
  return /전달|전해|알려|보내/.test(text);
}

function extractForwardCommand(text) {
  const m = text.match(/^(.+?)한테\s+([\s\S]+?)\s*(전달해줘|보내줘|말해줘)\s*$/);
  if (!m) return null;
  return { targetName: m[1].trim(), content: m[2].trim() };
}

async function handleAdminForward(targetName, content, adminChatId, env) {
  const target = await findUserByName(targetName, env);
  if (!target?.chat_id) {
    await sendMessage(env, adminChatId, `${targetName}님은 아직 등록되지 않으셨습니다.`);
    return;
  }
  await sendMessage(env, target.chat_id, `권오혁 담당님 전달사항입니다.\n\n${content}`);
  await sendMessage(env, adminChatId, `${targetName}님께 전달 완료했습니다.`);
}

async function handleUpdate(update, env, isRelay = false) {
  if (update.my_chat_member) {
    const mc = update.my_chat_member;
    const newStatus = mc.new_chat_member?.status;
    if ((newStatus === "member" || newStatus === "administrator") && mc.chat.type !== "private") {
      await saveRoom(mc.chat.id, mc.chat.title, env);
      await sendMessage(env, mc.chat.id, GROUP_WELCOME);
    }
    return;
  }

  const message = update.message;
  if (!message) return;

  const userId = String(message.from.id);
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const text = message.text || message.caption || "";
  const hasFile = !!(message.document || message.photo);

  if (message.new_chat_members?.some((m) => m.is_bot)) {
    await saveRoom(chatId, message.chat.title, env);
    await sendMessage(env, chatId, GROUP_WELCOME);
    return;
  }

  if (text.split("@")[0].trim() === "/등록") {
    await handleRegisterStep1(userId, chatId, env);
    return;
  }

  const user = await getUser(userId, env);
  if (user?.step === "waiting_name" && !hasFile && text.trim()) {
    await handleRegisterStep2(userId, chatId, text.trim(), chatId, env);
    return;
  }
  if (user?.step === "waiting_team" && !hasFile && text.trim()) {
    await handleRegisterStep3(userId, chatId, text.trim(), env);
    return;
  }

  const isPrivate = chatType === "private";
  if (isPrivate) {
    await handlePrivateMessage(message, userId, chatId, text, hasFile, user, env, isRelay);
  } else {
    await handleGroupMessage(message, userId, chatId, text, hasFile, user, env);
  }
}

async function handlePrivateMessage(message, userId, chatId, text, hasFile, user, env, isRelay = false) {
  if (hasFile) {
    const isAdmin = await checkIsAdmin(userId, env);
    await handleFile(message, userId, chatId, isAdmin, env);
    return;
  }

  if (!text.trim()) return;

  // 이름 입력 대기 중 → 등록 처리 (Dify 호출 없음) [기존 호환]
  if (user?.step === "waiting_name_auto") {
    await handleAutoRegister(userId, chatId, text.trim(), env);
    return;
  }

  // 첫 접촉: 텔레그램 이름·ID 자동 저장 (릴레이는 임시 사용자로 처리)
  if (!user) {
    if (isRelay) {
      user = { id: userId, name: message.from?.first_name || "사용자", chat_id: chatId };
    } else {
      const tgName =
        [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim() ||
        `user_${userId}`;
      await saveUser(userId, { id: userId, name: tgName, chat_id: chatId }, env);
      await sendMessage(env, chatId, PRIVATE_GREETING);
      return;
    }
  }

  // 기능 소개
  if (isIntroQuery(text)) {
    await handleIntro(chatId, env);
    return;
  }

  // 본인 등록 정보 조회 → KV 직접 답변
  if (isSelfInfoQuery(text)) {
    await handleSelfInfo(user, userId, chatId, env);
    return;
  }

  // 등록자 목록 (관리자만)
  if (isUserListQuery(text)) {
    const isAdmin = await checkIsAdmin(userId, env);
    if (isAdmin) {
      await handleUserList(chatId, env);
      return;
    }
  }

  // 뉴스 조회 → RSS 직접 답변
  if (isNewsQuery(text)) {
    await handleNewsQuery(chatId, env);
    return;
  }

  // 종합분석 — 뉴스 + 팀방 교차분석 (공유 D1)
  if (env.DB && isCombinedAnalysis(text)) {
    const q = parseSearch(text);
    const [rows, newsText] = await Promise.all([
      dbSearch(env, q),
      fetchNewsRaw(env, q.keyword || "AI 산업"),
    ]);
    const roomCorpus = rows.length
      ? rows
          .reverse()
          .map((r) => `[${r.room_title}] ${r.sender_name}: ${r.content}`)
          .join("\n")
          .slice(0, 5000)
      : "(저장된 팀방 대화 없음)";
    const query =
      TONE_RULE +
      "아래 [팀 내부 대화]와 [외부 뉴스]를 교차분석해서 핵심 시사점 3가지를 뽑아줘. " +
      "단순 나열 말고, 내부 상황과 외부 흐름을 연결해서 분석할 것.\n\n" +
      "=== 팀 내부 대화 ===\n" +
      roomCorpus +
      "\n\n=== 외부 뉴스 ===\n" +
      newsText;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "분석 중 오류가 발생했습니다.");
    return;
  }

  // 팀방 검색·요약 (공유 D1에서 전체 검색)
  if (isRoomSearchQuery(text)) {
    const q = parseSearch(text);
    const rows = await dbSearch(env, q);
    if (rows.length === 0) {
      await sendMessage(env, chatId, "해당 조건의 대화 기록이 없습니다.");
      return;
    }
    const corpus = rows
      .reverse()
      .map((r) => `[${r.room_title}] ${r.sender_name}: ${r.content}`)
      .join("\n")
      .slice(0, 8000);
    const query = TONE_RULE + "다음 팀 대화 기록의 핵심 논의를 항목별로 요약해줘.\n\n" + corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.");
    return;
  }

  // 권오혁님 → 특정인 전달 명령
  if (user.name === ADMIN_NAME) {
    const fwd = extractForwardCommand(text);
    if (fwd) {
      await handleAdminForward(fwd.targetName, fwd.content, chatId, env);
      return;
    }
  }

  // 전달 요청 → 권오혁님에게 포워딩 (릴레이 요청은 스킵)
  if (!isRelay && user.name && isForwardRequest(text)) {
    const admin = await findAdminUser(env);
    if (admin?.chat_id) {
      await sendMessage(env, admin.chat_id, `${user.name}님이 전달: ${text}`);
      await sendMessage(env, chatId, "권오혁 담당님께 전달하였습니다.");
      return;
    }
  }

  // 등록 여부 상관없이 모든 메시지 Dify 답변
  await handleUserMessage(userId, chatId, text.trim(), true, env, user?.name || "");
}

async function handleAutoRegister(userId, chatId, name, env) {
  await saveUser(userId, { id: userId, name, chat_id: chatId }, env);
  await sendMessage(env, chatId, `${name}님으로 등록되었습니다.`);
}

async function handleRegisterStep1(userId, chatId, env) {
  await saveUser(userId, { id: userId, step: "waiting_name" }, env);
  await sendMessage(env, chatId, "성함을 입력해 주세요.");
}

async function handleRegisterStep2(userId, chatId, name, currentChatId, env) {
  if (ALLOWED_NAMES.has(name)) {
    await saveUser(userId, { id: userId, name, chat_id: currentChatId }, env);
    await sendMessage(env, chatId, `등록 완료되었습니다. ${name}님.`);
  } else {
    await saveUser(userId, { id: userId, name, chat_id: currentChatId, step: "waiting_team" }, env);
    await sendMessage(
      env,
      chatId,
      "소속 조직과 담당 업무를 알려주세요.\n(예: 6R전략실 담당 / 권오혁)"
    );
  }
}

async function handleRegisterStep3(userId, chatId, input, env) {
  const user = await getUser(userId, env);
  const parts = input.split("/").map((s) => s.trim());
  const team = parts[0] || input.trim();
  const role = parts[1] || "";
  await saveUser(userId, { id: userId, name: user.name, team, role, chat_id: user.chat_id }, env);
  const suffix = role ? ` (${team} / ${role})` : ` (${team})`;
  await sendMessage(env, chatId, `등록 완료되었습니다. ${user.name}님${suffix}.`);
}

async function handleUserMessage(userId, chatId, text, sendReply, env, userName = "") {
  try {
    const convKey = `conv_${userId}`;
    const conversationId = (await env.CONVERSATIONS.get(convKey)) || "";
    const query = TONE_RULE + text;
    let result;

    try {
      result = await difyChat(env, { query, user: String(userId), conversationId });
    } catch (e) {
      if (e.message.includes("not_found") || e.message.includes("Conversation Not Exists")) {
        await env.CONVERSATIONS.delete(convKey);
        result = await difyChat(env, { query, user: String(userId), conversationId: "" });
      } else {
        throw e;
      }
    }

    if (result.conversation_id) {
      await env.CONVERSATIONS.put(convKey, result.conversation_id, { expirationTtl: 86400 });
    }

    // D1에 대화 이력 저장
    await dbSaveConversation(env, {
      userId,
      userName,
      question: text,
      answer: result.answer || "",
    });

    if (sendReply) {
      await sendMessage(env, chatId, result.answer || "응답을 받지 못했어요.");
    }
  } catch (e) {
    console.error("handleUserMessage error:", e);
    if (sendReply) {
      await sendMessage(env, chatId, `❌ 오류 발생\n${e.message}`);
    }
  }
}

async function handleGroupMessage(message, userId, chatId, text, hasFile, user, env) {
  if (hasFile) {
    await handleFile(message, userId, chatId, false, env);
    return;
  }

  if (!text.trim()) return;

  // 멤버십 + 방 등록
  await dbRegisterKohInRoom(env, chatId);
  await dbUpsertMember(env, chatId, userId, "koh");

  // 미등록자 이름 자동 저장
  if (!user) {
    const tgName =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim() ||
      `user_${userId}`;
    await saveUser(userId, { id: userId, name: tgName, chat_id: chatId }, env);
    user = await getUser(userId, env);
  }

  // 일정 감지 (브리핑 cron용)
  const schedule = extractSchedule(text, getTodayKST());
  if (schedule) {
    schedule.chat_id = chatId;
    await saveSchedule(env, schedule);
  }

  // 멘션 또는 봇 메시지 reply인 경우만 응답
  const botUsername = "@KOH_AI_bot";
  const isMentioned = text.includes(botUsername);
  const isReply = message.reply_to_message?.from?.is_bot === true;
  const cleanText = text.replace(botUsername, "").trim();

  if (!isMentioned && !isReply) return;

  if (!cleanText) {
    await sendMessage(env, chatId, `네, ${user?.name || ""}님. 무엇을 도와드릴까요?`);
    return;
  }

  // 팀방 검색
  if (isRoomSearchQuery(cleanText)) {
    const q = parseSearch(cleanText);
    const rows = await dbSearch(env, q);
    if (rows.length === 0) {
      await sendMessage(env, chatId, "해당 조건의 대화 기록이 없습니다.");
      return;
    }
    const corpus = rows
      .reverse()
      .map((r) => `[${r.room_title}] ${r.sender_name}: ${r.content}`)
      .join("\n")
      .slice(0, 6000);
    const query = TONE_RULE + "다음 팀 대화 기록의 핵심 논의를 항목별로 요약해줘.\n\n" + corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.");
    return;
  }

  // 일반 질문 → Dify (그룹방 맥락 포함, 대화 흐름 없이 단발 응답)
  const contextMsg =
    TONE_RULE +
    `[단체방: ${message.chat.title}] [발신자: ${user?.name || message.from?.first_name}] ` +
    cleanText;
  const result = await difyChat(env, { query: contextMsg, user: userId, conversationId: "" });
  if (result.answer) {
    await sendMessage(env, chatId, result.answer);
  }
}

async function handleFile(message, userId, chatId, isAdmin, env) {
  try {
    let fileId, fileName, mimeType;
    if (message.document) {
      fileId = message.document.file_id;
      fileName = message.document.file_name || "document";
      mimeType = message.document.mime_type || "application/octet-stream";
    } else {
      const photo = message.photo[message.photo.length - 1];
      fileId = photo.file_id;
      fileName = "photo.jpg";
      mimeType = "image/jpeg";
    }

    const fileInfo = await tgGetFile(env, fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    // 이미지는 Gemini로, 문서는 Dify로 처리
    if (mimeType.startsWith("image/") && env.GEMINI_API_KEY) {
      const buffer = await fetch(fileUrl).then((r) => r.arrayBuffer());
      const answer = await analyzeImageWithClaude(env, buffer, mimeType);
      await sendMessage(env, chatId, answer);
      return;
    }

    const fileBlob = await fetch(fileUrl).then((r) => r.blob());
    const uploaded = await difyUploadFile(env, fileBlob, fileName, mimeType, userId);
    if (!uploaded.id) throw new Error("Dify 파일 업로드 실패: " + JSON.stringify(uploaded));

    const conversationId = isAdmin
      ? (await env.CONVERSATIONS.get(`conv_${userId}`)) || ""
      : "";

    const filePayload = {
      query: TONE_RULE + SUMMARY_PROMPT,
      user: userId,
      files: [{ type: difyFileType(mimeType), transfer_method: "local_file", upload_file_id: uploaded.id }],
    };

    let result;
    try {
      result = await difyChat(env, { ...filePayload, conversationId });
    } catch (e) {
      if (e.message.includes("not_found") || e.message.includes("Conversation Not Exists")) {
        await env.CONVERSATIONS.delete(`conv_${userId}`);
        result = await difyChat(env, { ...filePayload, conversationId: "" });
      } else {
        throw e;
      }
    }

    if (isAdmin && result.conversation_id) {
      await env.CONVERSATIONS.put(`conv_${userId}`, result.conversation_id);
    }
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했어요.");
  } catch (e) {
    console.error("handleFile error:", e);
    await sendMessage(env, chatId, `❌ 파일 처리 오류\n${e.message}`);
  }
}

async function analyzeImageWithClaude(env, buffer, mimeType) {
  const validMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const imgMime = validMimes.includes(mimeType) ? mimeType : "image/jpeg";

  const uint8 = new Uint8Array(buffer);
  const chunks = [];
  for (let i = 0; i < uint8.length; i += 8192) {
    chunks.push(String.fromCharCode(...uint8.subarray(i, i + 8192)));
  }
  const base64 = btoa(chunks.join(""));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: imgMime, data: base64 } },
            { text: TONE_RULE + "이 이미지를 설명하고 핵심 내용을 한국어로 요약해줘." },
          ],
        }],
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "분석 결과를 받지 못했습니다.";
}

async function sendDailyBriefing(env) {
  const today = getTodayKST();
  const schedules = await getTodaySchedules(env);
  if (schedules.length === 0) return;

  const sorted = schedules.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const lines = sorted.map((s) => `${s.time} ${s.title}`).join("\n");
  const msg = `📅 오늘의 주요 일정\n\n${lines}`;

  const rooms = await getAllRooms(env);
  await Promise.all(rooms.map((r) => sendMessage(env, r.id, msg)));
}

async function difyChat(env, { query, user, conversationId = "", files = [] }) {
  const body = { inputs: {}, query, response_mode: "streaming", user };
  if (conversationId) body.conversation_id = conversationId;
  if (files.length > 0) body.files = files;

  const res = await fetch(`${DIFY_API_URL}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DIFY_API_KEY.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dify API ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let answer = "";
  let newConversationId = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.event === "agent_message" && parsed.answer) answer += parsed.answer;
        if (parsed.event === "message_end") newConversationId = parsed.conversation_id || "";
      } catch (_) {}
    }
  }

  return { answer, conversation_id: newConversationId };
}

async function difyUploadFile(env, blob, fileName, mimeType, userId) {
  const form = new FormData();
  form.append("file", new File([blob], fileName, { type: mimeType }));
  form.append("user", userId);

  const res = await fetch(`${DIFY_API_URL}/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DIFY_API_KEY.trim()}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dify upload error ${res.status}: ${err}`);
  }
  return res.json();
}

function difyFileType(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

async function tgGetFile(env, fileId) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const data = await res.json();
  return data.result;
}

async function sendMessage(env, chatId, text) {
  const clean = String(text)
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1");
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: clean }),
  });
}
