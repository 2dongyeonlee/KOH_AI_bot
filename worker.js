const DIFY_API_URL = "https://api.dify.ai/v1";
const SUMMARY_PROMPT =
  "[요약 응답 규칙]\n" +
  "- 답변은 보고 메모체로 작성합니다.\n" +
  "- 문장 끝은 가급적 '~임', '~필요', '~확인 필요' 형식으로 작성합니다.\n" +
  "다음 파일 내용을 업무 보고 메모체로 정리해줘.\n" +
  "구성: 핵심 내용 / 안건 / 일정 / 확인할 일.";
const TONE_RULE =
  "[응답 규칙: 존댓말 격식체 사용. ^^ 이모티콘 사용 금지. 불필요한 감탄사 사용 금지.]\n\n";
const SUMMARY_TONE_RULE =
  "[요약 응답 규칙]\n" +
  "- 답변은 보고 메모체로 작성합니다.\n" +
  "- 문장 끝은 가급적 '~임', '~필요', '~확인 필요', '~예상' 형식으로 작성합니다.\n" +
  "- 불필요한 인사말과 장황한 배경 설명은 생략합니다.\n" +
  "- 최대 5개 안건으로 압축합니다.\n" +
  "- 각 안건은 현상, 의미, 확인할 일, 출처 중심으로 작성합니다.\n" +
  "- 출처가 없으면 확인 필요로 표시합니다.\n" +
  "- 마크다운 강조 기호는 사용하지 않습니다.\n\n";
const ADMIN_NAME = "권오혁";
const BOT_OWNER_NAME = "권오혁";
const BOT_OWNER_ROLE = "6R전략담당";
const BOT_PERSONA = "권오혁 담당님의 개인 업무 비서 AI OS";
const BOT_DB_NAME = "6r-ai-db";
const BOT_KEY = "koh";
const BOT_USERNAME = "KOH_AI_bot";
const OWNER_ALIASES = ["권오혁", "오혁", "권 담당", "권오혁 담당", "권오혁 담당님", "권 담당님"];
const OWNER_AUTO_CONFIRM_SCORE = 90;
const OWNER_REVIEW_SCORE = 60;
const ALLOWED_NAMES = new Set([
  "권오혁", "염성진", "황무연", "함동균",
  "손경배", "한혜승", "박호현", "양서진", "원정호",
]);

const PRIVATE_GREETING =
  "";

const GROUP_WELCOME =
  "";

function getSenderName(from) {
  if (!from) return "이름 없음";
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return full || from.username || String(from.id || "이름 없음");
}

function getForwardLabel(message) {
  if (message.forward_sender_name) return `Forwarded from ${message.forward_sender_name}`;
  if (message.forward_from) return `Forwarded from ${getSenderName(message.forward_from)}`;
  if (message.forward_origin?.sender_user) return `Forwarded from ${getSenderName(message.forward_origin.sender_user)}`;
  if (message.forward_origin?.sender_user_name) return `Forwarded from ${message.forward_origin.sender_user_name}`;
  return "";
}

function getMessageTextForStorage(message) {
  const rawText = message?.text || message?.caption || "";
  const forwardLabel = getForwardLabel(message || {});
  return forwardLabel && rawText ? `[${forwardLabel}]\n${rawText}` : rawText;
}

function getBotUsernames(env) {
  const names = [];
  if (env.BOT_USERNAME) names.push(env.BOT_USERNAME.replace("@", "").toLowerCase());
  if (typeof BOT_USERNAME !== "undefined" && BOT_USERNAME) names.push(BOT_USERNAME.replace("@", "").toLowerCase());
  return [...new Set(names)];
}

function textMentionsThisBot(text, env) {
  const lower = String(text || "").toLowerCase();
  return getBotUsernames(env).some((name) => lower.includes(`@${name}`));
}

function textMentionsOtherKnownBot(text, env) {
  const lower = String(text || "").toLowerCase();
  const current = getBotUsernames(env);
  const known = ["dylee_ai_bot", "koh_ai_bot", "KOH_AI_bot"].map((x) => x.toLowerCase());
  return known.some((name) => lower.includes(`@${name}`) && !current.includes(name));
}

function isReplyToThisBot(message, env) {
  const replyUser = message?.reply_to_message?.from;
  if (!replyUser?.is_bot) return false;
  return getBotUsernames(env).includes(String(replyUser.username || "").toLowerCase());
}

function shouldRespondInGroup(message, text, env) {
  if (!message?.chat || message.chat.type === "private") return true;
  if (textMentionsOtherKnownBot(text, env)) return false;
  if (textMentionsThisBot(text, env)) return true;
  if (isReplyToThisBot(message, env)) return true;
  return /봇아|비서야|요약해줘|정리해줘|알려줘|찾아줘|전달해줘|전해줘|보고내용|확인해야\s*할\s*안건|확인해야할\s*안건/.test(text || "");
}

function cleanBotMention(text, env) {
  let cleaned = String(text || "");
  for (const name of getBotUsernames(env)) {
    cleaned = cleaned.replace(new RegExp(`@${name}`, "ig"), "");
  }
  return cleaned.trim();
}

function isLongSharedContent(text) {
  const t = String(text || "").trim();
  if (t.length < 250) return false;
  return !/(요약|정리|찾아|알려|분석|뭐야|어떻게|왜|해줘|해 줘)/.test(t);
}

function looksLikeBareKoreanName(text) {
  return /^[가-힣]{2,4}$/.test(String(text || "").trim());
}

async function maybeUpdateUserDisplayNameFromBareName(env, message) {
  if (!env.DB || !message?.from?.id || !looksLikeBareKoreanName(message.text || "")) return;
  await env.DB.prepare(`
    UPDATE users
    SET name = ?, source = 'bare_name_message', last_seen_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(String(message.text).trim(), String(message.from.id)).run();
}

function isRegisterCommand(text) {
  return /^\/등록\b/.test(String(text || "").trim());
}

async function handleRegisterCommand(env, chatId, from) {
  await upsertUser(env, from, chatId, "manual_register");
  await sendMessage(env, chatId, `${getSenderName(from)}님으로 자동 등록되어 있습니다.\n텔레그램 ID: ${from.id}`);
}

function parseOwnerConfirmCommand(text) {
  const m = String(text || "").trim().match(/^\/owner_confirm\s+(\d+)/);
  return m ? m[1] : null;
}

function parseOwnerRejectCommand(text) {
  const m = String(text || "").trim().match(/^\/owner_reject\s+(\d+)/);
  return m ? m[1] : null;
}

function isOwnerStatusQuery(text) {
  return /(주인|owner).{0,10}(상태|등록|확인|누구|뭐야|알려)|누구\s*봇|누구의\s*비서|담당자.{0,10}(누구|뭐야|알려)/i.test(text || "");
}

async function handleLongSharedContent(env, chatId, message) {
  await maybeLearnFromMessage(env, message);
  await sendMessage(
    env,
    chatId,
    "공유해주신 내용을 주요 업무 참고자료로 저장해두겠습니다.\n나중에 관련 안건을 물어보시면 출처와 함께 다시 정리해드릴 수 있습니다."
  );
}

function normalizeKoreanText(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/[()\/\-_. ,:;~!@#$%^&*+=?]/g, "")
    .toLowerCase();
}

function includesOwnerAlias(text) {
  const normalized = normalizeKoreanText(text);
  return OWNER_ALIASES.some((alias) => normalized.includes(normalizeKoreanText(alias)));
}

async function getStoredOwnerTelegramId(env) {
  if (!env.DB) return "";
  try {
    const row = await env.DB.prepare(`
      SELECT profile_value
      FROM memory_profile
      WHERE profile_key = 'bot_owner_telegram_id'
      LIMIT 1
    `).first();
    return row?.profile_value ? String(row.profile_value) : "";
  } catch (e) {
    console.error("getStoredOwnerTelegramId:", e);
    return "";
  }
}

async function getOwnerTelegramId(env) {
  const fromEnv = String(env.BOT_OWNER_TELEGRAM_ID || "").trim();
  if (fromEnv) return fromEnv;
  return await getStoredOwnerTelegramId(env);
}

async function isBotOwner(env, from) {
  if (!from?.id) return false;
  const ownerId = await getOwnerTelegramId(env);
  return !!ownerId && String(from.id) === String(ownerId);
}

async function ensureOwnerProfile(env) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      INSERT INTO memory_profile (profile_key, profile_value, evidence, confidence)
      VALUES ('bot_owner_name', ?, ?, 5)
      ON CONFLICT(profile_key) DO UPDATE SET
        profile_value = excluded.profile_value,
        evidence = excluded.evidence,
        confidence = 5,
        updated_at = CURRENT_TIMESTAMP
    `).bind(BOT_OWNER_NAME, "코드 상수 BOT_OWNER_NAME").run();
    await env.DB.prepare(`
      INSERT INTO memory_profile (profile_key, profile_value, evidence, confidence)
      VALUES ('bot_owner_role', ?, ?, 5)
      ON CONFLICT(profile_key) DO UPDATE SET
        profile_value = excluded.profile_value,
        evidence = excluded.evidence,
        confidence = 5,
        updated_at = CURRENT_TIMESTAMP
    `).bind(BOT_OWNER_ROLE, "코드 상수 BOT_OWNER_ROLE").run();
  } catch (e) {
    console.error("ensureOwnerProfile:", e);
  }
}

function getOwnerCandidateScore(message) {
  const from = message?.from || {};
  const text = message?.text || message?.caption || "";
  const firstName = from.first_name || "";
  const lastName = from.last_name || "";
  const username = from.username || "";
  const fullName = [firstName, lastName].filter(Boolean).join("");
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
  let score = 0;
  const evidence = [];

  if (normalizeKoreanText(fullName) === normalizeKoreanText(BOT_OWNER_NAME)) {
    score += 60;
    evidence.push("telegram_name_exact_owner");
  } else if (includesOwnerAlias(fullName) || includesOwnerAlias(displayName)) {
    score += 45;
    evidence.push("telegram_name_contains_owner_alias");
  }
  if (includesOwnerAlias(username)) {
    score += 20;
    evidence.push("username_contains_owner_alias");
  }
  if (includesOwnerAlias(text)) {
    score += 25;
    evidence.push("message_contains_owner_alias");
  }
  if (/(6R전략담당|6R전략|담당\s*\/\s*권오혁|권오혁\s*담당)/.test(text)) {
    score += 35;
    evidence.push("message_contains_owner_role");
  }
  if (message?.chat?.type === "private") {
    score += 20;
    evidence.push("private_dm_to_bot");
  }
  return {
    score,
    evidence,
    displayName: displayName || username || String(from.id || ""),
    username,
  };
}

async function upsertOwnerCandidate(env, message) {
  if (!env.DB || !message?.from?.id) return null;
  if (await getOwnerTelegramId(env)) return null;
  const { score, evidence, displayName, username } = getOwnerCandidateScore(message);
  if (score <= 0) return null;
  const telegramId = String(message.from.id);
  const prev = await env.DB.prepare(`
    SELECT score, evidence_json, status
    FROM owner_candidates
    WHERE telegram_id = ?
  `).bind(telegramId).first();
  let prevEvidence = [];
  try {
    prevEvidence = prev?.evidence_json ? JSON.parse(prev.evidence_json) : [];
  } catch (_) {
    prevEvidence = [];
  }
  const mergedEvidence = Array.from(new Set([...prevEvidence, ...evidence]));
  const newScore = Math.min(100, Math.max(score, Number(prev?.score || 0) + Math.min(score, 30)));
  const status =
    newScore >= OWNER_AUTO_CONFIRM_SCORE ? "confirmed" :
    newScore >= OWNER_REVIEW_SCORE ? "needs_review" : "candidate";

  await env.DB.prepare(`
    INSERT INTO owner_candidates
      (telegram_id, name, username, score, evidence_json, status, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      name = excluded.name,
      username = excluded.username,
      score = excluded.score,
      evidence_json = excluded.evidence_json,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    telegramId,
    displayName,
    username || "",
    newScore,
    JSON.stringify(mergedEvidence),
    status
  ).run();
  return { telegramId, name: displayName, username, score: newScore, evidence: mergedEvidence, status };
}

async function confirmOwner(env, candidate, reason = "auto_confirm") {
  if (!env.DB || !candidate?.telegramId) return;
  if (await getOwnerTelegramId(env)) return;
  await env.DB.prepare(`
    INSERT INTO memory_profile (profile_key, profile_value, evidence, confidence)
    VALUES ('bot_owner_telegram_id', ?, ?, 5)
    ON CONFLICT(profile_key) DO UPDATE SET
      profile_value = excluded.profile_value,
      evidence = excluded.evidence,
      confidence = 5,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    String(candidate.telegramId),
    `${reason}: ${candidate.name || ""} / evidence=${JSON.stringify(candidate.evidence || [])}`
  ).run();
  await env.DB.prepare(`
    UPDATE owner_candidates
    SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(String(candidate.telegramId)).run();
  await ensureOwnerProfile(env);
}

async function notifyOwnerCandidateForReview(env, candidate) {
  if (!env.DB || !env.ADMIN_TELEGRAM_ID || !candidate || candidate.status !== "needs_review") return;
  const key = `owner_review_notified_${candidate.telegramId}`;
  const already = await env.DB.prepare(`
    SELECT profile_value
    FROM memory_profile
    WHERE profile_key = ?
  `).bind(key).first();
  if (already) return;
  const msg =
    `주인 후보 확인이 필요합니다.\n\n` +
    `봇: ${BOT_OWNER_NAME}봇\n` +
    `후보: ${candidate.name || "이름 없음"}\n` +
    `Telegram ID: ${candidate.telegramId}\n` +
    `점수: ${candidate.score}\n` +
    `근거: ${(candidate.evidence || []).join(", ")}\n\n` +
    `맞으면 다음 명령을 보내세요.\n` +
    `/owner_confirm ${candidate.telegramId}\n\n` +
    `아니면 다음 명령을 보내세요.\n` +
    `/owner_reject ${candidate.telegramId}`;
  await sendMessage(env, env.ADMIN_TELEGRAM_ID, msg);
  await env.DB.prepare(`
    INSERT INTO memory_profile (profile_key, profile_value, evidence, confidence)
    VALUES (?, '1', ?, 5)
  `).bind(key, "owner candidate review notification sent").run();
}

async function maybeDetectBotOwner(env, message) {
  try {
    if (await getOwnerTelegramId(env)) return;
    const candidate = await upsertOwnerCandidate(env, message);
    if (!candidate) return;
    if (candidate.status === "confirmed") {
      await confirmOwner(env, candidate, "auto_high_confidence");
      return;
    }
    if (candidate.status === "needs_review") {
      await notifyOwnerCandidateForReview(env, candidate);
    }
  } catch (e) {
    console.error("maybeDetectBotOwner:", e);
  }
}

async function handleOwnerConfirmReject(env, chatId, from, text) {
  if (!env.DB) return false;
  const isAdmin = String(from?.id || "") === String(env.ADMIN_TELEGRAM_ID || "");
  if (!isAdmin) return false;

  const confirmId = parseOwnerConfirmCommand(text);
  if (confirmId) {
    const candidate = await env.DB.prepare(`
      SELECT telegram_id, name, username, score, evidence_json
      FROM owner_candidates
      WHERE telegram_id = ?
    `).bind(confirmId).first();
    if (!candidate) {
      await sendMessage(env, chatId, "해당 owner 후보를 찾지 못했습니다.");
      return true;
    }
    let evidence = [];
    try {
      evidence = candidate.evidence_json ? JSON.parse(candidate.evidence_json) : [];
    } catch (_) {}
    await confirmOwner(env, {
      telegramId: candidate.telegram_id,
      name: candidate.name,
      username: candidate.username,
      score: candidate.score,
      evidence,
    }, "manual_admin_confirm");
    await sendMessage(env, chatId, `${BOT_OWNER_NAME}봇 주인을 확정했습니다.\nTelegram ID: ${confirmId}`);
    return true;
  }

  const rejectId = parseOwnerRejectCommand(text);
  if (rejectId) {
    await env.DB.prepare(`
      UPDATE owner_candidates
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(rejectId).run();
    await sendMessage(env, chatId, `owner 후보를 제외했습니다.\nTelegram ID: ${rejectId}`);
    return true;
  }
  return false;
}

async function handleOwnerStatus(env, chatId) {
  const ownerId = await getOwnerTelegramId(env);
  if (ownerId) {
    await sendMessage(
      env,
      chatId,
      `이 봇은 ${BOT_OWNER_NAME}님의 개인 업무 비서입니다.\n역할 기준: ${BOT_OWNER_ROLE}\nOwner Telegram ID: ${ownerId}\n사용 DB: ${BOT_DB_NAME}`
    );
    return;
  }
  const candidates = await env.DB.prepare(`
    SELECT telegram_id, name, username, score, status, evidence_json
    FROM owner_candidates
    ORDER BY score DESC, updated_at DESC
    LIMIT 5
  `).all();
  const rows = candidates.results || [];
  if (!rows.length) {
    await sendMessage(
      env,
      chatId,
      `아직 ${BOT_OWNER_NAME}님으로 확정된 owner가 없습니다.\n후보도 없습니다.\n권오혁님이 이 봇에 1:1 메시지를 보내거나 단체방에서 발화하면 자동 후보로 잡힙니다.`
    );
    return;
  }
  const lines = rows.map((c, idx) =>
    `${idx + 1}. ${c.name || "이름 없음"} / ID: ${c.telegram_id} / 점수: ${c.score} / 상태: ${c.status}`
  );
  await sendMessage(env, chatId, `아직 owner가 확정되지 않았습니다.\n\nowner 후보:\n${lines.join("\n")}`);
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
async function dbInsert(env, { roomId, roomTitle, senderId, senderName, content, savedBy, telegramMessageId = "", sourceType = "" }) {
  if (!env.DB || !content?.trim()) return;
  try {
    await env.DB.prepare(
      `INSERT INTO messages
         (telegram_message_id, room_id, room_title, sender_id, sender_name, content, saved_by, source_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        String(telegramMessageId || ""),
        String(roomId),
        roomTitle || "",
        String(senderId),
        senderName || "",
        content.slice(0, 4000),
        savedBy || "koh",
        sourceType || "telegram_group"
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

function isExternalSearchEnabled(env) {
  return String(env.EXTERNAL_SEARCH_ENABLED || "").toLowerCase() === "true";
}

function hasTavilyConfig(env) {
  return !!env.TAVILY_API_KEY;
}

function extractUrls(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>)"]+/g);
  if (!matches) return [];
  return [...new Set(matches.map((u) => u.replace(/[.,)]$/, "")))];
}

function hasUrl(text) {
  return extractUrls(text).length > 0;
}

function isUrlSummaryQuery(text) {
  return hasUrl(text) && /(요약|정리|무슨\s*내용|핵심|참고|분석|봐줘|읽어줘|이해|설명)/.test(text || "");
}

function needsExternalSearch(text) {
  const t = String(text || "");
  if (hasUrl(t)) return false;
  return /(뉴스|기사|최신|최근\s*동향|외부\s*자료|참고\s*자료|검색해|찾아봐|웹에서|인터넷|URL|링크|근거|출처|잘\s*이해가\s*안|이해가\s*안|무슨\s*말인지|관련\s*자료|비슷한\s*사례|시장\s*동향|정책\s*동향|해외\s*동향|레퍼런스|reference)/i.test(t);
}

function buildExternalSearchQuery(text) {
  return String(text || "")
    .replace(/뉴스|기사|최신|최근\s*동향|외부\s*자료|참고\s*자료|검색해줘|검색해|찾아봐|찾아줘|웹에서|인터넷|근거|출처|이해가\s*안|관련\s*자료|레퍼런스|reference/g, " ")
    .replace(/https?:\/\/[^\s<>)"]+/g, " ")
    .replace(/[^\w가-힣A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function searchTavily(env, query, options = {}) {
  const maxResults = typeof options === "number" ? options : (options.maxResults || 5);
  const searchDepth = typeof options === "object" ? (options.searchDepth || "basic") : "basic";
  if (!isExternalSearchEnabled(env)) throw new Error("EXTERNAL_SEARCH_ENABLED is not true");
  if (!hasTavilyConfig(env)) throw new Error("TAVILY_API_KEY is missing");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tavily API ${res.status}: ${JSON.stringify(data)}`);
  return (data.results || []).map((item) => ({
    provider: "tavily",
    title: item.title || "",
    url: item.url || "",
    snippet: item.content || "",
    score: item.score || 0,
  }));
}

async function extractWithTavily(env, url) {
  if (!isExternalSearchEnabled(env) || !hasTavilyConfig(env)) throw new Error("Tavily API key is not configured");
  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ urls: [url], extract_depth: "basic", include_images: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tavily extract failed: ${JSON.stringify(data)}`);
  const item = data.results?.[0] || data.response?.[0] || null;
  if (!item) throw new Error("Tavily extract returned no result");
  return { url, title: item.title || "", text: item.raw_content || item.content || "", provider: "tavily_extract" };
}

function cleanHtmlText(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToPlainText(html) {
  return cleanHtmlText(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

async function fetchUrlContent(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 AI-Bot-Assistant/1.0" },
  });
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) throw new Error(`URL fetch failed: ${res.status}`);
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    return { url, title: "", text: "", contentType, unsupported: true, provider: "worker_fetch" };
  }
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    url,
    title: titleMatch ? cleanHtmlText(titleMatch[1]).slice(0, 200) : "",
    text: htmlToPlainText(html).slice(0, 12000),
    contentType,
    unsupported: false,
    provider: "worker_fetch",
  };
}

async function extractUrlContent(env, url) {
  if (isExternalSearchEnabled(env) && hasTavilyConfig(env)) {
    try {
      const result = await extractWithTavily(env, url);
      if (result.text?.trim()) return result;
    } catch (error) {
      console.error("Tavily extract failed, fallback to Worker fetch", String(error?.message || error));
    }
  }
  return await fetchUrlContent(url);
}

async function saveExternalSource(env, row) {
  if (!env.DB) return;
  await env.DB.prepare(`
    INSERT INTO external_sources
      (source_type, query, url, title, snippet, extracted_text, summary, provider)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    row.source_type || "",
    row.query || "",
    row.url || "",
    row.title || "",
    row.snippet || "",
    row.extracted_text || "",
    row.summary || "",
    row.provider || ""
  ).run();
}

async function summarizeUrl(env, url, userText, userId) {
  const content = await extractUrlContent(env, url);
  if (content.unsupported || !content.text) {
    const summary = `이 URL은 현재 직접 본문 추출이 어렵습니다. Content-Type: ${content.contentType || "unknown"}`;
    await saveExternalSource(env, { source_type: "url", query: userText, url, title: content.title || "", summary, provider: content.provider || "url" });
    return { url, title: content.title || "", summary, unsupported: true };
  }
  const query =
    SUMMARY_TONE_RULE +
    `[요청]\n사용자가 전달한 URL 내용을 요약해줘.\n\n` +
    `[사용자 질문]\n${userText}\n\n` +
    `[URL]\n${url}\n\n` +
    `[페이지 제목]\n${content.title || "제목 없음"}\n\n` +
    `[본문]\n${content.text.slice(0, 10000)}\n\n` +
    `[작성 지침]\n1. 핵심 내용을 5줄 이내로 요약합니다.\n2. 업무적으로 참고할 점을 2개 이내로 정리합니다.\n3. 출처 URL을 반드시 표시합니다.\n4. 본문에 없는 내용은 추정하지 않습니다.\n5. 마크다운 기호는 쓰지 않습니다.`;
  const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
  const summary = result?.answer || "URL 요약을 생성하지 못했습니다.";
  await saveExternalSource(env, {
    source_type: "url",
    query: userText,
    url,
    title: content.title || "",
    extracted_text: content.text.slice(0, 12000),
    summary,
    provider: content.provider || "url",
  });
  return { url, title: content.title || "", summary, unsupported: false };
}

async function answerUrlSummary(env, text, userId) {
  const results = [];
  for (const url of extractUrls(text).slice(0, 3)) {
    try {
      results.push(await summarizeUrl(env, url, text, userId));
    } catch (error) {
      results.push({ url, title: "", summary: `URL을 읽지 못했습니다. 사유: ${String(error?.message || error)}`, unsupported: true });
    }
  }
  return results.map((r, idx) => `${idx + 1}. ${r.title || "URL 요약"}\n${r.summary}\n출처: ${r.url}`).join("\n\n");
}

async function saveExternalSearchResults(env, query, results) {
  if (!env.DB || !results?.length) return;
  for (const r of results) {
    await saveExternalSource(env, {
      source_type: "search",
      query,
      url: r.url || "",
      title: r.title || "",
      snippet: r.snippet || "",
      provider: r.provider || "tavily",
    });
  }
}

function buildExternalCorpus(results) {
  return (results || []).map((r, idx) =>
    `[외부자료 ${idx + 1}]\n제목: ${r.title || "제목 없음"}\n요약: ${r.snippet || "요약 없음"}\nURL: ${r.url || ""}\n제공: ${r.provider || "external"}`
  ).join("\n\n");
}

async function answerExternalSearchNotConfigured(env, text) {
  const internalKeyword = extractSearchKeyword(text);
  const internalRows = await searchMemory(env, internalKeyword, 20);
  const internalCorpus = buildSourceCorpus(internalRows);
  if (internalRows.length) {
    return `외부검색 미설정 상태라 내부 기록 기준으로만 확인했습니다.\n\n${internalCorpus.slice(0, 2500)}\n\n외부검색을 사용하려면 Cloudflare에 EXTERNAL_SEARCH_ENABLED=true와 TAVILY_API_KEY를 설정해야 합니다.`;
  }
  return "외부검색 미설정 상태입니다.\n\n필요 설정:\n1. Cloudflare Secret TAVILY_API_KEY 등록\n2. EXTERNAL_SEARCH_ENABLED=true 설정\n\n현재는 내부 D1 기록만 검색할 수 있습니다.";
}

async function answerWithExternalSearch(env, text, userId) {
  const internalKeyword = extractSearchKeyword(text);
  const searchQuery = buildExternalSearchQuery(text) || internalKeyword;
  try {
    const internalRows = await searchMemory(env, internalKeyword, 20);
    const internalCorpus = buildSourceCorpus(internalRows);
    const externalResults = await searchTavily(env, searchQuery, { maxResults: 5, searchDepth: "basic" });
    await saveExternalSearchResults(env, searchQuery, externalResults);
    if (!externalResults.length && !internalRows.length) {
      return `내부 기록과 외부 검색 모두에서 충분한 자료를 찾지 못했음.\n\n- 검색어: ${searchQuery}\n- 확인 필요: /web_test ${searchQuery}`;
    }
    const query =
      SUMMARY_TONE_RULE +
      `[사용자 질문]\n${text}\n\n` +
      `[내부 기록]\n${internalCorpus || "관련 내부 기록 없음"}\n\n` +
      `[외부 검색 결과]\n${buildExternalCorpus(externalResults) || "외부 검색 결과 없음"}\n\n` +
      `[작성 지침]\n` +
      `- 핵심만 요약체로 작성할 것\n` +
      `- 문장 끝은 가급적 '~임', '~필요', '~확인 필요' 형식으로 작성할 것\n` +
      `- 참고 URL을 반드시 포함할 것\n`;
    const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
    const answer = result?.answer || "외부 검색 기반 답변을 생성하지 못했음.";
    const sourceLines = externalResults.slice(0, 3).map((r, idx) =>
      `${idx + 1}. 제목: ${r.title || "제목 없음"}\n요약: ${r.snippet || "요약 없음"}\nURL: ${r.url || ""}`
    ).join("\n\n");
    return sourceLines ? `${answer}\n\n참고자료\n${sourceLines}` : answer;
  } catch (error) {
    return `뉴스검색 실패함\n\n` +
      `- 검색어: ${searchQuery}\n` +
      `- 원인 후보: Tavily API Key 미설정 또는 Worker Secret 미반영 가능성 있음\n` +
      `- 확인 필요: /search_status, /web_test ${searchQuery} 실행 필요\n` +
      `- 오류: ${String(error?.message || error)}`;
  }
}

function isWebSearchTestCommand(text) {
  return /^\/web_test\s+/.test(String(text || "").trim());
}

async function handleWebSearchTest(env, chatId, text) {
  const query = String(text || "").replace(/^\/web_test\s+/, "").trim();
  if (!query) {
    await sendMessage(env, chatId, "검색어를 입력해 주세요. 예: /web_test 하이닉스 HBM");
    return;
  }
  if (!isExternalSearchEnabled(env)) {
    await sendMessage(env, chatId, "EXTERNAL_SEARCH_ENABLED가 true가 아닙니다.");
    return;
  }
  if (!hasTavilyConfig(env)) {
    await sendMessage(env, chatId, "TAVILY_API_KEY가 Worker Secret에 없습니다.");
    return;
  }
  try {
    const results = await searchTavily(env, query, { maxResults: 5, searchDepth: "basic" });
    await saveExternalSearchResults(env, query, results);
    if (!results.length) {
      await sendMessage(env, chatId, `검색 결과가 없습니다.\n검색어: ${query}`);
      return;
    }
    const lines = results.map((r, idx) =>
      `${idx + 1}. ${r.title || "제목 없음"}\n${r.snippet || "요약 없음"}\n${r.url || "URL 없음"}`
    );
    await sendMessage(env, chatId, `외부검색 테스트 결과\n검색어: ${query}\n\n${lines.join("\n\n")}`);
  } catch (error) {
    await sendMessage(env, chatId,
      `Tavily 검색 오류\n\n` +
      `검색어: ${query}\n` +
      `오류: ${String(error?.message || error)}\n\n` +
      `확인 필요\n` +
      `- /search_status 실행\n` +
      `- TAVILY_API_KEY 값 확인\n` +
      `- Authorization: Bearer 형식 확인\n` +
      `- Tavily credit 잔여량 확인\n` +
      `- Worker 최신 배포 여부 확인`
    );
  }
}

function isSearchStatusCommand(text) {
  return /^\/search_status\b/.test(String(text || "").trim());
}

async function handleSearchStatus(env, chatId) {
  const enabled = isExternalSearchEnabled(env);
  const hasKey = hasTavilyConfig(env);
  const keyPrefix = hasKey ? String(env.TAVILY_API_KEY).slice(0, 8) + "..." : "없음";
  let msg =
    `외부검색 설정 상태\n\n` +
    `EXTERNAL_SEARCH_ENABLED: ${enabled ? "true" : "false"}\n` +
    `TAVILY_API_KEY: ${keyPrefix}\n`;
  if (!enabled || !hasKey) {
    msg +=
      `\n조치 필요\n` +
      `- Cloudflare Worker Variables에 EXTERNAL_SEARCH_ENABLED=true 설정\n` +
      `- Secret으로 TAVILY_API_KEY 등록\n` +
      `- 배포 후 /web_test 하이닉스 HBM 실행`;
  }
  await sendMessage(env, chatId, msg);
}

function isDbStatusCommand(text) {
  return /^\/db_status\b/.test(String(text || "").trim());
}

async function countTable(env, tableName) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).first();
  return row?.count || 0;
}

async function tableExists(env, tableName) {
  if (!env.DB) return false;
  const row = await env.DB.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name=?
    LIMIT 1
  `).bind(tableName).first();
  return !!row;
}

async function columnExists(env, tableName, columnName) {
  if (!(await tableExists(env, tableName))) return false;
  try {
    const result = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
    return (result.results || []).some(r => r.name === columnName);
  } catch (e) { return false; }
}

async function safeCountTable(env, tableName) {
  const exists = await tableExists(env, tableName);
  if (!exists) return { exists: false, count: 0 };
  try {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).first();
    return { exists: true, count: row?.count || 0 };
  } catch (e) { return { exists: true, count: -1 }; }
}

async function ensureCoreTablesExist(env) {
  if (!env.DB) throw new Error("D1 binding env.DB is missing");
  const required = ["users", "rooms", "room_members", "messages", "files", "meetings", "memory_profile"];
  const missing = [];
  for (const tableName of required) {
    if (!(await tableExists(env, tableName))) missing.push(tableName);
  }
  if (missing.length) {
    throw new Error(`D1 core tables missing: ${missing.join(", ")}. Run migration first.`);
  }
}

async function handleDbStatusLegacy(env, chatId) {
  if (!env.DB) {
    await sendMessage(env, chatId, "D1 상태 확인 실패\n\n오류: env.DB binding이 없습니다.");
    return;
  }
  try {
    const [users, rooms, messages, files] = await Promise.all([
      countTable(env, "users"),
      countTable(env, "rooms"),
      countTable(env, "messages"),
      countTable(env, "files"),
    ]);
    const recentRooms = await env.DB.prepare(`
      SELECT room_title, room_id, last_seen_at
      FROM rooms
      ORDER BY last_seen_at DESC
      LIMIT 5
    `).all();
    const recentMessages = await env.DB.prepare(`
      SELECT room_title, sender_name, content, created_at
      FROM messages
      ORDER BY created_at DESC
      LIMIT 5
    `).all();
    const roomLines = (recentRooms.results || []).map((r, idx) =>
      `${idx + 1}. ${r.room_title || "방 이름 없음"} / ${r.last_seen_at || ""}`
    ).join("\n");
    const msgLines = (recentMessages.results || []).map((m, idx) =>
      `${idx + 1}. [${m.room_title || "방 없음"}] ${m.sender_name || "작성자 없음"} (${m.created_at || ""})\n${String(m.content || "").slice(0, 80)}`
    ).join("\n\n");
    await sendMessage(env, chatId,
      `D1 저장 상태\n\n` +
      `users: ${users}\nrooms: ${rooms}\nmessages: ${messages}\nfiles: ${files}\n\n` +
      `최근 등록 방\n${roomLines || "없음"}\n\n` +
      `최근 메시지\n${msgLines || "없음"}`
    );
  } catch (error) {
    await sendMessage(env, chatId,
      `D1 상태 확인 실패\n\n` +
      `오류: ${String(error?.message || error)}\n\n` +
      `확인 필요\n` +
      `- wrangler.toml D1 binding이 DB인지 확인\n` +
      `- migration 적용 여부 확인\n` +
      `- 현재 Worker가 올바른 D1 database_id를 보는지 확인`
    );
  }
}

async function handleDbStatus(env, chatId) {
  if (!env.DB) {
    await sendMessage(env, chatId, "D1 binding env.DB가 없음. wrangler.toml의 [[d1_databases]] binding = \"DB\" 확인 필요.");
    return;
  }
  try {
    const tables = ["users", "rooms", "room_members", "messages", "files", "meetings", "memory_profile", "external_sources"];
    const statuses = [];
    for (const tableName of tables) {
      const status = await safeCountTable(env, tableName);
      statuses.push(`${tableName}: ${status.exists ? status.count : "테이블 없음"}`);
    }
    let recentRoomsText = "없음";
    if (await tableExists(env, "rooms")) {
      const hasRoomExtra = await columnExists(env, "rooms", "last_seen_at");
      const roomSql = hasRoomExtra
        ? `SELECT room_title, room_id, room_type, source, last_seen_at FROM rooms ORDER BY last_seen_at DESC LIMIT 10`
        : `SELECT room_title, room_id FROM rooms LIMIT 10`;
      const recentRooms = await env.DB.prepare(roomSql).all();
      recentRoomsText = (recentRooms.results || []).map((r, idx) =>
        `${idx + 1}. ${r.room_title || "방 이름 없음"} / ${r.room_id} / ${hasRoomExtra ? (r.room_type || "type없음") : "migration 미적용"} / ${hasRoomExtra ? (r.last_seen_at || "").slice(0, 16) : ""}`
      ).join("\n") || "없음";
    }
    let recentMessagesText = "없음";
    if (await tableExists(env, "messages")) {
      const hasSourceType = await columnExists(env, "messages", "source_type");
      const msgSql = hasSourceType
        ? `SELECT room_title, sender_name, content, source_type, created_at FROM messages ORDER BY created_at DESC LIMIT 10`
        : `SELECT room_title, sender_name, content, created_at FROM messages ORDER BY created_at DESC LIMIT 10`;
      const recentMessages = await env.DB.prepare(msgSql).all();
      recentMessagesText = (recentMessages.results || []).map((m, idx) =>
        `${idx + 1}. [${m.room_title || "방 없음"}] ${m.sender_name || "작성자 없음"} / ${hasSourceType ? (m.source_type || "") : "old schema"} (${(m.created_at || "").slice(0, 16)})\n${String(m.content || "").slice(0, 80)}`
      ).join("\n\n") || "없음";
    }
    await sendMessage(env, chatId,
      `D1 저장 상태\n\n` +
      `${statuses.join("\n")}\n\n` +
      `최근 등록 방\n${recentRoomsText}\n\n` +
      `최근 저장 메시지\n${recentMessagesText}`
    );
  } catch (error) {
    await sendMessage(env, chatId,
      `D1 상태 확인 실패\n\n` +
      `오류: ${String(error?.message || error)}\n\n` +
      `확인 필요\n` +
      `- wrangler.toml D1 binding이 DB인지 확인\n` +
      `- migration 적용 여부 확인\n` +
      `- 현재 Worker가 올바른 D1 database_id를 보는지 확인\n` +
      `- /db_status가 SQL executor로 흘러가지 않도록 routeSlashCommand 우선 처리 확인`
    );
  }
}

function isImageStatusCommand(text) {
  return /^\/image_status\b/.test(String(text || "").trim());
}

async function handleImageStatus(env, chatId) {
  await sendMessage(env, chatId,
    `이미지 분석 설정 상태\n\n` +
    `TELEGRAM_BOT_TOKEN: ${env.TELEGRAM_BOT_TOKEN ? "있음" : "없음"}\n` +
    `DIFY_API_KEY: ${env.DIFY_API_KEY ? "있음" : "없음"}\n` +
    `GEMINI_API_KEY: ${env.GEMINI_API_KEY ? "있음" : "없음"}\n` +
    `VISION_PROVIDER: ${env.VISION_PROVIDER || "미설정"}\n` +
    `OPENAI_API_KEY: ${env.OPENAI_API_KEY ? "있음" : "없음"}\n\n` +
    `확인 필요\n` +
    `- Telegram getFile로 이미지 다운로드 가능한지 확인\n` +
    `- Gemini 또는 VISION_PROVIDER=openai + OPENAI_API_KEY 설정 여부 확인\n` +
    `- 이미지 분석 실패 시 구체 오류 메시지 확인`
  );
}

function isDiagnosticCommand(text) {
  return isSearchStatusCommand(text) || isDbStatusCommand(text) || isImageStatusCommand(text);
}

async function handleDiagnosticCommand(env, chatId, text) {
  if (isSearchStatusCommand(text)) return await handleSearchStatus(env, chatId);
  if (isDbStatusCommand(text)) return await handleDbStatus(env, chatId);
  if (isImageStatusCommand(text)) return await handleImageStatus(env, chatId);
}

async function handleRoomList(env, chatId) {
  try {
    if (!(await tableExists(env, "rooms"))) {
      await sendMessage(env, chatId, "rooms 테이블이 없음. migration 적용 필요.");
      return;
    }
    const hasExtra = await columnExists(env, "rooms", "last_seen_at");
    const roomSql = hasExtra
      ? `SELECT room_id, room_title, room_type, source, last_seen_at FROM rooms ORDER BY last_seen_at DESC LIMIT 100`
      : `SELECT room_id, room_title FROM rooms LIMIT 100`;
    const result = await env.DB.prepare(roomSql).all();
    const rows = result.results || [];
    if (!rows.length) {
      await sendMessage(env, chatId,
        `등록된 방 없음.\n\n` +
        `가능한 원인\n` +
        `- migration 미적용 (npx wrangler d1 execute 6r-ai-db --file=migrations/0004_personal_ai_os.sql --remote)\n` +
        `- 봇이 방에 추가됐지만 my_chat_member update 미처리\n` +
        `- messages에 단체방 기록 있으면 backfill SQL 실행 필요\n` +
        `  INSERT OR IGNORE INTO rooms(room_id,room_title) SELECT DISTINCT room_id,room_title FROM messages WHERE room_id!=''`
      );
      return;
    }
    const lines = rows.map((r, idx) =>
      `${idx + 1}. ${r.room_title || "이름없음"} / ID: ${r.room_id}${hasExtra ? ` / ${r.room_type || "?"} / ${(r.last_seen_at || "").slice(0, 16)}` : ""}`
    );
    await sendMessage(env, chatId, `등록된 방 ${rows.length}개임.\n\n${lines.join("\n")}`);
  } catch (error) {
    await sendMessage(env, chatId, `방 목록 조회 실패함\n오류: ${String(error?.message || error)}`);
  }
}

function isSqlCommand(text) {
  return /^\/sql\s+/i.test(String(text || "").trim());
}

function isAdminUser(env, from) {
  return String(from?.id || "") === String(env.ADMIN_TELEGRAM_ID || "");
}

async function handleSqlCommand(env, message, text, chatId) {
  if (!isSqlCommand(text)) return false;
  if (!isAdminUser(env, message.from)) {
    await sendMessage(env, chatId, "관리자만 SQL 진단 명령을 실행할 수 있음.");
    return true;
  }
  const sql = String(text || "").replace(/^\/sql\s+/i, "").trim();
  if (!/^(select|pragma)\b/i.test(sql)) {
    await sendMessage(env, chatId, "안전상 SELECT/PRAGMA만 허용함.");
    return true;
  }
  try {
    const result = await env.DB.prepare(sql).all();
    await sendMessage(env, chatId, JSON.stringify(result.results || [], null, 2).slice(0, 3000));
  } catch (error) {
    await sendMessage(env, chatId, `SQL 실행 실패함\n오류: ${String(error?.message || error)}`);
  }
  return true;
}

function getHelpText() {
  return [
    "사용 가능 명령",
    "/db_status - D1 저장 상태 확인",
    "/rooms - 등록된 방 목록 확인",
    "/users - 등록 사용자 목록 확인",
    "/search_status - 외부검색 설정 확인",
    "/web_test 검색어 - Tavily 검색 테스트",
    "/image_status - 이미지 분석 설정 확인",
    "/sql SELECT ... - 관리자 전용 SQL 진단",
  ].join("\n");
}

async function routeSlashCommand(env, message, text, chatId) {
  const t = String(text || "").trim();
  if (!t.startsWith("/")) return false;
  if (await handleSqlCommand(env, message, t, chatId)) return true;
  if (isDbStatusCommand(t)) {
    await handleDbStatus(env, chatId);
    return true;
  }
  if (/^\/rooms\b/.test(t) || isRoomListQuery(t)) {
    await handleRoomList(env, chatId);
    return true;
  }
  if (/^\/users\b/.test(t) || isUserListQuery(t)) {
    await handleUserList(chatId, env);
    return true;
  }
  if (isSearchStatusCommand(t)) {
    await handleSearchStatus(env, chatId);
    return true;
  }
  if (isWebSearchTestCommand(t)) {
    await handleWebSearchTest(env, chatId, t);
    return true;
  }
  if (isImageStatusCommand(t)) {
    await handleImageStatus(env, chatId);
    return true;
  }
  if (/^\/help\b/.test(t)) {
    await sendMessage(env, chatId, getHelpText());
    return true;
  }
  return false;
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

async function dbSaveFile(env, data) {
  if (!env.DB) return;
  try {
    const table = await env.DB.prepare(`PRAGMA table_info(files)`).all();
    const existing = new Set((table.results || []).map((c) => c.name));
    const values = {
      telegram_file_id: data.telegram_file_id || "",
      telegram_file_unique_id: data.telegram_file_unique_id || "",
      r2_key: data.r2_key || "",
      room_id: String(data.room_id || data.roomId || ""),
      room_title: data.room_title || data.roomTitle || "",
      uploader_id: String(data.uploader_id || data.uploaderId || data.senderId || ""),
      uploader_name: data.uploader_name || data.uploaderName || data.senderName || "",
      sender_id: String(data.sender_id || data.senderId || data.uploader_id || data.uploaderId || ""),
      sender_name: data.sender_name || data.senderName || data.uploader_name || data.uploaderName || "",
      file_name: data.file_name || data.fileName || "",
      file_type: data.file_type || data.fileType || data.mimeType || "",
      mime_type: data.mime_type || data.mimeType || data.file_type || data.fileType || "",
      extracted_text: String(data.extracted_text || data.content || "").slice(0, 50000),
      summary: String(data.summary || "").slice(0, 3000),
      tags_json: JSON.stringify(data.tags || []),
      saved_by: data.saved_by || data.savedBy || BOT_KEY,
    };
    const columns = Object.keys(values).filter((name) => existing.has(name));
    if (!columns.length) return;
    const placeholders = columns.map(() => "?").join(", ");
    await env.DB.prepare(`INSERT INTO files (${columns.join(", ")}) VALUES (${placeholders})`)
      .bind(...columns.map((name) => values[name]))
      .run();
  } catch (e) {
    console.error("dbSaveFile failed:", e);
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
      where += " AND (file_name LIKE ? OR extracted_text LIKE ? OR summary LIKE ?)";
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
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
             COALESCE(summary, extracted_text, file_name) AS text, created_at, file_name, NULL AS title
      FROM files
      WHERE file_name LIKE ? OR extracted_text LIKE ? OR summary LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(like, like, like, limit).all();
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
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const hasDigestVerb = /(요약|정리|브리핑|공유|알려줘|뽑아줘|추려줘|보고|리캡|recap|digest)/i.test(t);
  const hasDigestObject = /(확인해야\s*할\s*안건|확인해야할\s*안건|봐야\s*할\s*것|주요\s*안건|주요\s*내용|보고내용|올라온\s*내용|단체방|단톡방|각종\s*방|각\s*방|방들|대화\s*내용|공유된\s*내용|오늘\s*내용|이번주\s*내용|최근\s*내용)/.test(t);
  const directPatterns =
    /(오늘|어제오늘|이번주|최근).{0,20}(요약|정리|브리핑|공유|알려줘|뽑아줘|추려줘)/.test(t) ||
    /(확인해야\s*할\s*안건|확인해야할\s*안건).{0,20}(공유|알려줘|정리|요약)/.test(t) ||
    /(단체방|단톡방|각종\s*방|방들).{0,30}(올라온|나온|공유된).{0,20}(내용|안건|자료|보고)/.test(t);
  return directPatterns || (hasDigestVerb && hasDigestObject);
}

function parseDigestRange(text) {
  const t = String(text || "");
  if (/어제오늘|어제\s*오늘/.test(t)) return { label: "어제오늘", days: 2 };
  if (/오늘|금일/.test(t)) return { label: "오늘", days: 1 };
  if (/이번\s*주|이번주|주간/.test(t)) return { label: "이번주", days: 7 };
  if (/최근|요즘/.test(t)) return { label: "최근 3일", days: 3 };
  return { label: "최근 2일", days: 2 };
}

async function getKnownRoomsText(env) {
  if (!env.DB) return "";
  try {
    const result = await env.DB.prepare(`
      SELECT room_title, room_id, room_type, last_seen_at
      FROM rooms
      ORDER BY last_seen_at DESC
      LIMIT 20
    `).all();
    const rows = result.results || [];
    return rows.map((r, idx) =>
      `${idx + 1}. ${r.room_title || "방 이름 없음"} / ${r.room_type || "type 미상"} / ${r.last_seen_at || ""}`
    ).join("\n");
  } catch (e) {
    console.error("getKnownRoomsText:", e);
    return "";
  }
}

async function fetchDigestRows(env, days = 2, limit = 120) {
  if (!env.DB) return [];
  try {
    const messages = await env.DB.prepare(`
      SELECT 'message' AS type, room_title AS source, sender_name AS actor, content AS text, created_at, NULL AS file_name, NULL AS title
      FROM messages
      WHERE datetime(created_at) >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(`-${days} days`, limit).all();
    const files = await env.DB.prepare(`
      SELECT 'file' AS type, COALESCE(room_title, '') AS source, COALESCE(uploader_name, sender_name) AS actor,
             COALESCE(summary, extracted_text, file_name) AS text, created_at, file_name, NULL AS title
      FROM files
      WHERE datetime(created_at) >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(`-${days} days`, Math.min(limit, 50)).all();
    const meetings = await env.DB.prepare(`
      SELECT 'meeting' AS type, COALESCE(source, title, '') AS source, created_by AS actor,
             COALESCE(summary, decisions, action_items, raw_text) AS text, created_at, NULL AS file_name, title
      FROM meetings
      WHERE datetime(created_at) >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(`-${days} days`, Math.min(limit, 50)).all();
    const facts = await env.DB.prepare(`
      SELECT 'memory' AS type, COALESCE(source_room, subject, '') AS source, source_actor AS actor,
             content AS text, created_at, NULL AS file_name, subject AS title
      FROM learned_facts
      WHERE datetime(created_at) >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(`-${days} days`, Math.min(limit, 80)).all();
    return [
      ...(messages.results || []),
      ...(files.results || []),
      ...(meetings.results || []),
      ...(facts.results || []),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  } catch (e) {
    console.error("fetchDigestRows:", e);
    return [];
  }
}

function buildDigestCorpus(rows) {
  if (!rows?.length) return "";
  return rows.map((r, idx) => {
    const typeLabel =
      r.type === "message" ? "대화" :
      r.type === "file" ? "파일" :
      r.type === "meeting" ? "회의록" :
      r.type === "memory" ? "축적 기억" : "자료";
    const extra = r.file_name ? ` / 파일명: ${r.file_name}` : r.title ? ` / 제목: ${r.title}` : "";
    return `[${idx + 1}] ${typeLabel}
출처: [${r.source || "출처 미상"}] ${r.actor || "작성자 미상"} (${r.created_at || "시간 미상"})${extra}
내용:
${String(r.text || "").slice(0, 1000)}`;
  }).join("\n\n");
}

async function answerDigest(env, userText, userId) {
  const range = parseDigestRange(userText);
  const rows = await fetchDigestRows(env, range.days, 140);
  if (!rows.length) {
    const knownRooms = await getKnownRoomsText(env);
    return `${range.label} 기준으로 저장된 대화 기록이 아직 없습니다.

가능한 원인:
1. 해당 기간에 봇이 받은 메시지가 없었습니다.
2. BotFather Privacy Mode가 켜져 있어 그룹 일반 메시지를 받지 못하고 있습니다.
3. D1 저장 로직이 아직 배포되지 않았거나 migration이 적용되지 않았습니다.
4. 봇이 해당 단체방에 없었습니다.

현재 이 봇에 등록된 방:
${knownRooms || "등록된 방이 없습니다."}

확인 필요:
- BotFather에서 /setprivacy -> Disable 설정
- 봇을 단체방에서 제거 후 다시 추가
- wrangler.toml의 D1 binding 확인
- messages 테이블에 최근 데이터가 쌓이는지 확인`;
  }
  const query =
    SUMMARY_TONE_RULE +
    `[요청]\n${userText}\n\n` +
    `[요약 범위]\n${range.label}\n\n` +
    `[내부 기록]\n${buildDigestCorpus(rows)}\n\n` +
    `[작성 지침]\n` +
    `너는 ${BOT_OWNER_NAME}의 개인 업무 비서 AI OS입니다.\n` +
    `아래 기록은 이 봇이 직접 들어가 있는 텔레그램 방, 1:1 대화, 파일, 회의록에서 수집한 내용입니다.\n` +
    `단순 나열하지 말고, 사용자가 오늘 확인해야 할 안건 중심으로 압축해 주세요.\n\n` +
    `[출력 형식]\n` +
    `${range.label} 기준으로 이 봇이 저장한 기록을 확인했습니다.\n\n` +
    `확인할 주요 안건 N건입니다.\n\n` +
    `1. 안건명\n` +
    `   핵심: 한 문장으로 요약\n` +
    `   봐야 할 점: 사용자가 확인해야 할 포인트\n` +
    `   출처: [방이름] 공유자명 (시간)\n\n` +
    `우선 확인할 것\n- 항목 1\n- 항목 2\n- 항목 3\n\n` +
    `[품질 기준]\n` +
    `1. 최대 5개 안건까지만 선정합니다.\n` +
    `2. 각 안건은 현상, 의미, 확인할 일 중심으로 짧게 씁니다.\n` +
    `3. 업무적으로 중요한 내용만 고릅니다.\n` +
    `4. 잡담, 웃음, 단순 리액션은 제외합니다.\n` +
    `5. 출처는 반드시 [방이름] 공유자명 (시간) 형식으로 표시합니다.\n` +
    `6. 출처 없는 내용은 쓰지 않습니다.\n` +
    `7. 전체 답변은 1500자 이내로 씁니다.\n` +
    `8. 마크다운 기호는 쓰지 않습니다.\n`;
  const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
  return result?.answer || "요약을 생성하지 못했습니다.";
}

function isScheduleDigestQuery(text) {
  return /(다음주|내주|이번주|오늘|최근).{0,30}(참석|일정|회의|미팅|세션|포럼|행사|방문|콜|call|meeting).{0,30}(정리|알려|요약|공유)/i.test(text || "")
    || /(참석해야\s*할|참석할).{0,20}(일정|회의|미팅|세션|포럼|행사)/.test(text || "");
}

async function answerScheduleDigest(env, userText, userId) {
  const range = { label: "최근 기록 기준", days: 7 };
  const rows = await fetchDigestRows(env, range.days, 200);
  if (!rows.length) {
    return `최근 기록 기준 저장된 대화 기록이 없음.\n\n- /db_status로 messages 적재 여부 확인 필요\n- 단체방 및 1:1 메시지 저장 로직 확인 필요`;
  }
  const filtered = rows.filter((r) =>
    /(참석|일정|회의|미팅|세션|포럼|행사|방문|콜|call|meeting|다음주|내주|이번주|날짜|오전|오후|\d{1,2}\/\d{1,2}|\d{1,2}월\s*\d{1,2}일)/i.test(String(r.text || ""))
  );
  const targetRows = filtered.length ? filtered : rows;
  const corpus = buildDigestCorpus(targetRows.slice(0, 80));
  const query =
    SUMMARY_TONE_RULE +
    `[요청]\n${userText}\n\n` +
    `[내부 기록]\n${corpus}\n\n` +
    `[작성 지침]\n` +
    `- 사용자가 다음주 또는 향후 참석해야 할 일정, 회의, 행사만 추려 정리할 것\n` +
    `- 날짜, 시간, 행사명, 참석 주체, 확인할 일을 우선 추출할 것\n` +
    `- 명확한 일정이 아니면 일정 후보로 표시할 것\n` +
    `- 출처는 반드시 [방이름] 공유자명 (시간) 형식으로 표시할 것\n\n` +
    `[출력 형식]\n` +
    `참석/확인 필요 일정 N건임.\n\n` +
    `1. 일정명\n` +
    `- 일시: ...확인 필요\n` +
    `- 내용: ...임\n` +
    `- 확인할 일: ...필요\n` +
    `- 출처: [방이름] 공유자명 (시간)\n\n` +
    `우선 확인할 것\n` +
    `- 참석자 확정 필요\n` +
    `- 일정 캘린더 반영 필요`;
  const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
  return result?.answer || "일정 요약을 생성하지 못했음.";
}

async function buildDigest(env, { days = 1 } = {}) {
  return buildDigestCorpus(await fetchDigestRows(env, days, 80));
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

async function handleMyChatMemberUpdate(env, myChatMember) {
  if (!env.DB || !myChatMember?.chat) return;
  const chat = myChatMember.chat;
  if (chat.type === "private") return;
  const newStatus = myChatMember.new_chat_member?.status || "";
  const roomId = String(chat.id);
  const roomTitle = chat.title || chat.username || roomId;
  if (["member", "administrator"].includes(newStatus)) {
    await saveRoom(chat.id, roomTitle, env);
    await dbRegisterRoom(env, chat.id, roomTitle, "koh");
    await upsertRoom(env, chat);
    try {
      await env.DB.prepare(`
        UPDATE rooms
        SET source = ?, last_seen_at = CURRENT_TIMESTAMP
        WHERE room_id = ?
      `).bind("my_chat_member_added", roomId).run();
    } catch (error) {
      console.error("handleMyChatMemberUpdate added:", error);
    }
  }
  if (["left", "kicked"].includes(newStatus)) {
    try {
      await env.DB.prepare(`
        UPDATE rooms
        SET source = ?, last_seen_at = CURRENT_TIMESTAMP
        WHERE room_id = ?
      `).bind("my_chat_member_removed", roomId).run();
    } catch (error) {
      console.error("handleMyChatMemberUpdate removed:", error);
    }
  }
  console.log("my_chat_member handled", { roomId, roomTitle, newStatus });
}

async function persistIncomingMessage(env, message) {
  if (!env.DB || !message?.chat || message._persisted) return;
  const text = message.text || message.caption || "";
  if (message.from?.is_bot) return;
  await upsertUser(
    env,
    message.from,
    message.chat.type === "private" ? message.chat.id : message.from?.id,
    message.chat.type === "private" ? "private_dm" : "group_message"
  );
  if (message.chat.type !== "private") {
    await upsertRoom(env, message.chat);
    if (message.from) await upsertRoomMember(env, message.chat, message.from, "message");
  }
  if (!text.trim()) return;
  await dbInsert(env, {
    roomId: message.chat.id,
    roomTitle: message.chat.type === "private"
      ? "1:1"
      : (message.chat.title || message.chat.username || String(message.chat.id)),
    senderId: message.from?.id || "",
    senderName: getSenderName(message.from),
    content: getMessageTextForStorage(message),
    savedBy: BOT_KEY,
    telegramMessageId: message.message_id || "",
    sourceType: message.chat.type === "private" ? "telegram_private" : "telegram_group",
  });
  await maybeLearnFromMessage(env, message);
  message._persisted = true;
}

async function handleUpdate(update, env, isRelay = false) {
  if (update.my_chat_member) {
    await handleMyChatMemberUpdate(env, update.my_chat_member);
    return;
  }

  const message = update.message || update.edited_message;
  if (!message) return;

  const userId = String(message.from.id);
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const text = message.text || message.caption || "";
  const hasFile = !!(message.document || message.photo);

  await ensureOwnerProfile(env);
  await handleNewChatMembers(env, message);
  await persistIncomingMessage(env, message);
  if (!message._persisted) {
    await upsertUser(env, message.from, chatType === "private" ? chatId : message.from.id, chatType === "private" ? "private_dm" : "group_message");
  }
  if (!message._persisted && (chatType === "private" || hasFile) && text.trim()) {
    await dbInsert(env, {
      roomId: chatId,
      roomTitle: chatType === "private" ? "private_dm" : (message.chat.title || String(chatId)),
      senderId: userId,
      senderName: getSenderName(message.from),
      content: getMessageTextForStorage(message),
      savedBy: BOT_KEY,
      telegramMessageId: message.message_id || "",
      sourceType: chatType === "private" ? "telegram_private" : "telegram_group",
    });
  }
  if (!message._persisted && chatType !== "private") {
    await upsertRoom(env, message.chat);
    await upsertRoomMember(env, message.chat, message.from, "message");
    await maybeUpdateUserDisplayNameFromBareName(env, message);
  }
  await maybeDetectBotOwner(env, message);

  if (await routeSlashCommand(env, message, text, chatId)) {
    return;
  }

  if (await handleOwnerConfirmReject(env, chatId, message.from, text)) {
    return;
  }

  if (message.new_chat_members?.some((m) => m.is_bot)) {
    await saveRoom(chatId, message.chat.title, env);
    await dbRegisterRoom(env, chatId, message.chat.title, "koh");
    await upsertRoom(env, message.chat);
    return;
  }

  if (isRegisterCommand(text)) {
    await handleRegisterCommand(env, chatId, message.from);
    return;
  }

  const user = await getUser(userId, env);

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
  if (isDiagnosticCommand(text)) {
    await handleDiagnosticCommand(env, chatId, text);
    return;
  }

  if (user?.step === "waiting_name_auto") {
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
      user = await getUser(userId, env);
    }
  }

  // 기능 소개
  if (isIntroQuery(text)) {
    await handleIntro(chatId, env);
    return;
  }

  if (isOwnerStatusQuery(text)) {
    await handleOwnerStatus(env, chatId);
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
    await handleUserList(chatId, env);
    return;
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

  if (isWebSearchTestCommand(text)) {
    await handleWebSearchTest(env, chatId, text);
    return;
  }

  if (isUrlSummaryQuery(text)) {
    const answer = await answerUrlSummary(env, text, userId);
    await sendMessage(env, chatId, answer);
    return;
  }

  if (isScheduleDigestQuery(text)) {
    const answer = await answerScheduleDigest(env, text, userId);
    await sendMessage(env, chatId, answer);
    return;
  }

  if (isDigestQuery(text)) {
    const answer = await answerDigest(env, text, userId);
    await sendMessage(env, chatId, answer);
    return;
  }

  if (needsExternalSearch(text)) {
    const answer = isExternalSearchEnabled(env) && hasTavilyConfig(env)
      ? await answerWithExternalSearch(env, text, userId)
      : await answerExternalSearchNotConfigured(env, text);
    await sendMessage(env, chatId, answer);
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
      const knownRooms = await getKnownRoomsText(env);
      await sendMessage(env, chatId, `현재 이 봇의 D1 DB에는 해당 조건의 기록이 없습니다.\n\n현재 이 봇에 등록된 방:\n${knownRooms || "등록된 방이 없습니다."}\n\n확인 필요:\n- BotFather Privacy Mode 설정\n- 봇이 해당 방에 들어가 있는지\n- messages 테이블에 최근 데이터가 쌓이는지`);
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
      const answer = await answerUrlSummary(env, text, userId);
      await sendMessage(env, chatId, answer);
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
  await sendMessage(env, chatId, `${name}님으로 자동 등록되어 있습니다.\n텔레그램 ID: ${userId}`);
}

async function handleAutoRegister(userId, chatId, name, env) {
  await saveUser(userId, { id: userId, name, chat_id: chatId }, env);
  await sendMessage(env, chatId, `${name}님으로 자동 등록되어 있습니다.\n텔레그램 ID: ${userId}`);
}

async function handleRegisterStep1(userId, chatId, env) {
  await saveUser(userId, { id: userId, step: "waiting_name" }, env);
}

async function handleRegisterStep2(userId, chatId, name, currentChatId, env) {
  await saveUser(userId, { id: userId, name, chat_id: currentChatId }, env);
  await sendMessage(env, chatId, `${name}님으로 자동 등록되어 있습니다.\n텔레그램 ID: ${userId}`);
}

async function handleRegisterStep3(userId, chatId, input, env) {
  const user = await getUser(userId, env);
  const parts = input.split("/").map((s) => s.trim());
  const team = parts[0] || input.trim();
  const role = parts[1] || "";
  await saveUser(userId, { id: userId, name: user.name, team, role, chat_id: user.chat_id }, env);
  await sendMessage(env, chatId, `${user.name || userId}님으로 자동 등록되어 있습니다.\n텔레그램 ID: ${userId}`);
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
  const shouldRespond = shouldRespondInGroup(message, text, env);

  if (hasFile) {
    if (!shouldRespond) return;
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
  if (!message._persisted) {
    await dbInsert(env, {
      roomId:     chatId,
      roomTitle:  message.chat.title || String(chatId),
      senderId:   userId,
      senderName: user?.name || message.from?.first_name || "",
      content:    getMessageTextForStorage(message),
      savedBy:    "koh",
      telegramMessageId: message.message_id || "",
      sourceType: "telegram_group",
    });
    await maybeLearnFromMessage(env, message);
  }
  console.log(`[KOH DB저장] room=${message.chat.title} user=${user?.name} text=${text.slice(0, 30)}`);

  if (isDiagnosticCommand(text)) {
    await handleDiagnosticCommand(env, chatId, text);
    return;
  }

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
      return;
    }
  }

  if (!shouldRespond) return;

  const cleanText = cleanBotMention(text, env);

  if (!cleanText) {
    return;
  }

  if (isWebSearchTestCommand(cleanText)) {
    await handleWebSearchTest(env, chatId, cleanText);
    return;
  }

  if (isUrlSummaryQuery(cleanText)) {
    const answer = await answerUrlSummary(env, cleanText, userId);
    await sendMessage(env, chatId, answer);
    return;
  }

  if (isOwnerStatusQuery(cleanText)) {
    await handleOwnerStatus(env, chatId);
    return;
  }

  if (isUserListQuery(cleanText)) {
    await handleUserList(chatId, env);
    return;
  }

  if (isLongSharedContent(cleanText)) {
    await handleLongSharedContent(env, chatId, message);
    return;
  }

  // URL 요약
  if (isUrlText(cleanText)) {
    const urlMatch = cleanText.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const answer = await answerUrlSummary(env, cleanText, userId);
      await sendMessage(env, chatId, answer);
      return;
    }
  }

  if (isScheduleDigestQuery(cleanText)) {
    const answer = await answerScheduleDigest(env, cleanText, userId);
    await sendMessage(env, chatId, answer);
    return;
  }

  if (isDigestQuery(cleanText)) {
    const answer = await answerDigest(env, cleanText, userId);
    await sendMessage(env, chatId, answer);
    return;
  }

  if (needsExternalSearch(cleanText)) {
    const answer = isExternalSearchEnabled(env) && hasTavilyConfig(env)
      ? await answerWithExternalSearch(env, cleanText, userId)
      : await answerExternalSearchNotConfigured(env, cleanText);
    await sendMessage(env, chatId, answer);
    return;
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
      const knownRooms = await getKnownRoomsText(env);
      await sendMessage(env, chatId, `현재 이 봇의 D1 DB에는 해당 조건의 기록이 없습니다.\n\n현재 이 봇에 등록된 방:\n${knownRooms || "등록된 방이 없습니다."}\n\n확인 필요:\n- BotFather Privacy Mode 설정\n- 봇이 해당 방에 들어가 있는지\n- messages 테이블에 최근 데이터가 쌓이는지`);
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
    if (mimeType.startsWith("image/") && (env.GEMINI_API_KEY || (env.VISION_PROVIDER === "openai" && env.OPENAI_API_KEY))) {
      const buffer = await fetch(fileUrl).then((r) => r.arrayBuffer());
      const answer = await analyzeImageWithClaude(env, buffer, mimeType, message.caption || "");
      await dbSaveFile(env, {
        telegram_file_id: fileId,
        telegram_file_unique_id: message.document?.file_unique_id || message.photo?.[message.photo.length - 1]?.file_unique_id || "",
        roomId,
        roomTitle,
        senderId: userId,
        senderName,
        fileName,
        mimeType,
        summary: answer,
        tags: ["image", "analysis"],
      });
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
      query: SUMMARY_PROMPT,
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
    await dbSaveFile(env, {
      telegram_file_id: fileId,
      telegram_file_unique_id: message.document?.file_unique_id || "",
      roomId,
      roomTitle,
      senderId: userId,
      senderName,
      fileName,
      mimeType,
      summary,
      tags: ["document"],
    });
    await sendMessage(env, chatId, summary || "요약 중 오류가 발생했어요.");
  } catch (e) {
    console.error("handleFile error:", e);
    await sendMessage(env, chatId, `파일 처리 오류\n\n오류: ${e.message}\n\n확인 필요\n- /db_status 실행\n- /image_status 실행\n- Telegram getFile 다운로드 가능 여부\n- Dify 또는 Vision provider 설정 여부`);
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

async function analyzeImageWithOpenAI(env, imageBuffer, contentType, userPrompt = "") {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");
  const dataUrl = `data:${contentType || "image/jpeg"};base64,${arrayBufferToBase64(imageBuffer)}`;
  const prompt =
    `이미지를 업무 문서 관점에서 분석해줘.\n` +
    `답변은 보고 메모체로 작성하고, 문장 끝은 가급적 '~임', '~필요', '~확인 필요' 형식으로 작성해줘.\n` +
    `구성: 핵심 내용 / 주요 수치 및 고유명사 / 확인할 일 / 요약.\n\n` +
    `사용자 요청: ${userPrompt || "이미지 내용 분석"}`;
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl },
        ],
      }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI vision failed: ${JSON.stringify(data)}`);
  return data.output_text || data.output?.[0]?.content?.[0]?.text || "이미지 분석 결과를 가져오지 못했음.";
}

async function analyzeImageWithClaude(env, buffer, mimeType, userPrompt = "") {
  if (env.VISION_PROVIDER === "openai") {
    return await analyzeImageWithOpenAI(env, buffer, mimeType, userPrompt);
  }
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing. Set GEMINI_API_KEY or VISION_PROVIDER=openai with OPENAI_API_KEY.");
  }
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
