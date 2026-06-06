const DIFY_API_URL = "https://api.dify.ai/v1";
const SUMMARY_PROMPT =
  "다음 파일에서 아래 형식으로 추출해줘.\n" +
  "요약: (핵심 3줄)\n" +
  "안건: (주요 논의·결정 안건, 없으면 '없음')\n" +
  "일정: (날짜·기한·마감이 언급된 일정, 없으면 '없음')";
const TONE_RULE =
  "[응답 규칙: 존댓말 격식체 사용. ^^ 이모티콘 사용 금지. 불필요한 감탄사 사용 금지.]\n\n";
const ADMIN_NAME = "권오혁";
const BOT_OWNER_NAME = "권오혁";
const BOT_PERSONA = "권오혁의 개인 업무 비서 AI OS";
const BOT_DB_NAME = "6r-ai-db";
const BOT_KEY = "koh";
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

function getSenderName(from) {
  if (!from) return "이름 없음";
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return full || from.username || String(from.id || "이름 없음");
}

async function upsertUser(env, from, chatId, source = "auto_message") {
  if (!env.DB || !from?.id || from.is_bot) return;
  try {
    const telegramId = String(from.id);
    await env.DB.prepare(`
      INSERT INTO users
        (telegram_id, chat_id, name, username, first_name, last_name, source, last_seen_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_id) DO UPDATE SET
        chat_id = excluded.chat_id,
        name = excluded.name,
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        source = excluded.source,
        last_seen_at = CURRENT_TIMESTAMP
    `).bind(
      telegramId,
      String(chatId || from.id),
      getSenderName(from),
      from.username || "",
      from.first_name || "",
      from.last_name || "",
      source
    ).run();
  } catch (e) {
    console.error("upsertUser:", e);
  }
}

async function upsertRoom(env, chat) {
  if (!env.DB || !chat?.id || chat.type === "private") return;
  try {
    await dbRegisterRoom(env, chat.id, chat.title || chat.username || String(chat.id), BOT_KEY);
  } catch (e) {
    console.error("upsertRoom:", e);
  }
}

async function upsertRoomMember(env, chat, from, source = "message") {
  if (!env.DB || !chat?.id || !from?.id || chat.type === "private" || from.is_bot) return;
  try {
    await env.DB.prepare(`
      INSERT INTO room_members (room_id, telegram_id, user_id, name, username, bot_name, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(room_id, telegram_id) DO UPDATE SET
        user_id = excluded.user_id,
        name = excluded.name,
        username = excluded.username,
        bot_name = excluded.bot_name,
        last_seen_at = CURRENT_TIMESTAMP
    `).bind(
      String(chat.id),
      String(from.id),
      String(from.id),
      getSenderName(from),
      from.username || "",
      BOT_KEY
    ).run();
  } catch (e) {
    console.error(`upsertRoomMember:${source}`, e);
  }
}

async function handleNewChatMembers(env, message) {
  if (!message?.new_chat_members?.length || !message.chat || message.chat.type === "private") return;
  await upsertRoom(env, message.chat);
  for (const member of message.new_chat_members) {
    if (member.is_bot) continue;
    await upsertUser(env, member, member.id, "new_chat_member");
    await upsertRoomMember(env, message.chat, member, "new_chat_member");
  }
}

function isImportantMemoryCandidate(text) {
  return /(기억해|저장해|앞으로|선호|싫어|좋아|반복|원칙|성향|담당|결정|액션|마감|중요)/.test(text || "");
}

function detectMemorySubject(text, from) {
  if (/(나|내|저는|나는|제)/.test(text || "")) return BOT_OWNER_NAME;
  return getSenderName(from);
}

async function maybeLearnFromMessage(env, message) {
  if (!env.DB || !message?.from || message.from.is_bot) return;
  const text = message.text || message.caption || "";
  if (!isImportantMemoryCandidate(text)) return;
  try {
    const chat = message.chat || {};
    await env.DB.prepare(`
      INSERT INTO learned_facts
        (fact_type, subject, content, confidence, source_type, source_room, source_actor, source_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      "message_signal",
      detectMemorySubject(text, message.from),
      text.slice(0, 1000),
      /기억해|저장해/.test(text) ? 5 : 2,
      chat.type === "private" ? "private" : "telegram_group",
      chat.title || chat.username || String(chat.id || ""),
      getSenderName(message.from)
    ).run();
  } catch (e) {
    console.error("maybeLearnFromMessage:", e);
  }
}

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
      `INSERT INTO room_members (room_id, telegram_id, user_id, bot_name, last_seen_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(room_id, telegram_id) DO UPDATE SET
         user_id = excluded.user_id,
         bot_name = excluded.bot_name,
         last_seen_at = CURRENT_TIMESTAMP`
    )
      .bind(String(roomId), String(userId), String(userId), botName || BOT_KEY)
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
      `INSERT INTO room_members (room_id, telegram_id, user_id, name, bot_name, last_seen_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(room_id, telegram_id) DO UPDATE SET
         user_id = excluded.user_id,
         name = excluded.name,
         bot_name = excluded.bot_name,
         last_seen_at = CURRENT_TIMESTAMP`
    )
      .bind(String(roomId), "koh_bot", "koh_bot", "KOH_AI_bot", BOT_KEY)
      .run();
  } catch (e) {
    console.error("dbRegisterKohInRoom:", e);
  }
}

async function dbRegisterRoom(env, roomId, roomTitle, botName) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO rooms (room_id, room_title, bot_name) VALUES (?, ?, ?)`
    )
      .bind(String(roomId), roomTitle || "", botName || "koh")
      .run();
  } catch (e) {
    console.error("dbRegisterRoom:", e);
  }
}

async function dbGetAllRooms(env) {
  if (!env.DB) return [];
  try {
    const result = await env.DB.prepare(
      `SELECT DISTINCT room_id, room_title FROM rooms ORDER BY joined_at DESC`
    ).all();
    return result.results || [];
  } catch (e) {
    return [];
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
    let where = "created_at >= ?";
    const params = [since];
    if (roomTitle) { where += " AND room_title LIKE ?"; params.push(`%${roomTitle}%`); }
    if (keyword)   { where += " AND content LIKE ?";    params.push(`%${keyword}%`); }
    const query = `SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC LIMIT 150`;
    const result = await env.DB.prepare(query).bind(...params).all();
    return result.results || [];
  } catch (e) {
    console.error("dbSearch:", e);
    return [];
  }
}

async function summarizeUrl(env, url, userId, chatId) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
      redirect: "follow",
    });
    if (!res.ok) {
      await sendMessage(env, chatId, "해당 링크에 접근할 수 없습니다.");
      return;
    }
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 5000);
    if (text.length < 100) {
      await sendMessage(env, chatId, "본문을 추출할 수 없는 링크입니다.");
      return;
    }
    const query = TONE_RULE + "아래 기사/문서 내용을 핵심 3줄로 요약해줘. 출처·광고·메뉴 내용은 제외.\n\n" + text;
    const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.");
  } catch (e) {
    console.error("summarizeUrl:", e);
    await sendMessage(env, chatId, "링크 접근 중 오류가 발생했습니다.");
  }
}

async function summarizeAllRooms(env, userId, { summaryType, days, keyword }) {
  if (!env.DB) return null;
  try {
    const since = new Date(Date.now() - days * 86400000)
      .toISOString().replace("T", " ").slice(0, 19);
    let sql = `SELECT * FROM messages WHERE created_at >= ? ORDER BY created_at ASC LIMIT 200`;
    const params = [since];
    if (keyword) {
      sql = `SELECT * FROM messages WHERE created_at >= ? AND content LIKE ? ORDER BY created_at ASC LIMIT 200`;
      params.push(`%${keyword}%`);
    }
    const result = await env.DB.prepare(sql).bind(...params).all();
    const rows = result.results || [];
    if (rows.length === 0) return null;
    let corpus = "";
    if (summaryType === "person") {
      const byPerson = {};
      rows.forEach((r) => {
        const k = r.sender_name || "미등록";
        if (!byPerson[k]) byPerson[k] = [];
        byPerson[k].push(r.content);
      });
      corpus = Object.entries(byPerson)
        .map(([name, msgs]) => `[${name}]\n${msgs.join("\n")}`)
        .join("\n\n")
        .slice(0, 8000);
    } else if (summaryType === "timeline") {
      corpus = rows
        .map((r) => `[${r.created_at.slice(0, 16)}] [${r.room_title}] ${r.sender_name}: ${r.content}`)
        .join("\n")
        .slice(0, 8000);
    } else {
      corpus = rows
        .map((r) => `[${r.room_title}] ${r.sender_name}: ${r.content}`)
        .join("\n")
        .slice(0, 8000);
    }
    return corpus;
  } catch (e) {
    console.error("summarizeAllRooms:", e);
    return null;
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

async function dbSaveFile(env, { roomId, roomTitle, senderId, senderName, fileName, mimeType, summary, savedBy }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO files (room_id, room_title, sender_id, sender_name, file_name, mime_type, summary, saved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        String(roomId),
        roomTitle || "",
        String(senderId),
        senderName || "",
        fileName || "",
        mimeType || "",
        (summary || "").slice(0, 4000),
        savedBy || "koh"
      )
      .run();
  } catch (e) {
    console.error("dbSaveFile:", e);
  }
}

async function dbSearchFiles(env, { roomTitle, keyword, days = 7 }) {
  if (!env.DB) return [];
  try {
    const since = new Date(Date.now() - days * 86400000)
      .toISOString().replace("T", " ").slice(0, 19);
    let where = "created_at >= ?";
    const params = [since];
    if (roomTitle) { where += " AND room_title LIKE ?"; params.push(`%${roomTitle}%`); }
    if (keyword) {
      where += " AND (file_name LIKE ? OR summary LIKE ?)";
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const query = `SELECT * FROM files WHERE ${where} ORDER BY created_at DESC LIMIT 50`;
    const result = await env.DB.prepare(query).bind(...params).all();
    return result.results || [];
  } catch (e) {
    console.error("dbSearchFiles:", e);
    return [];
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

function cleanName(raw) {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/\s*(입니다|이에요|이야|예요|이라고|라고|으로|로)$/g, "")
    .replace(/\s*(팀원|담당|TL|팀장|사원|주임|대리|과장|차장|부장|임원|상무|전무|사장)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUserUpdateQuery(text) {
  return (
    /(이름|성함|명칭).{0,30}(바꿔|변경|수정|고쳐|바꾸|수정하고)/.test(text) ||
    /(바꿔|변경|수정|고쳐).{0,20}(이름|성함|명칭)/.test(text) ||
    /이름\s+([가-힣]{2,5})/.test(text) ||
    /([가-힣]{2,5})(으?로|로)\s*(이름|명칭)?\s*(바꿔|변경|수정|고쳐|저장)/.test(text)
  );
}

function extractNewName(text) {
  const patterns = [
    /이름\s*([가-힣]{2,5})\s*(으?로|이라고|라고)?\s*(바꿔|변경|수정|고쳐|저장)/,
    /이름\s+([가-힣]{2,5})/,
    /([가-힣]{2,5})(으?로|로)\s*(이름|명칭)?\s*(바꿔|변경|수정|고쳐|저장)/,
    /([가-힣]{2,5})(으?로|로)\s*(바꿔|변경|수정|고쳐줘)/,
    /내\s*이름\s*([가-힣]{2,5})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return cleanName(m[1]);
  }
  return null;
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

function isRoomListQuery(text) {
  return (
    /(내가|봇이|어떤)\s*(들어간|포함된|있는)\s*방/.test(text) ||
    /방\s*(목록|리스트|어디어디)/.test(text) ||
    /어떤\s*방에\s*(있어|들어가)/.test(text)
  );
}

function isExplicitMemorySaveQuery(text) {
  return /(기억해줘|기억해 줘|저장해줘|저장해 줘|앞으로\s*참고|메모해줘|메모해 줘)/.test(text || "");
}

function isMemorySearchQuery(text) {
  return /(찾아줘|찾아 줘|검색|기억|무슨\s*얘기|정리해줘|요약해줘|파일|회의록|자료).{0,30}/.test(text || "");
}

async function saveExplicitMemory(env, text, from, chatId) {
  if (!env.DB) {
    await sendMessage(env, chatId, "D1 DB가 연결되어 있지 않아 기억을 저장할 수 없습니다.");
    return;
  }
  const content = String(text || "")
    .replace(/기억해줘|기억해 줘|저장해줘|저장해 줘|앞으로\s*참고|메모해줘|메모해 줘/g, "")
    .trim();
  if (!content) {
    await sendMessage(env, chatId, "저장할 내용을 찾지 못했습니다.");
    return;
  }
  try {
    await env.DB.prepare(`
      INSERT INTO memory_profile (profile_key, profile_value, evidence, confidence)
      VALUES (?, ?, ?, ?)
    `).bind(
      `manual_${Date.now()}`,
      content.slice(0, 1000),
      `사용자 직접 저장: ${getSenderName(from)}`,
      5
    ).run();
    await sendMessage(env, chatId, "기억해두겠습니다.");
  } catch (e) {
    console.error("saveExplicitMemory:", e);
    await sendMessage(env, chatId, "기억 저장 중 오류가 발생했습니다.");
  }
}

function extractSearchKeyword(text) {
  const cleaned = String(text || "")
    .replace(/찾아줘|찾아 줘|검색|정리해줘|요약해줘|뭐야|무슨|얘기|파일|회의록|자료|관련/g, " ")
    .replace(/[^\w가-힣A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter((w) => w.length >= 2);
  return parts.slice(0, 4).join(" ") || cleaned || text;
}

async function searchMemory(env, keyword, limit = 30) {
  if (!env.DB || !keyword?.trim()) return [];
  const like = `%${keyword}%`;
  try {
    const messages = await env.DB.prepare(`
      SELECT 'message' AS type, room_title AS source, sender_name AS actor, content AS text, created_at, NULL AS file_name, NULL AS title
      FROM messages
      WHERE content LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(like, limit).all();
    const files = await env.DB.prepare(`
      SELECT 'file' AS type, COALESCE(room_title, '') AS source, COALESCE(uploader_name, sender_name) AS actor,
             COALESCE(summary, extracted_text, content, file_name) AS text, created_at, file_name, NULL AS title
      FROM files
      WHERE file_name LIKE ? OR extracted_text LIKE ? OR content LIKE ? OR summary LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(like, like, like, like, limit).all();
    const meetings = await env.DB.prepare(`
      SELECT 'meeting' AS type, COALESCE(source, title, '') AS source, created_by AS actor,
             COALESCE(summary, raw_text, decisions, action_items) AS text, created_at, NULL AS file_name, title
      FROM meetings
      WHERE title LIKE ? OR raw_text LIKE ? OR summary LIKE ? OR decisions LIKE ? OR action_items LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(like, like, like, like, like, limit).all();
    const facts = await env.DB.prepare(`
      SELECT 'memory' AS type, COALESCE(source_room, subject, '') AS source, source_actor AS actor,
             content AS text, created_at, NULL AS file_name, subject AS title
      FROM learned_facts
      WHERE subject LIKE ? OR content LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(like, like, limit).all();
    return [
      ...(messages.results || []),
      ...(files.results || []),
      ...(meetings.results || []),
      ...(facts.results || []),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
  } catch (e) {
    console.error("searchMemory:", e);
    return [];
  }
}

function buildSourceCorpus(rows) {
  return rows.map((r, idx) => {
    const typeLabel =
      r.type === "message" ? "대화" :
      r.type === "file" ? "파일" :
      r.type === "meeting" ? "회의록" :
      r.type === "memory" ? "축적 기억" : "자료";
    const extra = r.file_name ? ` / 파일명: ${r.file_name}` : r.title ? ` / 제목: ${r.title}` : "";
    return `[${idx + 1}] ${typeLabel}
출처: ${r.source || "출처 미상"} / ${r.actor || "작성자 미상"} / ${r.created_at || "시간 미상"}${extra}
내용:
${String(r.text || "").slice(0, 1200)}`;
  }).join("\n\n");
}

async function answerFromMemory(env, userText, userId) {
  const keyword = extractSearchKeyword(userText);
  const rows = await searchMemory(env, keyword, 30);
  if (!rows.length) return `관련 기록을 찾지 못했습니다.\n검색어: ${keyword}`;
  const query =
    TONE_RULE +
    `아래는 ${BOT_OWNER_NAME}봇이 직접 수집한 ${BOT_DB_NAME}의 업무 기록입니다. 다른 봇의 DB는 참고하지 않습니다.\n\n` +
    `사용자 질문:\n${userText}\n\n검색어:\n${keyword}\n\n내부 기록:\n${buildSourceCorpus(rows)}\n\n` +
    "요약, 확인된 내용, 참고 출처, 다음 액션 순서로 답변하세요. 출처 없는 내용은 추정이라고 표시하세요.";
  const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
  return result?.answer || "검색 결과를 요약하지 못했습니다.";
}

async function getRecentContext(env, chatId, limit = 12) {
  if (!env.DB) return "";
  try {
    const result = await env.DB.prepare(`
      SELECT room_title, sender_name, content, created_at
      FROM messages
      WHERE room_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(String(chatId), limit).all();
    const rows = result.results || [];
    return rows.reverse().map((r) =>
      `출처: [${r.room_title || "대화방"}] ${r.sender_name || "이름 없음"} (${r.created_at})\n내용: ${r.content}`
    ).join("\n\n");
  } catch (e) {
    console.error("getRecentContext:", e);
    return "";
  }
}

async function getBotMemory(env, limit = 20) {
  if (!env.DB) return "";
  try {
    const facts = await env.DB.prepare(`
      SELECT fact_type, subject, content, confidence, source_room, source_actor, source_time
      FROM learned_facts
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(limit).all();
    const profiles = await env.DB.prepare(`
      SELECT profile_key, profile_value, evidence, confidence
      FROM memory_profile
      ORDER BY updated_at DESC
      LIMIT ?
    `).bind(10).all();
    const factText = (facts.results || []).map((f, idx) =>
      `[기억 ${idx + 1}] 유형: ${f.fact_type} / 대상: ${f.subject || "미상"} / 신뢰도: ${f.confidence}
내용: ${f.content}
출처: ${f.source_room || "출처 미상"} / ${f.source_actor || "작성자 미상"} / ${f.source_time || "시간 미상"}`
    ).join("\n\n");
    const profileText = (profiles.results || []).map((p, idx) =>
      `[프로필 ${idx + 1}] ${p.profile_key}: ${p.profile_value}
근거: ${p.evidence || "근거 미상"} / 신뢰도: ${p.confidence}`
    ).join("\n\n");
    return [profileText, factText].filter(Boolean).join("\n\n");
  } catch (e) {
    console.error("getBotMemory:", e);
    return "";
  }
}

async function buildSmartQuery(env, text, message) {
  const recentContext = message?.chat?.type !== "private"
    ? await getRecentContext(env, message.chat.id, 12)
    : "";
  const botMemory = await getBotMemory(env, 20);
  return TONE_RULE +
    `[봇 정체성]\n${BOT_PERSONA}입니다. ${BOT_DB_NAME}에 저장된 이 봇의 기록만 참고합니다.\n\n` +
    `[사용자 질문]\n${text}\n\n` +
    (recentContext ? `[최근 대화]\n${recentContext}\n\n` : "") +
    (botMemory ? `[축적 기억]\n${botMemory}\n\n` : "") +
    "확인된 내용과 추정을 구분하고, 내부 기록을 사용하면 출처를 표시하세요.";
}

function isActionQuery(text) {
  return /(해줘|알려줘|보여줘|정리해줘|요약해줘|찾아줘|알려주세요|해주세요|주세요|줘)$/.test(text.trim())
    || /[?？]/.test(text);
}

function isUrlText(text) {
  return /https?:\/\/[^\s]+/.test(text);
}

function parseSummaryType(text) {
  if (/(담당자|사람|누가|발신자).*요약/.test(text)) return "person";
  if (/(시간|시계열|순서|날짜).*요약/.test(text)) return "timeline";
  return "topic";
}

function parseDays(text) {
  if (/오늘/.test(text)) return 1;
  if (/이번주|이번 주|7일/.test(text)) return 7;
  if (/이번달|이번 달|한달|30일/.test(text)) return 30;
  const d = text.match(/(\d+)\s*일/);
  return d ? parseInt(d[1]) : 7;
}

function isRoomSearchQuery(text) {
  return (
    /(방|프로젝트|회의|단톡).{0,12}(에서|얘기|논의|대화|내용|정리|요약|찾)/.test(text) ||
    /무슨\s*(얘기|논의|말)/.test(text)
  );
}

function isDigestQuery(text) {
  return (
    /(오늘|어제|이번주|최근).{0,10}(공유|올라온|전달된|업로드|자료|파일)/.test(text) ||
    /(자료|파일|공유).{0,10}(정리|요약|모아)/.test(text) ||
    /공유된\s*(자료|파일|내용)/.test(text)
  );
}

async function buildDigest(env, { days = 1, keyword = null } = {}) {
  const [messages, files] = await Promise.all([
    dbSearch(env, { days, keyword }),
    dbSearchFiles(env, { days, keyword }),
  ]);
  let corpus = "";
  if (files.length > 0) {
    corpus += "=== 공유된 파일 ===\n";
    corpus += files
      .map((f) => `[${f.room_title}] ${f.sender_name}: ${f.file_name}\n요약: ${f.summary}`)
      .join("\n\n");
    corpus += "\n\n";
  }
  if (messages.length > 0) {
    corpus += "=== 관련 대화 ===\n";
    corpus += messages
      .map((r) => `[${r.room_title}] ${r.sender_name}: ${r.content}`)
      .join("\n")
      .slice(0, 4000);
  }
  return corpus.trim() || null;
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
  if (env.DB) {
    try {
      const result = await env.DB.prepare(`
        SELECT telegram_id, name, username, source, last_seen_at
        FROM users
        ORDER BY last_seen_at DESC
        LIMIT 100
      `).all();
      const rows = result.results || [];
      if (rows.length) {
        const lines = rows.map((u, idx) => {
          const username = u.username ? ` / @${u.username}` : "";
          const source = u.source ? ` / ${u.source}` : "";
          return `${idx + 1}. ${u.name || "이름 없음"} / ID: ${u.telegram_id}${username}${source}`;
        });
        await sendMessage(env, chatId, `등록된 사용자 ${rows.length}명\n\n${lines.join("\n")}`);
        return;
      }
    } catch (e) {
      console.error("handleUserList D1:", e);
    }
  }
  const list = await env.USERS.list({ prefix: "user_" });
  const users = [];
  for (const key of list.keys) {
    const raw = await env.USERS.get(key.name);
    if (!raw) continue;
    const u = JSON.parse(raw);
    if (u.name && !u.step) {
      const name = cleanName(u.name) || u.name;
      users.push(`${name} (${u.id})`);
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
      await dbRegisterRoom(env, mc.chat.id, mc.chat.title, "koh");
      await upsertRoom(env, mc.chat);
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

  await handleNewChatMembers(env, message);
  await upsertUser(env, message.from, chatType === "private" ? chatId : message.from.id, chatType === "private" ? "private_dm" : "group_message");
  if (chatType !== "private") {
    await upsertRoom(env, message.chat);
    await upsertRoomMember(env, message.chat, message.from, "message");
  }

  if (message.new_chat_members?.some((m) => m.is_bot)) {
    await saveRoom(chatId, message.chat.title, env);
    await dbRegisterRoom(env, chatId, message.chat.title, "koh");
    await upsertRoom(env, message.chat);
    await sendMessage(env, chatId, GROUP_WELCOME);
    return;
  }

  if (text.split("@")[0].trim() === "/등록") {
    await handleRegisterInstant(userId, chatId, message, env);
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

  // 이름 수정
  if (isUserUpdateQuery(text)) {
    const newName = extractNewName(text);
    if (!newName || newName.length < 2) {
      await sendMessage(
        env,
        chatId,
        "이름을 명확히 알려주세요.\n" +
        "예) 이름 권오혁으로 바꿔줘\n" +
        "예) 권오혁으로 수정해줘"
      );
      return;
    }
    const oldName = user?.name || "미등록";
    const cleaned = cleanName(newName);
    await saveUser(userId, { ...user, name: cleaned }, env);
    await sendMessage(env, chatId, `${oldName} → ${cleaned} 으로 변경했습니다.`);
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

  // 봇이 들어간 방 목록
  if (isRoomListQuery(text)) {
    const rooms = await dbGetAllRooms(env);
    if (rooms.length === 0) {
      await sendMessage(
        env,
        chatId,
        "현재 등록된 단체방이 없습니다.\n봇을 단체방에 추가하면 자동으로 등록됩니다."
      );
      return;
    }
    const lines = rooms.map((r) => r.room_title || r.room_id).join("\n");
    await sendMessage(env, chatId, `봇이 참여 중인 방 ${rooms.length}개:\n\n${lines}`);
    return;
  }

  if (isExplicitMemorySaveQuery(text)) {
    await saveExplicitMemory(env, text, message.from, chatId);
    return;
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

  if (isMemorySearchQuery(text) && env.DB) {
    const answer = await answerFromMemory(env, text, userId);
    await sendMessage(env, chatId, answer);
    return;
  }

  // 자료 digest 조회
  if (isDigestQuery(text)) {
    const days = parseDays(text);
    const corpus = await buildDigest(env, { days });
    if (!corpus) {
      await sendMessage(env, chatId, `최근 ${days}일간 공유된 자료가 없습니다.`);
      return;
    }
    const query =
      TONE_RULE +
      `다음은 최근 ${days}일간 팀에서 공유된 자료와 대화입니다. 핵심 내용을 항목별로 정리해줘.\n\n` +
      corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "정리 중 오류가 발생했습니다.");
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

  // 전체 방 통합 요약 (DM에서도 가능)
  const isAllRoomSummary =
    /(전체|모든|이번주|이번달|오늘|최근).{0,10}(요약|정리|내용|대화|자료)/.test(text) ||
    /(주제별|시계열|담당자별|시간순).*요약/.test(text);

  if (isAllRoomSummary) {
    const summaryType = parseSummaryType(text);
    const days = parseDays(text);
    const corpus = await summarizeAllRooms(env, userId, { summaryType, days, keyword: null });
    if (!corpus) {
      await sendMessage(
        env,
        chatId,
        `최근 ${days}일 내 저장된 대화가 없습니다.\n단체방에 봇이 추가되어 있어야 대화가 저장됩니다.`
      );
      return;
    }
    const typeLabel =
      summaryType === "person" ? "담당자별" : summaryType === "timeline" ? "시계열 순" : "주제별";
    const query =
      TONE_RULE +
      `다음은 최근 ${days}일간 팀 대화 기록입니다. ${typeLabel}로 핵심 내용을 요약해줘.\n\n` +
      corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.");
    return;
  }

  // URL 요약 (DM에서)
  if (isUrlText(text)) {
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      await summarizeUrl(env, urlMatch[0], userId, chatId);
      return;
    }
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

async function handleRegisterInstant(userId, chatId, message, env) {
  const tgName =
    [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim() ||
    `user_${userId}`;
  const name = cleanName(tgName) || tgName;
  const existing = await getUser(userId, env);
  await saveUser(userId, { ...(existing || {}), id: userId, name, chat_id: chatId }, env);
  await sendMessage(env, chatId, `${name}님으로 등록되었습니다.`);
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
    const query = env.DB
      ? await buildSmartQuery(env, text, { chat: { id: chatId, type: "private" } })
      : TONE_RULE + text;
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

  // 방 + 멤버십 D1 등록 (항상)
  await dbRegisterRoom(env, chatId, message.chat.title, "koh");
  await dbRegisterKohInRoom(env, chatId);
  await dbUpsertMember(env, chatId, userId, "koh");

  // 미등록자 이름 자동 저장
  if (!user) {
    const rawName =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim() ||
      `user_${userId}`;
    const tgName = cleanName(rawName) || rawName;
    await saveUser(userId, { id: userId, name: tgName, chat_id: chatId }, env);
    user = await getUser(userId, env);
  }

  // D1에 대화 저장 (항상)
  await dbInsert(env, {
    roomId:     chatId,
    roomTitle:  message.chat.title || String(chatId),
    senderId:   userId,
    senderName: user?.name || message.from?.first_name || "",
    content:    text,
    savedBy:    "koh",
  });
  await maybeLearnFromMessage(env, message);
  console.log(`[KOH DB저장] room=${message.chat.title} user=${user?.name} text=${text.slice(0, 30)}`);

  // 일정 감지 (브리핑 cron용)
  const schedule = extractSchedule(text, getTodayKST());
  if (schedule) {
    schedule.chat_id = chatId;
    await saveSchedule(env, schedule);
  }

  // 이름 밝히는 경우 자동 등록 ("구정모입니다", "저는 이동연이에요")
  const nameIntro = text.match(
    /(?:저는|나는|제?\s*이름은)?\s*([가-힣]{2,4})\s*(?:입니다|이에요|이야|예요|이라고|라고\s*해)/
  );
  if (nameIntro) {
    const introName = cleanName(nameIntro[1]);
    if (introName && introName.length >= 2) {
      const existing = await getUser(userId, env);
      await saveUser(userId, { ...(existing || {}), id: userId, name: introName, chat_id: chatId }, env);
      await sendMessage(env, chatId, `${introName}님, 반갑습니다. 무엇을 도와드릴까요?`);
      return;
    }
  }

  // 응답 조건: @멘션 OR 봇 reply OR 질문형 문장
  const botUsername = "@KOH_AI_bot";
  const isMentioned = text.includes(botUsername);
  const isReply = message.reply_to_message?.from?.is_bot === true;
  const cleanText = text.replace(botUsername, "").trim();
  const isQuestion =
    /(해줘|알려줘|보여줘|정리해줘|요약해줘|찾아줘|뭐야|어때|있어|주세요|줘)$/.test(cleanText.trim()) ||
    /[?？]/.test(cleanText);

  // @멘션이면 무조건 응답 (질문 형식 아니어도)
  if (!isMentioned && !isReply && !isQuestion) return;

  if (!cleanText) {
    await sendMessage(env, chatId, `네, ${user?.name || ""}님. 무엇을 도와드릴까요?`);
    return;
  }

  // URL 요약
  if (isUrlText(cleanText)) {
    const urlMatch = cleanText.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      await summarizeUrl(env, urlMatch[0], userId, chatId);
      return;
    }
  }

  // 전체 방 통합 요약
  const isAllRoomSummary =
    /(전체|모든|이번주|이번달|오늘|최근).{0,10}(요약|정리|내용|대화|자료)/.test(cleanText) ||
    /(주제별|시계열|담당자별|시간순).*요약/.test(cleanText);

  if (isAllRoomSummary) {
    const summaryType = parseSummaryType(cleanText);
    const days = parseDays(cleanText);
    const corpus = await summarizeAllRooms(env, userId, { summaryType, days, keyword: null });
    if (!corpus) {
      await sendMessage(env, chatId, `최근 ${days}일 내 저장된 대화가 없습니다.`);
      return;
    }
    const typeLabel =
      summaryType === "person" ? "담당자별" : summaryType === "timeline" ? "시계열 순" : "주제별";
    const query =
      TONE_RULE +
      `다음은 최근 ${days}일간 팀 대화 기록입니다. ${typeLabel}로 핵심 내용을 요약해줘.\n\n` +
      corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.");
    return;
  }

  // 특정 방/키워드 검색
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

  // 일반 응답
  const contextMsg =
    TONE_RULE +
    `[단체방: ${message.chat.title}] [발신자: ${user?.name || message.from?.first_name}]\n` +
    cleanText;
  const result = await difyChat(env, { query: contextMsg, user: userId, conversationId: "" });
  if (result.answer) await sendMessage(env, chatId, result.answer);
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

    const roomId = message.chat.id;
    const roomTitle = message.chat.title || String(chatId);
    const senderUser = await getUser(userId, env);
    const senderName = senderUser?.name || message.from?.first_name || "";

    const fileInfo = await tgGetFile(env, fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    // 이미지는 Gemini로, 문서는 Dify로 처리
    if (mimeType.startsWith("image/") && env.GEMINI_API_KEY) {
      const buffer = await fetch(fileUrl).then((r) => r.arrayBuffer());
      const answer = await analyzeImageWithClaude(env, buffer, mimeType);
      await dbSaveFile(env, { roomId, roomTitle, senderId: userId, senderName, fileName, mimeType, summary: answer, savedBy: "koh" });
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

    const summary = result.answer || "";
    await dbSaveFile(env, { roomId, roomTitle, senderId: userId, senderName, fileName, mimeType, summary, savedBy: "koh" });
    await sendMessage(env, chatId, summary || "요약 중 오류가 발생했어요.");
  } catch (e) {
    console.error("handleFile error:", e);
    await sendMessage(env, chatId, `파일 처리 오류\n${e.message}`);
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
  const schedules = await getTodaySchedules(env);
  let msg = "";

  // 어제 공유된 자료 digest → 안건·일정·요약 4섹션 브리핑
  const digest = await buildDigest(env, { days: 1 });
  if (digest) {
    try {
      const adminUser = await findAdminUser(env);
      const scheduleLines =
        schedules.length > 0
          ? schedules
              .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
              .map((s) => `${s.time} ${s.title}`)
              .join("\n")
          : "(없음)";
      const query =
        TONE_RULE +
        `당신은 권오혁 담당의 AI 비서입니다. 오늘 아침 업무 브리핑을 작성하세요.\n\n` +
        `[오늘 일정]\n${scheduleLines}\n\n` +
        `[어제 공유된 자료·대화]\n${digest}\n\n` +
        `[작성 규칙]\n` +
        `- 다음 3개 섹션으로 구성: "공유 자료 속 안건·일정", "어제 공유 안건 요약", "챙길 일정"\n` +
        `- 파일에 포함된 안건과 일정(마감·기한)을 반드시 별도로 뽑아낼 것\n` +
        `- 자료 속 일정이 있으면 캘린더 일정이 아니어도 "챙길 일정"에 표시\n` +
        `- 어제 공유 안건은 불릿 포인트(·)로 핵심만, 어느 방에서 나왔는지 표시\n` +
        `- 마크다운 기호(*, #) 없이 순수 텍스트, 이모티콘으로 섹션 구분\n` +
        `- 전체 700자 이내, 실무적으로`;
      const result = await difyChat(env, {
        query,
        user: String(adminUser?.id || "admin"),
        conversationId: "",
      });
      if (result.answer) msg = result.answer;
    } catch (e) {
      console.error("digest in briefing:", e);
    }
  }

  // digest 없을 때 일정만 표시
  if (!msg && schedules.length > 0) {
    const sorted = schedules.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const lines = sorted.map((s) => `${s.time} ${s.title}`).join("\n");
    msg = `📅 오늘의 주요 일정\n\n${lines}`;
  }

  if (!msg) return;

  const adminUser = await findAdminUser(env);
  const targetChatId = env.ADMIN_TELEGRAM_ID || adminUser?.chat_id;
  if (targetChatId) {
    await sendMessage(env, targetChatId, msg);
  }
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
  const clean = stripMarkdown(text).slice(0, 3900);
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: clean }),
  });
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/__(.*?)__/gs, "$1")
    .replace(/`{1,3}([\s\S]*?)`{1,3}/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
