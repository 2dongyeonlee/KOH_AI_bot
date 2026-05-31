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

const PRIVATE_WELCOME =
  "안녕하세요. 저는 권오혁 담당님의 AI 비서 권오혁(A)입니다.\n" +
  "권오혁 담당님께 전달할 내용이 있으시면 말씀해 주세요.\n" +
  "/등록 으로 성함을 등록하시면 더 원활하게 소통할 수 있습니다.";

const GROUP_WELCOME =
  "안녕하세요. 저는 권오혁 담당님의 AI 비서 권오혁(A)입니다.\n" +
  "원활한 소통을 위해 구성원 여러분의 성함을 등록해 주세요.\n" +
  "/등록 을 입력하시면 등록됩니다.";

// ─────────────────────────────────────────────
// 진입점
// ─────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK");
    }
    try {
      const update = await request.json();
      await handleUpdate(update, env);
    } catch (e) {
      console.error("handleUpdate error:", e);
    }
    return new Response("OK");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyBriefing(env));
  },
};

// ─────────────────────────────────────────────
// KV 유저 헬퍼
// ─────────────────────────────────────────────
async function getUser(userId, env) {
  const raw = await env.USERS.get(`user_${userId}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveUser(userId, data, env) {
  await env.USERS.put(`user_${userId}`, JSON.stringify(data));
}

async function findAdminUser(env) {
  // ADMIN_TELEGRAM_ID 환경변수로 조회
  if (env.ADMIN_TELEGRAM_ID) {
    const raw = await env.USERS.get(`user_${env.ADMIN_TELEGRAM_ID}`);
    if (raw) return JSON.parse(raw);
  }
  // KV 리스트에서 name이 ADMIN_NAME인 유저 탐색
  const list = await env.USERS.list({ prefix: "user_" });
  for (const key of list.keys) {
    const raw = await env.USERS.get(key.name);
    if (!raw) continue;
    const u = JSON.parse(raw);
    if (u.name === ADMIN_NAME) return u;
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

// ─────────────────────────────────────────────
// KV 룸 헬퍼
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// KV 일정 헬퍼
// ─────────────────────────────────────────────
function getTodayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function saveSchedule(env, schedule) {
  const dateKey = schedule.date.replace(/-/g, ""); // YYYYMMDD
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

// ─────────────────────────────────────────────
// 일정 감지 (regex 기반)
// ─────────────────────────────────────────────
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

// 전달 요청 패턴 감지
function isForwardRequest(text) {
  return /전달|전해|알려|보내/.test(text);
}

// ─────────────────────────────────────────────
// 메인 라우팅
// ─────────────────────────────────────────────
async function handleUpdate(update, env) {
  // 봇이 그룹에 추가됨 (my_chat_member)
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
  const chatType = message.chat.type; // "private" | "group" | "supergroup"
  const text = message.text || message.caption || "";
  const hasFile = !!(message.document || message.photo);

  // 봇이 그룹에 추가됨 (new_chat_members)
  if (message.new_chat_members?.some((m) => m.is_bot)) {
    await saveRoom(chatId, message.chat.title, env);
    await sendMessage(env, chatId, GROUP_WELCOME);
    return;
  }

  // /등록 명령어 (1:1 + 그룹 공통)
  if (text.split("@")[0].trim() === "/등록") {
    await handleRegisterStep1(userId, chatId, env);
    return;
  }

  // 등록 플로우 대기 중
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
    await handlePrivateMessage(message, userId, chatId, text, hasFile, user, env);
  } else {
    await handleGroupMessage(message, userId, chatId, text, hasFile, user, env);
  }
}

// ─────────────────────────────────────────────
// 1:1 개인 채팅 처리
// ─────────────────────────────────────────────
async function handlePrivateMessage(message, userId, chatId, text, hasFile, user, env) {
  // 첫 메시지 시 안내 (user가 없거나 step 상태인 경우 = 처음)
  const isFirstContact = !user || user.step === "waiting_name" || user.step === "waiting_team";

  if (hasFile) {
    const isRegistered = !!(user?.name);
    if (isRegistered) {
      const isAdmin = await checkIsAdmin(userId, env);
      await handleFile(message, userId, chatId, isAdmin, env);
    } else {
      if (isFirstContact) await sendMessage(env, chatId, PRIVATE_WELCOME);
      await sendMessage(env, chatId, "/등록 으로 성함을 등록하시면 더 원활하게 소통할 수 있습니다.");
    }
    return;
  }

  if (!text.trim()) return;

  // 첫 접촉 안내
  if (isFirstContact) {
    await sendMessage(env, chatId, PRIVATE_WELCOME);
  }

  // 전달 요청 감지 → 권오혁님에게 포워딩
  if (isForwardRequest(text)) {
    const admin = await findAdminUser(env);
    if (admin?.chat_id) {
      const senderName = user?.name || `ID:${userId}`;
      await sendMessage(env, admin.chat_id, `${senderName}님이 전달: ${text}`);
      await sendMessage(env, chatId, "권오혁 담당님께 전달하였습니다.");
      return;
    }
  }

  // 1:1은 누구든 Dify 답변 전송
  await handleUserMessage(userId, chatId, text.trim(), true, env);
}

// ─────────────────────────────────────────────
// 그룹방 처리
// ─────────────────────────────────────────────
async function handleGroupMessage(message, userId, chatId, text, hasFile, user, env) {
  const isRegistered = !!(user?.name);

  if (hasFile) {
    if (isRegistered) {
      const isAdmin = await checkIsAdmin(userId, env);
      await handleFile(message, userId, chatId, isAdmin, env);
    } else {
      await sendMessage(env, chatId, "/등록 명령어로 먼저 등록해 주세요.");
    }
    return;
  }

  if (!text.trim()) return;

  if (!isRegistered) {
    await sendMessage(env, chatId, "/등록 명령어로 먼저 등록해 주세요.");
    return;
  }

  // 일정 감지
  const schedule = extractSchedule(text, getTodayKST());
  if (schedule) {
    schedule.chat_id = chatId;
    await saveSchedule(env, schedule);
  }

  // 모든 메시지 Dify 전송; name이 '권오혁'인 경우만 답변 반환
  const sendReply = user?.name === ADMIN_NAME;
  await handleUserMessage(userId, chatId, text.trim(), sendReply, env);
}

// ─────────────────────────────────────────────
// 등록 Step 1: /등록 입력
// ─────────────────────────────────────────────
async function handleRegisterStep1(userId, chatId, env) {
  await saveUser(userId, { id: userId, step: "waiting_name" }, env);
  await sendMessage(env, chatId, "성함을 입력해 주세요.");
}

// ─────────────────────────────────────────────
// 등록 Step 2: 이름 입력
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// 등록 Step 3: 조직/담당 입력 완료
// ─────────────────────────────────────────────
async function handleRegisterStep3(userId, chatId, input, env) {
  const user = await getUser(userId, env);
  const parts = input.split("/").map((s) => s.trim());
  const team = parts[0] || input.trim();
  const role = parts[1] || "";
  await saveUser(userId, { id: userId, name: user.name, team, role, chat_id: user.chat_id }, env);
  const suffix = role ? ` (${team} / ${role})` : ` (${team})`;
  await sendMessage(env, chatId, `등록 완료되었습니다. ${user.name}님${suffix}.`);
}

// ─────────────────────────────────────────────
// 사용자 메시지 → Dify 전송
// ─────────────────────────────────────────────
async function handleUserMessage(userId, chatId, text, sendReply, env) {
  try {
    const conversationId = (await env.CONVERSATIONS.get(`conv_${userId}`)) || "";
    const query = TONE_RULE + text;
    let result;

    try {
      result = await difyChat(env, { query, user: userId, conversationId });
    } catch (e) {
      if (e.message.includes("not_found") || e.message.includes("Conversation Not Exists")) {
        await env.CONVERSATIONS.delete(`conv_${userId}`);
        result = await difyChat(env, { query, user: userId, conversationId: "" });
      } else {
        throw e;
      }
    }

    if (result.conversation_id) {
      await env.CONVERSATIONS.put(`conv_${userId}`, result.conversation_id);
    }

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

// ─────────────────────────────────────────────
// 파일 요약
// ─────────────────────────────────────────────
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
    const fileBlob = await fetch(fileUrl).then((r) => r.blob());

    const uploaded = await difyUploadFile(env, fileBlob, fileName, mimeType, userId);
    if (!uploaded.id) throw new Error("Dify 파일 업로드 실패: " + JSON.stringify(uploaded));

    const conversationId = isAdmin
      ? (await env.CONVERSATIONS.get(`conv_${userId}`)) || ""
      : "";

    const filePayload = {
      query: TONE_RULE + SUMMARY_PROMPT,
      user: userId,
      files: [
        {
          type: difyFileType(mimeType),
          transfer_method: "local_file",
          upload_file_id: uploaded.id,
        },
      ],
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

// ─────────────────────────────────────────────
// 일일 브리핑 (cron: UTC 23:00 = KST 08:00)
// ─────────────────────────────────────────────
async function sendDailyBriefing(env) {
  const today = getTodayKST(); // YYYY-MM-DD
  const schedules = await getTodaySchedules(env);
  if (schedules.length === 0) return; // 일정 없으면 발송 안 함

  const sorted = schedules.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const lines = sorted.map((s) => `${s.time} ${s.title}`).join("\n");
  const msg = `📅 오늘의 주요 일정\n\n${lines}`;

  const rooms = await getAllRooms(env);
  await Promise.all(rooms.map((r) => sendMessage(env, r.id, msg)));
}

// ─────────────────────────────────────────────
// Dify API (streaming — Agent 앱 전용)
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Telegram API
// ─────────────────────────────────────────────
async function tgGetFile(env, fileId) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const data = await res.json();
  return data.result;
}

async function sendMessage(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
