const DIFY_API_URL = "https://api.dify.ai/v1";
const SUMMARY_PROMPT =
  "[요약 응답 규칙]\n" 
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
const SUMMARY_RULE = `
[답변 형식 — 모든 요약·정리·브리핑에서 반드시 준수]

안건별 형식:
📌 [카테고리] 안건명 (10~25자, 내용 기반 직접 작성)
· 핵심 내용 1~2줄 (사실만, 추정 금지)
· 위치: [방이름]
· 공유자: <u>이름</u> (날짜)
· 링크: URL (뉴스·외부 자료일 때만)
⚡ 마감: 날짜 (있을 때만)

카테고리:
[정부·정책] [노사·인사] [사내 보고] [대외컴]
[위기·이슈] [사업·전략] [글로벌·외신] [행사·이벤트]

규칙:
- 제목은 내용을 읽고 직접 작성 — 본문 문장 그대로 붙여쓰기 금지
- "여겠습니다", "알겠습니다" 같은 응답 문장은 제목 불가
- 하나의 자료에 여러 안건이 있으면 각각 별도 📌로 분리
- 파일명(photo[_]xxx 등)을 안건명으로 절대 쓰지 말 것
- 안건 사이 반드시 한 줄 띄기
- 모든 방 자료 빠짐없이 포함 필수
- 1:1 방 공유 자료도 실제 공유자 이름 표시
- 사람 이름은 <u>이름</u> 형태
- <b> 볼드 절대 금지 / *, #, ** 마크다운 절대 금지
- 자료에 없는 내용 추정 금지
`;
const BOT_OWNER_NAME = "권오혁";
const BOT_OWNER_ROLE = "6R전략담당";
const BOT_PERSONA = "권오혁 담당님의 개인 업무 비서 AI OS";
const BOT_DB_NAME = "6r-ai-db";
const BOT_KEY = "koh";
const BOT_USERNAME = "KOH_AI_bot";
const BUILD_VERSION = "koh-cpu-limit-fix-lightweight-20260609";

// 방 타입
const INFO_ROOM_KEYWORD = "💡정보방";

// 정보방 태그
const INFO_ROOM_TAGS = ["#국회", "#정책", "#정국", "#글로벌"];

// 팀방 상태태그
const STATUS_TAGS = ["#보고", "#Fup", "#공유", "#일정"];

// 팀방 분야태그
const FIELD_TAGS = ["#6R리뷰", "#6RMonthly", "#AI", "#KPI", "#기획"];

function readBoolEnv(env, key, defaultValue = false) {
  const val = String(env[key] || "").trim().toLowerCase();
  if (val === "true" || val === "1" || val === "yes") return true;
  if (val === "false" || val === "0" || val === "no") return false;
  return defaultValue;
}

function getKstDayRange() {
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + kstOffset);
  const kstDate = kstNow.toISOString().slice(0, 10); // YYYY-MM-DD in KST
  const startMs = Date.parse(kstDate + "T00:00:00Z") - kstOffset; // KST 00:00 → UTC
  const endMs = Date.parse(kstDate + "T23:59:59Z") - kstOffset;   // KST 23:59 → UTC
  const toIso = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
  return { kstDate, startIso: toIso(startMs), endIso: toIso(endMs) };
}

// 이번주(월~일) KST 날짜 범위 (YYYY-MM-DD)
function getKstWeekRange() {
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + kstOffset);
  const day = kstNow.getUTCDay(); // 0=Sun..6=Sat
  const monOffset = (day + 6) % 7; // days since Monday
  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - monOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

const ALLOWED_NAMES = new Set([
  "권오혁", "염성진", "황무연", "함동균",
  "손경배", "한혜승", "박호현", "양서진", "원정호",
  "성봉구", "위예슬", "이기두", "김민아", "황성욱", "홍석윤", "구정모", "김선영",
  "Bonggu Sung", "예슬 위", "Kidu Lee", "민아 김", "성욱 황", "석윤 홍", "선영 김", "오혁 권",
]);

const TEAM_CANONICAL_NAME_ALIASES = new Map([
  ["Bonggu Sung", "성봉구"],
  ["오혁 권", "권오혁"],
  ["예슬 위", "위예슬"],
  ["Kidu Lee", "이기두"],
  ["민아 김", "김민아"],
  ["김민아", "김민아"],
  ["성욱 황", "황성욱"],
  ["석윤 홍", "홍석윤"],
  ["선영 김", "김선영"],
  ["구정모", "구정모"],
]);

const TEAM_CANONICAL_NAME_BY_ID = new Map([
  ["user1225481333", "성봉구"],
  ["user5748267778", "권오혁"],
  ["5748267778", "권오혁"],
  ["1225481333", "성봉구"],
  ["user7922137485", "위예슬"],
  ["7922137485", "위예슬"],
  ["user762285613", "이기두"],
  ["762285613", "이기두"],
  ["user628592383", "김민아"],
  ["628592383", "김민아"],
  ["user8765431174", "황성욱"],
  ["8765431174", "황성욱"],
  ["user5983360765", "구정모"],
  ["5983360765", "구정모"],
]);

function canonicalizeTeamMemberName(name, id = "") {
  const idHit = TEAM_CANONICAL_NAME_BY_ID.get(String(id || "").trim());
  if (idHit) return idHit;
  const raw = String(name || "").trim();
  return TEAM_CANONICAL_NAME_ALIASES.get(raw) || raw;
}

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

function isPrivateChat(chat) {
  return chat?.type === "private";
}

function isGroupChat(chat) {
  return chat?.type === "group" || chat?.type === "supergroup";
}

function getRoomTitleForMessage(message) {
  return isPrivateChat(message?.chat)
    ? "1:1"
    : (message?.chat?.title || message?.chat?.username || String(message?.chat?.id || ""));
}

function getSourceTypeForMessage(message) {
  return isPrivateChat(message?.chat) ? "telegram_private" : "telegram_group";
}

function resolveFileRoomInfo(message) {
  const chat = message?.chat || {};
  if (isGroupChat(chat) || Number(chat.id) < 0) {
    return {
      roomId: String(chat.id),
      roomTitle: chat.title || chat.username || String(chat.id),
      roomType: chat.type || "group",
      sourceType: "telegram_group",
      tags: [],
    };
  }
  const originChat = message?.forward_origin?.chat || message?.forward_from_chat || null;
  if (originChat?.id) {
    return {
      roomId: String(originChat.id),
      roomTitle: originChat.title || originChat.username || String(originChat.id),
      roomType: originChat.type || "group",
      sourceType: originChat.type === "private" ? "telegram_private" : "telegram_group",
      tags: ["forwarded"],
    };
  }
  return {
    roomId: String(chat.id || ""),
    roomTitle: "1:1",
    roomType: "private",
    sourceType: "telegram_private",
    tags: message?.forward_origin || message?.forward_from || message?.forward_sender_name
      ? ["forwarded", "원본방 확인 불가 / 1:1 전달본"]
      : [],
  };
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
  return false;
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

function isWeakUserName(name) {
  const n = String(name || "").trim();
  if (!n) return true;
  return /^(계획|담당|팀|관리자|미상|이름 없음|unknown|user_\d+)$/i.test(n);
}

function isBetterUserName(nextName, prevName) {
  const next = String(nextName || "").trim();
  const prev = String(prevName || "").trim();
  if (!next) return false;
  if (isWeakUserName(prev)) return true;
  if (isWeakUserName(next)) return false;
  return next.length >= prev.length && next !== prev;
}

function uniqueNames(...names) {
  const seen = new Set();
  const result = [];
  for (const raw of names.flat()) {
    const name = String(raw || "").trim();
    if (!name || isWeakUserName(name) || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function parseNameCandidates(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getUserNameColumnInfo(env) {
  if (!env.DB || !(await tableExists(env, "users"))) {
    return { hasCanonical: false, hasCandidates: false };
  }
  return {
    hasCanonical: await columnExists(env, "users", "canonical_name"),
    hasCandidates: await columnExists(env, "users", "name_candidates"),
  };
}

async function getCanonicalNameByTelegramId(env, telegramId, fallback = "") {
  const mappedFallback = canonicalizeTeamMemberName(fallback, telegramId);
  if (!env.DB || !telegramId) return mappedFallback || "";
  try {
    const { hasCanonical } = await getUserNameColumnInfo(env);
    const selectName = hasCanonical
      ? "COALESCE(NULLIF(canonical_name, ''), NULLIF(name, ''), ?)"
      : "COALESCE(NULLIF(name, ''), ?)";
    const row = await env.DB.prepare(`
      SELECT ${selectName} AS name
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `).bind(mappedFallback || "", String(telegramId)).first();
    return canonicalizeTeamMemberName(row?.name || mappedFallback || "", telegramId);
  } catch (e) {
    console.error("getCanonicalNameByTelegramId:", e);
    return mappedFallback || "";
  }
}

async function maybeAskCanonicalNameConflict(env, telegramId, chatId, candidates) {
  if (!env.CONVERSATIONS || !chatId || candidates.length < 3) return;
  const key = `canonical_name_choice_${telegramId}`;
  const existing = await env.CONVERSATIONS.get(key);
  if (existing) return;
  await env.CONVERSATIONS.put(key, JSON.stringify({ telegramId, chatId, candidates, askedAt: new Date().toISOString() }), { expirationTtl: 7 * 86400 });
  await sendMessage(
    env,
    chatId,
    `같은 사용자 ID에 대해 이름이 여러 개로 저장되어 있습니다.\n대표 이름으로 사용할 이름을 선택해주세요.\n` +
    candidates.slice(0, 3).map((name, idx) => `${idx + 1}. ${name}`).join("\n") +
    `\n직접 입력도 가능합니다.`
  );
}

async function handleCanonicalNameChoice(env, message, text) {
  if (!env.DB || !env.CONVERSATIONS || message.chat?.type !== "private" || !message.from?.id) return false;
  const telegramId = String(message.from.id);
  const key = `canonical_name_choice_${telegramId}`;
  const raw = await env.CONVERSATIONS.get(key);
  if (!raw) return false;
  const state = JSON.parse(raw);
  const candidates = state.candidates || [];
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.startsWith("/")) return false;
  const numeric = trimmed.match(/^[1-3]$/) ? Number(trimmed) - 1 : -1;
  const chosen = cleanName(numeric >= 0 ? candidates[numeric] : trimmed) || (numeric >= 0 ? candidates[numeric] : trimmed);
  if (!chosen) return false;
  const { hasCanonical } = await getUserNameColumnInfo(env);
  if (hasCanonical) {
    await env.DB.prepare(`
      UPDATE users
      SET canonical_name = ?, name = ?, last_seen_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(chosen, chosen, telegramId).run();
  } else {
    await env.DB.prepare(`
      UPDATE users
      SET name = ?, last_seen_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(chosen, telegramId).run();
  }
  await env.CONVERSATIONS.delete(key);
  await sendMessage(env, message.chat.id, `대표 이름을 ${chosen}으로 저장했습니다.`);
  return true;
}

async function getCanonicalUserName(env, telegramUser) {
  if (!telegramUser?.id) return getSenderName(telegramUser);
  const telegramId = String(telegramUser.id);
  const displayName = canonicalizeTeamMemberName(getSenderName(telegramUser), telegramId);
  if (!env.DB) return displayName;
  try {
    const { hasCanonical } = await getUserNameColumnInfo(env);
    const row = await env.DB.prepare(`
      SELECT name, ${hasCanonical ? "canonical_name" : "NULL AS canonical_name"}, username
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
      .bind(telegramId)
      .first();
    const canonicalName = String(row?.canonical_name || "").trim();
    const storedName = String(row?.name || "").trim();
    const canonical = canonicalizeTeamMemberName(canonicalName || (isBetterUserName(displayName, storedName) ? displayName : (storedName || displayName || (telegramUser.username ? `@${telegramUser.username}` : telegramId))), telegramId);
    if (canonical && (canonical !== storedName || (hasCanonical && canonical !== canonicalName))) {
      await env.DB.prepare(`
        UPDATE users
        SET name = ?, ${hasCanonical ? "canonical_name = COALESCE(NULLIF(canonical_name, ''), ?)," : ""} username = COALESCE(NULLIF(?, ''), username), last_seen_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `).bind(...(hasCanonical ? [canonical, canonical, telegramUser.username || "", telegramId] : [canonical, telegramUser.username || "", telegramId])).run();
    }
    return canonical;
  } catch (e) {
    console.error("getCanonicalUserName:", e);
    return displayName;
  }
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
  return false;
}

async function handleRegisterCommand(env, chatId, from) {
  await sendMessage(env, chatId, "등록 절차 없음. 메시지는 자동 저장됨.");
}

async function handleLongSharedContent(env, chatId, message) {
  await sendMessage(
    env,
    chatId,
    "핵심: 공유 내용 저장됨.\n확인: 필요 시 요약 요청 가능."
  );
}

async function upsertUser(env, from, chatId, source = "auto_message") {
  if (!env.DB || !from?.id || from.is_bot) return;
  try {
    const telegramId = String(from.id);
    const { hasCanonical, hasCandidates } = await getUserNameColumnInfo(env);
    const prev = await env.DB.prepare(`
      SELECT name, ${hasCanonical ? "canonical_name" : "NULL AS canonical_name"}, ${hasCandidates ? "name_candidates" : "NULL AS name_candidates"}
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `).bind(telegramId).first();
    const displayName = getSenderName(from);
    const candidates = uniqueNames(parseNameCandidates(prev?.name_candidates), prev?.name, prev?.canonical_name, displayName);
    const canonicalForInsert = String(prev?.canonical_name || "").trim() || displayName;
    const columns = ["telegram_id", "chat_id", "name", "username", "first_name", "last_name", "source", "last_seen_at"];
    const values = [telegramId, String(chatId || from.id), displayName, from.username || "", from.first_name || "", from.last_name || "", source, "CURRENT_TIMESTAMP"];
    if (hasCanonical) {
      columns.push("canonical_name");
      values.push(canonicalForInsert);
    }
    if (hasCandidates) {
      columns.push("name_candidates");
      values.push(JSON.stringify(candidates));
    }
    const placeholders = columns.map((name) => name === "last_seen_at" ? "CURRENT_TIMESTAMP" : "?").join(", ");
    const bindValues = values.filter((_, idx) => columns[idx] !== "last_seen_at");
    const updateSets = [
      "chat_id = excluded.chat_id",
      "name = excluded.name",
      "username = excluded.username",
      "first_name = excluded.first_name",
      "last_name = excluded.last_name",
      "source = excluded.source",
      ...(hasCanonical ? ["canonical_name = COALESCE(NULLIF(canonical_name, ''), excluded.canonical_name)"] : []),
      ...(hasCandidates ? ["name_candidates = excluded.name_candidates"] : []),
      "last_seen_at = CURRENT_TIMESTAMP",
    ];
    await env.DB.prepare(`
      INSERT INTO users (${columns.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT(telegram_id) DO UPDATE SET
        ${updateSets.join(",\n        ")}
    `).bind(...bindValues).run();
    await saveUserAlias(env, telegramId, displayName, { source, sourceTable: "users", sourceId: telegramId });
    if (prev?.name) await saveUserAlias(env, telegramId, prev.name, { source: "previous_user_name", sourceTable: "users", sourceId: telegramId });
    await maybeAskCanonicalNameConflict(env, telegramId, String(chatId || from.id), candidates);
  } catch (e) {
    console.error("upsertUser:", e);
  }
}

async function upsertRoom(env, chat) {
  if (!env.DB || !chat?.id || !isGroupChat(chat)) return;
  try {
    await dbRegisterRoom(env, chat.id, chat.title || chat.username || String(chat.id), BOT_KEY, chat.type);
  } catch (e) {
    console.error("upsertRoom:", e);
  }
}

async function upsertRoomMember(env, chat, from, source = "message") {
  if (!env.DB || !chat?.id || !from?.id || chat.type === "private" || from.is_bot) return;
  try {
    const canonicalName = await getCanonicalUserName(env, from);
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
      canonicalName,
      from.username || "",
      BOT_KEY
    ).run();
    await upsertRoomPerson(env, {
      roomId: String(chat.id),
      roomTitle: chat.title || chat.username || String(chat.id),
      telegramId: String(from.id),
      personName: canonicalName,
      canonicalName,
      username: from.username || "",
      source: source === "message" ? "telegram_message" : source,
      confidence: "confirmed",
    });
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
function kohEscapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function resolveUserName(env, userId, fallbackName = "") {
  const fallback = String(fallbackName || "공유자 확인 필요").trim();
  if (!userId || !env.DB) return fallback;
  try {
    if (!(await tableExists(env, "users"))) return fallback;
    const { hasCanonical } = await getUserNameColumnInfo(env);
    const nameExpr = hasCanonical
      ? "COALESCE(NULLIF(canonical_name,''), NULLIF(name,''), NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), NULLIF(username,''))"
      : "COALESCE(NULLIF(name,''), NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), NULLIF(username,''))";
    const row = await env.DB.prepare(
      `SELECT ${nameExpr} AS name FROM users WHERE CAST(telegram_id AS TEXT) = ? LIMIT 1`
    ).bind(String(userId)).first();
    return canonicalizeTeamMemberName(row?.name || fallback, userId) || fallback;
  } catch (_) { return canonicalizeTeamMemberName(fallback, userId) || fallback; }
}

// 안건 카테고리 자동 분류
function classifyAgenda(text) {
  const t = String(text || "").toLowerCase();
  const categories = [
    { name: "대외컴", keywords: ["언론", "보도", "기자", "pr", "comm", "커뮤니케이션", "대외", "인터뷰", "성명", "입장문", "mou", "발표"] },
    { name: "정부·정책", keywords: ["정부", "정책", "국회", "법", "규제", "지자체", "행정", "선거", "지방선거", "당선", "정치", "gr", "adr", "sec", "ipo", "상장"] },
    { name: "노사·인사", keywords: ["노사", "성과급", "임금", "복리", "직원", "구성원", "채용", "퇴직", "인사", "승진", "조직", "the소통", "더소통"] },
    { name: "사내 보고", keywords: ["보고", "kpi", "실적", "공과기술서", "pre-emd", "pmo", "tf", "월간", "주간", "검토", "승인", "결재", "6r", "monthly"] },
    { name: "사업·전략", keywords: ["전략", "사업", "비전", "선포식", "로드맵", "투자", "협력", "파트너", "계약", "ai factory", "hbm", "낸드", "반도체"] },
    { name: "위기·이슈", keywords: ["화재", "사고", "위기", "리스크", "대응", "m15", "mx", "생산차질", "품질", "recall", "리콜"] },
    { name: "글로벌·외신", keywords: ["외신", "nikkei", "bloomberg", "reuters", "nvidia", "젠슨황", "엔비디아", "intel", "tsmc", "글로벌", "해외"] },
    { name: "행사·이벤트", keywords: ["행사", "이벤트", "포럼", "컨퍼런스", "세미나", "방문", "미팅", "간담회", "니케이"] },
  ];
  for (const cat of categories) {
    if (cat.keywords.some(kw => t.includes(kw))) return cat.name;
  }
  return "업무 안건";
}

// 내용에서 실제 안건명 생성 (응답 문장 제거)
function generateAgendaTitle(content, category) {
  const text = String(content || "").trim();
  const removePatterns = [
    /^(네|넵|알겠습니다|확인하겠습니다|반영하겠습니다|수정하겠습니다|진행하겠습니다|검토하겠습니다|전달하겠습니다)[.,\s]*/,
    /^(그리하겠습니다|그렇게하겠습니다|말씀드립니다|보고드립니다)[.,\s]*/,
    /^(담당님|사장님|팀장님)[,\s]+(네|넵|알겠|확인)[.,\s]*/,
    /Telegram export file[^\n]*/gi,
    /^photo\.|^image\./i,
    /\s*(으로|로|이라고|라고)\s*$/,
  ];
  const lines = text.split(/[\n]/);
  for (const line of lines) {
    let clean = line.trim();
    for (const p of removePatterns) clean = clean.replace(p, "").trim();
    if (/^(네|넵|알|반영|수정|확인|검토|전달|진행|그리하|말씀|보고).{0,5}(겠습니다|하겠|드립니다)/.test(clean)) continue;
    if (clean.length < 8 || clean.length > 50) continue;
    return `[${category}] ${clean}`;
  }
  const firstMeaningful = lines
    .map(l => l.trim())
    .filter(l => l.length >= 8 && !removePatterns.some(p => p.test(l)))
    .filter(l => !/^(네|넵|알겠|반영|수정|확인|검토|진행|그리하|말씀|보고)/.test(l))
    [0] || "";
  return firstMeaningful.length >= 5
    ? `[${category}] ${firstMeaningful.slice(0, 35)}`
    : `[${category}] 업무 자료`;
}

function inferTitle(row) {
  const raw = String(row.summary || row.extracted_text || row.content || "").trim();
  if (raw) {
    const agendaMatch = raw.match(/\[안건\d+\]\s*(.{5,40})(?:\n|$)/);
    if (agendaMatch) return agendaMatch[1].trim();
    const category = classifyAgenda(raw);
    return generateAgendaTitle(raw, category);
  }
  if (row.file_name && !/^photo[_@.-]/i.test(row.file_name)) {
    const name = String(row.file_name)
      .replace(/\.[a-zA-Z0-9]{1,6}$/, "")
      .replace(/[@_\-\d]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length >= 4) {
      const category = classifyAgenda(name);
      return `[${category}] ${name.slice(0, 35)}`;
    }
  }
  return "[업무 안건] 자료 확인 필요";
}

function kohResolveRoomTitle(row, personName = "") {
  const roomId = Number(row?.room_id || 0);
  if (roomId > 0) {
    const name = String(personName || "").trim();
    return name && name !== "공유자 확인 필요" ? `1:1(${name})` : "1:1";
  }
  const t = String(row?.room_title || row?.joined_room_title || "").trim();
  return (t && t !== "1:1") ? t : "알 수 없는 방";
}

function kohIsJunkMessage(content = "") {
  const t = String(content || "").trim();
  if (!t || t.length <= 2) return true;
  if (/^[ㅋㅎㅠㅜㄷ\s]+$/.test(t)) return true;
  if (/^(ㅋ+|ㅎ+|ㄷ+|ㅠ+|ㅜ+|👍|😂|🤣|ㅋㅋ|ㅎㅎ)$/.test(t)) return true;
  return false;
}

function kohNormalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/@[\w_]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function kohExtractSearchTerms(text = "") {
  const stopWords = new Set([
    "자료", "파일", "문서", "보고자료", "보고내용", "내용", "상세", "요약", "정리",
    "보내줘", "공유해줘", "첨부해줘", "알려줘", "찾아줘", "줘", "해줘", "보여줘",
    "어디", "위치", "관련", "내가", "포함된", "방들", "단체방", "다른방",
    "다른", "에서도", "오늘", "어제", "이번주", "지난주", "최근", "있는",
    "있던", "된거", "공유된", "전체", "기준", "보고", "안건", "회의",
    "일정", "먼저", "챙겨야", "확인", "필요", "해라", "해줘라",
    "전부", "다", "모두", "것들", "거", "것", "뭐야", "뭐가", "뭐",
    "있어", "있지", "어떤", "올라온", "첨부된", "저장된", "된", "공유됐",
    "일주일", "최근에", "요즘", "이번", "지난", "알려", "보여", "해줘",
    "목록", "리스트", "정리해", "알려줘야", "해라", "해줘라", "해줘야",
    "여기방", "아까", "그거", "그것", "이거", "이것", "저거", "저것",
    "방에서", "단톡방", "포함된방", "좀", "조", "줘라"
  ]);

  const stopSuffix = /^(요약|정리|알려|보여|보내|전달|공유|찾아|확인|첨부|올려)(해줘|해라|해야|해|줘|야)$|^(있어|있지|뭐야|뭐가|뭐있어|뭐있었|올라온|공유됐|공유된|됐어|됐지|됩니다)$/;

  // 1. 복합 키워드 우선 추출 (2~4단어 조합이 더 정확)
  const compoundPatterns = [
    { re: /M15\s*화재|화재\s*대응|청주\s*화재|화재\s*커뮤니케이션/i, term: "M15화재" },
    { re: /AI\s*Agent|에이전트\s*도입|1인\s*1\s*AI/i, term: "AIAgent" },
    { re: /비전\s*선포식|New\s*Vision|선포식/i, term: "비전선포식" },
    { re: /솔리다임|EPIC\s*Semi|MOU\s*체결/i, term: "솔리다임MOU" },
    { re: /ADR\s*상장|해외\s*상장|SEC.*IPO/i, term: "ADR상장" },
    { re: /KPI.*보고|공과기술서|사장님.*KPI/i, term: "KPI보고" },
    { re: /지방선거|선거\s*결과|6\.3\s*선거/i, term: "지방선거" },
    { re: /The소통|더소통|성과급.*Q&A/i, term: "The소통" },
    { re: /엔비디아|젠슨\s*황|NVIDIA/i, term: "엔비디아" },
    { re: /니케이\s*포럼|포럼.*TM|TM.*아젠다/i, term: "니케이포럼" },
  ];

  const foundCompounds = [];
  for (const { re, term } of compoundPatterns) {
    if (re.test(text)) foundCompounds.push(term);
  }

  // 복합 키워드 있으면 단어 분리 없이 그것만 사용 (노이즈 차단)
  if (foundCompounds.length > 0) return foundCompounds;

  // 2. 단어 분리 (복합 없을 때)
  return [...new Set(
    kohNormalizeText(text)
      .split(" ")
      .map(t => t.trim())
      .filter(t => t.length >= 2)
      .filter(t => !stopWords.has(t))
      .filter(t => !stopSuffix.test(t))
      .slice(0, 6)
  )];
}

function kohIsInternalKnowledgeRequest(text = "") {
  const t = String(text || "").trim();

  if (/^\/\w+/.test(t)) return false;
  if (isGeneralChatQuery(t)) return false;

  const hasInternalCue =
    /(자료|파일|문서|보고자료|보고내용|내용|상세|요약|정리|어디|위치|보내줘|공유해줘|첨부해줘|알려줘|포함된\s*방|다른\s*방|단체방|공유된|챙겨야|우선순위|안건|회의|일정|올라온|첨부된|저장된|뭐야|있어|뭐있어|뭐있었|전달해줘|공유됐|보여줘.*자료|자료.*보여줘|무슨\s*얘기|논의|뭐부터|먼저\s*챙길|핵심만|자세히|보고용)/.test(t);

  const isPureExternal =
    /(뉴스|기사|웹검색|외부검색|검색해줘|오늘자\s*뉴스|시사|최신\s*동향)/.test(t) &&
    !/(방|대화|공유|자료|파일|문서|보고내용|우리|저희|팀)/.test(t);

  return hasInternalCue && !isPureExternal;
}

// ── GENERAL_CHAT hard guard ────────────────────────────────────────────────
function isGeneralChatQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return false;

  const casualPatterns = [
    /^(안녕|하이|hello|hi|헬로)$/i,
    /^(뭐해|뭐하니|뭐하고\s*있어|모해)\??$/,
    /^(밥\s*먹었니|밥\s*먹었어|밥\s*먹었냐|식사했어|식사\s*했니|점심\s*먹었어|저녁\s*먹었어)\??$/,
    /^(잘\s*지내|잘\s*있어|괜찮아)\??$/,
    /^(고마워|감사|땡큐|thanks)$/i,
    /^(테스트|대답해봐|응답해봐|살아있어)\??$/,
    /^(너\s*누구야|넌\s*누구야|너는\s*뭐야)\??$/,
    /^(왜\s*안\s*돼|왜안돼|이거\s*왜\s*안돼|이거\s*돼|작동해)\??$/,
    /^(어떻게\s*해|어케\s*해|어떻게\s*테스트|테스트\s*어떻게)\??$/,
  ];
  if (casualPatterns.some(p => p.test(q))) return true;

  const workIntentKeywords = [
    "자료", "파일", "문서", "보고", "요약", "정리", "공유", "보내", "전달",
    "회의", "일정", "마감", "액션", "해야", "챙겨", "확인", "안건",
    "이슈", "6r", "gr", "pr", "ir", "cr", "br", "er",
    "뉴스", "기사", "검색", "찾아", "어디", "리스트", "목록",
    "최근", "이번주", "오늘까지", "내일", "방금", "이 내용", "이거 요약",
    "올라온", "첨부", "저장", "공유됐", "올라왔"
  ];
  const hasWorkIntent = workIntentKeywords.some(k => q.includes(k));
  if (!hasWorkIntent && q.length <= 25) return true;

  return false;
}

function makeGeneralChatReply(query) {
  const q = String(query || "").trim();
  if (/밥\s*먹었|식사|점심|저녁/.test(q)) return "아직 못 먹었어요. 식사 하셨어요?";
  if (/뭐해|뭐하니|뭐하고/.test(q)) return "대기 중이에요. 자료 정리나 회의 내용 요약이 필요하면 바로 도와드릴게요.";
  if (/안녕|하이|hello|hi/i.test(q)) return "안녕하세요. 필요한 자료나 안건 있으면 말씀해주세요.";
  if (/테스트|대답해봐|응답/.test(q)) return "응답 정상입니다.";
  if (/왜\s*안\s*돼|왜안돼|이거\s*돼|작동/.test(q)) return "현재 동작은 확인됐어요. 어떤 기능이 안 되는지 알려주시면 기준으로 점검해볼게요.";
  if (/누구야|뭐야/.test(q)) return "저는 권오혁 담당님의 AI 비서입니다. 자료 찾기, 요약, 안건 정리 등을 도와드려요.";
  return "네, 말씀해주세요.";
}

function isBotGeneratedSummary(text, senderName = "") {
  const t = String(text || "");
  const s = String(senderName || "").toLowerCase();
  if (s.includes("bot") || s.includes("koh_ai_bot")) return true;
  if (t.includes("📌 [") && t.includes("· 위치:")) return true;
  if (t.includes("· 공유자:") && t.includes("· 핵심")) return true;
  if (t.includes("관련 파일은 아래와 같습니다")) return true;
  if (t.includes("📌") && t.includes("위치:")) return true;
  if (t.includes("공유/전달:") && t.includes("📌")) return true;
  if (/저장된 파일\s*\d+건입니다/.test(t)) return true;
  return false;
}

// ── 현재 입력 번들 추출 ────────────────────────────────────────────────────
function getCurrentInputBundle(message) {
  const bundle = { type: null, text: "", meta: {} };
  if (!message) return bundle;

  const reply = message.reply_to_message;
  const forward = message.forward_origin || message.forward_from;
  const text = message.text || message.caption || "";

  if (reply) {
    bundle.type = "reply";
    bundle.text = reply.text || reply.caption || "";
    bundle.meta.sharedBy = reply.from ? (reply.from.first_name || "") + (reply.from.last_name ? " " + reply.from.last_name : "") : "";
    bundle.meta.messageId = reply.message_id;
    bundle.meta.date = reply.date ? new Date(reply.date * 1000).toISOString() : "";
    return bundle;
  }

  if (forward) {
    bundle.type = "forward";
    bundle.text = text;
    if (message.forward_origin) {
      const origin = message.forward_origin;
      if (origin.type === "user" && origin.sender_user) {
        bundle.meta.originalAuthor = (origin.sender_user.first_name || "") + (origin.sender_user.last_name ? " " + origin.sender_user.last_name : "");
      } else if (origin.type === "channel" && origin.chat) {
        bundle.meta.originalAuthor = origin.chat.title || "";
      } else if (origin.type === "hidden_user") {
        bundle.meta.originalAuthor = origin.sender_user_name || "알 수 없음";
      }
    }
    return bundle;
  }

  if (text && text.length > 30) {
    bundle.type = "direct";
    bundle.text = text;
    return bundle;
  }

  return bundle;
}

function hasCurrentContentForSummary(message, cleanedQuery = "") {
  if (!message) return false;
  if (message.reply_to_message) {
    const rt = message.reply_to_message.text || message.reply_to_message.caption || "";
    if (rt.trim().length > 20) return true;
  }
  if (message.forward_origin || message.forward_from) {
    const ft = message.text || message.caption || "";
    if (ft.trim().length > 10) return true;
  }
  return false;
}

function formatShortDate(isoOrUnix) {
  if (!isoOrUnix) return "";
  let d;
  if (typeof isoOrUnix === "number") d = new Date(isoOrUnix * 1000);
  else d = new Date(isoOrUnix);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function cleanOneLine(text = "") {
  return String(text || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanTitle(text = "") {
  return cleanOneLine(text)
    .replace(/^[\s\-·•:：]+/, "")
    .slice(0, 40);
}

function escapeHtml(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeDisplayFileName(name) {
  const s = String(name || "")
    .replace(/@/g, "＠")
    .replace(/\s+/g, " ")
    .trim();
  // Never expose raw photo/image filenames
  if (/^photo[_@.-]|^image[_@.-]/i.test(s)) return "";
  return s;
}

function extractScheduleFromText(text = "") {
  const patterns = [
    /(\d{1,2}월\s*\d{1,2}일[^\n,。.]{0,30})/g,
    /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}[^\n,。.]{0,20})/g,
    /(오늘|내일|모레|이번\s*주|다음\s*주)[^\n,。.]{0,20}/g,
    /(마감|데드라인|제출|발표|보고)[^\n,。.]{0,20}/g,
  ];
  const found = [];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(text)) !== null) {
      const s = m[1] || m[0];
      if (s) found.push(cleanOneLine(s).slice(0, 30));
      if (found.length >= 2) break;
    }
    if (found.length >= 2) break;
  }
  return found.length ? found[0] : "";
}

function inferSixRByRule(text = "") {
  if (!text) return "";
  const t = text.toLowerCase();
  if (/(위기|사고|긴급|리콜|클레임|민원|대응|사과)/.test(t)) return "CR";
  if (/(정부|규제|법령|국회|정책|허가|승인|공문|행정)/.test(t)) return "GR";
  if (/(노조|노사|인사|채용|징계|직원|인력|조합)/.test(t)) return "PR";
  if (/(투자자|주주|ir|공시|실적|재무|배당)/.test(t)) return "IR";
  if (/(미디어|기자|언론|보도|인터뷰|취재|기사)/.test(t)) return "ER";
  if (/(전략|사업|계획|목표|성과|추진|협력|파트너)/.test(t)) return "BR";
  return "";
}

function extractActionItemsByRule(text = "") {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const actions = [];
  const actionPatterns = [
    /^[-·•]\s*(.+(?:해야|할 것|검토|확인|제출|보고|전달|조치|결정)[^.。\n]*)/,
    /^(\d+[.)]\s*.+(?:해야|할 것|검토|확인|제출|보고|전달)[^.。\n]*)/,
    /(.+(?:요청|지시|지시사항|담당|책임자)[^.。\n]*(?:해야|할 것|필요))/,
  ];
  for (const line of lines) {
    for (const p of actionPatterns) {
      const m = p.exec(line);
      if (m) {
        actions.push(cleanOneLine(m[1] || m[0]).slice(0, 60));
        break;
      }
    }
    if (actions.length >= 3) break;
  }
  return actions;
}

async function summarizeCurrentContent(env, text, userId) {
  if (!text || text.trim().length < 20) return text;
  const prompt = `다음 내용을 핵심만 2~3줄로 요약하라. 사실만, 추정 금지, 원문 문장 그대로 복붙 금지.\n\n${text.slice(0, 3000)}`;
  try {
    const r = await difyChat(env, { query: prompt, user: userId || "koh", conversationId: "" });
    return (r.answer || "").trim();
  } catch (e) {
    return text.slice(0, 200);
  }
}

async function generateSmartIssueTitle(env, text, userId) {
  if (!text || text.trim().length < 10) return "";
  const cleaned = cleanSourceTextForSummary(text);
  const prompt =
    `다음 자료를 읽고 업무 안건 제목을 10~25자 명사형으로 만들어줘.\n\n` +
    `[금지]\n` +
    `- 본문 문장 그대로 쓰기 금지\n` +
    `- 담당님/사장님으로 시작 금지\n` +
    `- 올려드립니다/첨부합니다/보내드립니다/검토하겠습니다 금지\n` +
    `- PMO는...처럼 설명문을 제목으로 쓰기 금지\n` +
    `- 파일명/photo/Telegram export 금지\n` +
    `- [PR/ER], [카테고리] prefix 붙이지 말 것\n\n` +
    `[좋은 제목 예시]\n` +
    `비전선포식 추진 계획\n` +
    `지방선거 결과 대응 전략\n` +
    `ADR 상장 커뮤니케이션 방안\n\n` +
    `[자료]\n${cleaned.slice(0, 3000)}\n\n제목만 출력:`;
  try {
    const r = await difyChat(env, { query: prompt, user: userId || "koh", conversationId: "" });
    const title = cleanTitle(r.answer || "");
    if (isValidIssueTitle(title)) return title.slice(0, 35);
    return "";
  } catch (e) {
    return "";
  }
}

async function extractActionItemsFromText(env, text, userId) {
  const rulebased = extractActionItemsByRule(text);
  if (rulebased.length > 0) return rulebased;
  const prompt = `다음 내용에서 즉각 조치·확인이 필요한 액션아이템만 최대 3개 추출. 없으면 빈 줄만. 항목당 한 줄.\n\n${text.slice(0, 2000)}`;
  try {
    const r = await difyChat(env, { query: prompt, user: userId || "koh", conversationId: "" });
    return (r.answer || "").split("\n").map(l => l.trim()).filter(l => l.length > 3).slice(0, 3);
  } catch (e) {
    return [];
  }
}

async function buildIssueCardFromCurrentText(env, bundle, query, userId) {
  const rawText = bundle.text;
  if (!rawText || rawText.trim().length < 20) return null;

  const sixR = inferSixRByRule(rawText);
  const category = sixR ? `[${sixR}]` : "";
  const title = await generateSmartIssueTitle(env, rawText, userId);
  if (!title) return null;

  const summary = await summarizeCurrentContent(env, rawText, userId);
  const schedule = extractScheduleFromText(rawText);
  const actions = await extractActionItemsFromText(env, rawText, userId);

  const actor = bundle.meta.sharedBy || bundle.meta.originalAuthor || "";
  const dateStr = formatShortDate(bundle.meta.date);

  return { category, title, summary, schedule, actions, actor, dateStr, sixR };
}

function formatIssueCard(card) {
  if (!card) return "";
  if (typeof formatReportCard === "function") return formatReportCard(card);
  const sixRStr = Array.isArray(card.six_r) && card.six_r.length
    ? card.six_r.join("/")
    : (card.sixR && typeof card.sixR === "string" ? card.sixR : "업무");
  const category = card.agenda_category || "업무 안건";
  const issueTitle = card.issue_title || card.title || "주요 이슈 확인 필요";
  const actionItems = Array.isArray(card.action_items) ? card.action_items
    : (Array.isArray(card.actions) ? card.actions : []);

  const lines = [];
  lines.push(`📌 <b>[${escapeHtml(sixRStr)}] [${escapeHtml(category)}] ${escapeHtml(issueTitle)}</b>`);

  const summaryRaw = card.summary || "";
  const summaryOut = summaryRaw
    ? (cleanSourceTextForSummary(summaryRaw).split("\n").filter(Boolean)[0] || summaryRaw.split("\n")[0] || summaryRaw).slice(0, 200)
    : "본문에서 확인 가능한 업무 내용이 제한적임.";
  lines.push(`· <b>내용</b>: ${escapeHtml(summaryOut)}`);

  if (actionItems.length) {
    lines.push(`· <b>액션</b>: ${escapeHtml(actionItems.slice(0, 3).join(", "))}`);
  }

  lines.push(`· <b>위치</b>: ${formatSourceLocation(card)}`);

  const actor = card.original_author || card.shared_by || card.actor || card.uploader || "공유자 확인 필요";
  const dateStr = card.date || card.dateStr || "";
  lines.push(`· <b>공유/전달</b>: <u>${escapeHtml(actor)}</u>${dateStr ? " / " + escapeHtml(dateStr) : ""}`);

  const schedule = card.schedule || "";
  if (schedule) lines.push(`⚡ 마감/일정: ${escapeHtml(schedule)}`);

  return lines.join("\n");
}

async function handleCurrentContentSummary(env, message, query, chatId, userId) {
  const bundle = getCurrentInputBundle(message);
  if (!bundle.text || bundle.text.trim().length < 20) {
    await sendMessage(env, chatId, "요약할 내용이 없습니다. 메시지를 답장하거나 전달해주세요.");
    return true;
  }

  const card = await buildIssueCardFromCurrentText(env, bundle, query, userId);
  if (card) {
    const formatted = formatIssueCard(card);
    await kohSendHtml(env, chatId, formatted);
  } else {
    const summary = await summarizeCurrentContent(env, bundle.text, userId);
    await sendMessage(env, chatId, summary || "요약 결과를 생성할 수 없습니다.");
  }
  return true;
}

// ── 소스 텍스트 정제 ──────────────────────────────────────────────────────────
function cleanSourceTextForSummary(text) {
  return String(text || "")
    .split(/\n+|\/+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !/^(네|넵|알겠습니다|확인하겠습니다|반영하겠습니다|수정하겠습니다|진행하겠습니다|검토하겠습니다|전달하겠습니다)/.test(s))
    .filter(s => !/^(그러하겠습니다|그리하겠습니다|말씀드립니다|보고드립니다)/.test(s))
    .filter(s => !/^(담당님|사장님|팀장님)[,\s]*$/.test(s))
    .filter(s => !/(올려드립니다|첨부와 같이|파일로도 올려|보내주셔도 될 것|마이너한 얘기지만)/.test(s))
    .filter(s => !/^photo[_@.-]/i.test(s))
    .filter(s => !/Telegram export file/i.test(s))
    .filter(s => !/저장된 파일 \d+건입니다/.test(s))
    .filter(s => !/관련 파일 \d+건/.test(s))
    .filter(s => !/🧩 내용|📎 위치|👤 공유자/.test(s))
    .filter(s => !/📌\s*</.test(s))
    .filter(s => !/제공된 파일 내용이 없어/.test(s))
    .join("\n")
    .trim();
}

function looksLikeBadRawTitle(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.length > 45) return true;
  if (/^(담당님|사장님|팀장님|네|넵|알겠|확인|반영|수정|검토|전달)/.test(t)) return true;
  if (/(올려드립니다|첨부|보내드립니다|파일로도 올려|마이너한 얘기지만|그러하겠습니다)/.test(t)) return true;
  if (/^photo[_@.-]/i.test(t)) return true;
  if (/@\d{2}-\d{2}-\d{4}/.test(t)) return true;
  if (/Telegram export/i.test(t)) return true;
  if (/PMO는|W\/G 기반|진행을 목표로|관련 동향을 첨부/.test(t)) return true;
  return false;
}

function makeSafeIssueTitleFromText(text, fallback = "주요 이슈 확인 필요") {
  const cleaned = cleanSourceTextForSummary(text || "");
  const rules = [
    { re: /(New Vision|비전\s*선포식|선포식)/i, title: "비전선포식 추진 계획" },
    { re: /(ADR|나스닥|상장)/i, title: "ADR 상장 커뮤니케이션 방안" },
    { re: /(지방선거|선거|지자체|당선)/i, title: "지방선거 결과 대응 전략" },
    { re: /(KPI|공과기술서|5월\s*실적|사장님\s*KPI|성과)/i, title: "사장 KPI 보고 자료" },
    { re: /(업무흐름|업무\s*흐름|정의서)/i, title: "업무흐름정의서 검토 자료" },
    { re: /(브리핑|내일\s*오전|아침\s*보고)/i, title: "브리핑 후보 안건" },
  ];
  for (const r of rules) {
    if (r.re.test(cleaned)) return r.title;
  }
  const first = cleaned
    .split(/[.\n]/)
    .map(s => s.trim())
    .filter(s => s.length >= 6)
    .filter(s => !looksLikeBadRawTitle(s))[0];
  if (first && !looksLikeBadRawTitle(first)) return first.slice(0, 30);
  return fallback;
}

function makeSafeSummaryFromText(text) {
  const cleaned = cleanSourceTextForSummary(text || "");
  if (/(KPI|공과기술서|5월\s*실적|사장님\s*KPI)/i.test(cleaned))
    return "사장 KPI 보고 및 실적 점검 관련 자료가 공유됨. 보고 범위와 추가 확인사항 검토가 필요합니다.";
  if (/(New Vision|비전\s*선포식|선포식)/i.test(cleaned))
    return "SK하이닉스 New Vision 선포식 추진 관련 자료가 공유됨. 행사 콘셉트와 메시지 방향 확인이 필요합니다.";
  if (/(ADR|나스닥|상장)/i.test(cleaned))
    return "ADR 상장 관련 커뮤니케이션 방안 자료가 공유됨. 대외 메시지와 이해관계자별 대응 검토가 필요합니다.";
  if (/(지방선거|선거|지자체|당선)/i.test(cleaned))
    return "지방선거 결과와 관련된 대응 전략 자료가 공유됨. 지역별 정책·커뮤니케이션 포인트 확인이 필요합니다.";
  if (/(업무흐름|업무\s*흐름|정의서)/i.test(cleaned))
    return "업무흐름 정의 관련 자료가 공유됨. 프로세스와 역할 구분 확인이 필요합니다.";
  return "본문에서 확인 가능한 업무 내용이 제한적임.";
}

function isImageCandidate(c) {
  const t = String(c.file_type || c.mime_type || c.file_name || "").toLowerCase();
  return t.includes("photo") || t.includes("image") || /\.(jpg|jpeg|png|webp)$/i.test(t);
}

function groupImageCandidates(candidates) {
  const groups = new Map();
  const nonImages = [];
  for (const c of candidates || []) {
    if (!isImageCandidate(c)) { nonImages.push(c); continue; }
    const room = c.room_id || c.room_title || "";
    const uploader = c.uploader_id || c.uploader_name || c.sender_name || "";
    const time = new Date(c.created_at || Date.now()).getTime();
    const bucket = c.media_group_id || Math.floor(time / (3 * 60 * 1000));
    const key = c.media_group_key ? `mgk:${c.media_group_key}` : `${room}:${uploader}:${bucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return { imageGroups: [...groups.values()], nonImages };
}

async function buildIssueCardFromImageGroup(rows, env) {
  const first = rows[0] || {};
  const basisText = cleanSourceTextForSummary(
    rows.map(r => [r.summary, r.extracted_text, r.content, r.text, r.caption].filter(Boolean).join("\n")).join("\n")
  );
  const title = makeSafeIssueTitleFromText(basisText, "이미지 내용 확인 필요");
  const summary = basisText
    ? makeSafeSummaryFromText(basisText)
    : "이미지 텍스트가 추출되지 않아 안건 요약이 필요합니다. OCR 또는 원본 확인이 필요합니다.";
  return {
    issue_title: title,
    agenda_category: typeof classifyAgenda === "function" ? classifyAgenda(basisText || title) : "업무 안건",
    summary,
    six_r: typeof inferSixRByRule === "function" ? [inferSixRByRule(basisText || title)].flat().filter(Boolean) : [],
    action_items: [],
    source_type: "image_group",
    image_count: rows.length,
    source_room: first.original_room || first.room_title || "",
    original_room: first.original_room || "",
    source_file: "",
    display_file_name: `이미지 ${rows.length}장`,
    telegram_file_id: first.telegram_file_id || "",
    can_send_original: rows.some(r => r.telegram_file_id || r.r2_key),
    from_name: first.from_name || first.sender_name || "",
    shared_by: first.from_name || first.sender_name || "미확인",
    uploader: first.from_name || first.sender_name || "미확인",
    date: typeof formatShortDateFromValue === "function" ? formatShortDateFromValue(first.created_at) : "",
  };
}

function formatSourceLocation(card) {
  const room = card.source_room ? `[${escapeHtml(card.source_room)}]` : "";
  if (card.source_type === "image_group") return `${room} &gt; 이미지 ${card.image_count || 1}장`;
  if (card.source_type === "image") return `${room} &gt; 이미지 1장`;
  const file = card.display_file_name
    || (typeof sanitizeDisplayFileName === "function" ? sanitizeDisplayFileName(card.source_file || "") : card.source_file || "");
  return file ? `${room} &gt; ${escapeHtml(file)}` : room;
}

function formatResendCandidateLine(candidate, index) {
  const rawText = [candidate.summary, candidate.extracted_text, candidate.content, candidate.text, candidate.file_name].filter(Boolean).join("\n");
  const safeFile = typeof sanitizeDisplayFileName === "function" ? sanitizeDisplayFileName(candidate.file_name || "자료") : (candidate.file_name || "자료");
  let title = makeSafeIssueTitleFromText(rawText, safeFile);
  if (looksLikeBadRawTitle(title)) title = safeFile || "자료 원본";
  const room = candidate.room_title || candidate._resolvedRoom || "위치 확인 필요";
  const uploader = candidate._resolvedName || candidate.uploader_name || candidate.sender_name || "공유자 확인 필요";
  const date = typeof formatShortDateFromValue === "function" ? formatShortDateFromValue(candidate.created_at || candidate.date) : "";
  const canSend = candidate.telegram_file_id ? "전송 가능" : "전송 불가";
  return `${index}. ${escapeHtml(title)} — [${escapeHtml(room)}] / ${escapeHtml(uploader)}${date ? " / " + escapeHtml(date) : ""} / ${canSend}`;
}

function containsLegacyOutput(text) {
  const t = String(text || "");
  return (
    t.includes("🧩 내용") ||
    t.includes("📎 위치") ||
    t.includes("👤 공유자/일자") ||
    t.includes("👤 공유자") ||
    t.includes("저장된 파일") ||
    t.includes("[[사내 보고]") ||
    t.includes("[[대외컴]") ||
    t.includes("[[업무 안건]") ||
    /photo[_]\d+@/.test(t)
  );
}

function isRecentMaterialBriefRequest(query) {
  const q = String(query || "").trim();
  return /(주요\s*자료\s*(요약|정리)|최근\s*(공유된\s*)?자료\s*(뭐야|정리|확인|요약)|오늘\s*공유된\s*자료|공유\s*자료\s*정리|올라온\s*자료\s*(정리|요약)|주요\s*안건\s*정리|최근\s*주요\s*이슈)/.test(q);
}

function isBriefingRequestCheck(query) {
  const q = String(query || "").trim();
  return /(브리핑|내일\s*오전|아침\s*보고|내일\s*보고|챙길\s*안건|확인할\s*안건|보고할\s*안건)/.test(q);
}

function isFileResendRequestCheck(query) {
  const q = String(query || "").trim();
  return /(보내줘|전달해줘|공유해줘|원본\s*보내|파일\s*보내|첨부해줘|^\d+번\s*(보내|전달|공유|원본))/.test(q);
}

function isMaterialFindRequestCheck(query) {
  const q = String(query || "").trim();
  if (isFileResendRequestCheck(q)) return false;
  if (isRecentMaterialBriefRequest(q)) return false;
  if (isBriefingRequestCheck(q)) return false;
  return /(찾아줘|어디\s*있|있어\?*|확인해줘|알려줘|관련\s*자료|자료\s*뭐야|자료\s*있어|논의\s*내용|보고자료\s*확인)/.test(q);
}

function removeChatNoiseLines(text) {
  return String(text || "")
    .split(/\n+|\/+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !/^(네|넵|알겠습니다|확인하겠습니다|반영하겠습니다|수정하겠습니다|진행하겠습니다|검토하겠습니다|전달하겠습니다)/.test(s))
    .filter(s => !/^(그러하겠습니다|그리하겠습니다|말씀드립니다|보고드립니다)/.test(s))
    .filter(s => {
      if (!/^(담당님|사장님|팀장님)[,\s]*/.test(s)) return true;
      return /(계획|보고|자료|전략|방안|이슈|일정|실적|KPI|ADR|Vision|선포식)/i.test(s);
    })
    .filter(s => !/(올려드립니다|첨부와 같이|파일로도 올려|보내주셔도 될 것|마이너한 얘기지만)/.test(s))
    .filter(s => !/^photo[_@.-]/i.test(s))
    .filter(s => !/Telegram export file/i.test(s))
    .join("\n")
    .trim();
}

function looksLikeRawChatResponse(text) {
  const t = String(text || "").trim();
  if (/^(네|넵|알겠|확인|반영|수정|검토|전달|그러하겠습니다)/.test(t)) return true;
  if (/^(담당님|사장님|팀장님)[,\s]/.test(t)) return true;
  if (/(올려드립니다|첨부와 같이|파일로도 올려|보내주셔도 될 것|마이너한 얘기지만)/.test(t)) return true;
  if (/^photo[_@.-]/i.test(t)) return true;
  return false;
}

function isValidIssueTitle(title) {
  const t = String(title || "").trim();
  if (t.length < 5 || t.length > 40) return false;
  if (/^(담당님|사장님|팀장님|네|넵|알겠|확인|반영|수정|검토|전달)/.test(t)) return false;
  if (/(올려드립니다|첨부|보내드립니다|그러하겠습니다|검토하겠습니다)/.test(t)) return false;
  if (/^photo[_@.-]/i.test(t)) return false;
  if (/Telegram export/i.test(t)) return false;
  return true;
}

function extractDynamicSearchTerms(query) {
  const q = String(query || "").trim();
  const stopwords = new Set([
    "자료", "파일", "문서", "관련", "찾아줘", "찾아", "어디", "있어", "있나요",
    "알려줘", "확인해줘", "보여줘", "요약", "정리", "공유", "보내줘",
    "원본", "좀", "해줘", "뭐야", "무엇", "최근", "올라온", "공유된", "것", "거"
  ]);
  const terms = [];

  // 따옴표 안 표현 우선
  const quoted = [...q.matchAll(/[""']([^""']{2,40})[""']/g)].map(m => m[1].trim());
  terms.push(...quoted);

  // 패턴 추출
  const patterns = [
    /(.{2,30})\s*관련\s*(자료|파일|문서|이슈|논의|보고자료)/,
    /(.{2,30})\s*(자료|파일|문서|보고자료|회의자료|논의|이슈)\s*(찾아|어디|있|알려|보여)/,
    /(.{2,30})\s*(찾아줘|어디\s*있|있어\??|알려줘|확인해줘)/,
  ];
  for (const p of patterns) {
    const m = q.match(p);
    if (m && m[1] && m[1].trim().length >= 2) terms.push(m[1].trim());
  }

  // 토큰 추출: 한글/영문/숫자 2자 이상, stopword 제외
  const tokens = q
    .replace(/[^\p{L}\p{N}\s·._-]/gu, " ")
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length >= 2)
    .filter(x => !stopwords.has(x));
  terms.push(...tokens);

  return [...new Set(
    terms
      .map(t => t.replace(/^(그|이|저)\s*/, "").trim())
      .map(t => t.replace(/\s*(관련|자료|파일|문서|보고자료|찾아줘|알려줘|어디.*)$/, "").trim())
      .filter(t => t.length >= 2)
      .filter(t => !stopwords.has(t))
  )].slice(0, 8);
}

function expandSearchTerms(terms) {
  const aliasMap = {
    "비전선포식": ["New Vision", "Vision", "선포식", "비전 선포"],
    "ADR": ["ADR 상장", "나스닥", "상장", "Global AI Infra"],
    "지방선거": ["선거", "지자체", "당선", "정책 대응"],
    "KPI": ["성과", "실적", "공과기술서", "CEO 보고"],
    "성과급": ["임금", "보상", "구성원", "노사"],
    "엔비디아": ["NVIDIA", "젠슨황", "AI 팩토리", "AI Factory"],
    "HBM": ["메모리", "AI 메모리", "반도체"],
  };
  const out = new Set(terms);
  for (const term of terms) {
    for (const [k, aliases] of Object.entries(aliasMap)) {
      if (term.includes(k) || k.includes(term)) {
        aliases.forEach(a => out.add(a));
      }
    }
  }
  return [...out];
}

function extractMetadataFilters(query) {
  const q = String(query || "");
  const filters = {};
  const dateMatch = q.match(/(\d{1,2}월\s*\d{1,2}일|\d{1,2}\/\d{1,2}|오늘|어제|이번주|지난주)/);
  if (dateMatch) filters.date_hint = dateMatch[1];
  const personMatch = q.match(/([가-힣]{2,4})[이가]?\s*(올린|공유한|보낸|전달한)/);
  if (personMatch) filters.uploader_hint = personMatch[1];
  return filters;
}

function passMaterialFindRelevance(candidate, plan) {
  const terms = Array.isArray(plan && plan.search_terms) ? plan.search_terms : [];
  if (!terms.length) return true;

  const metaFilters = plan.meta_filters || {};
  // 사람 필터: uploader_hint가 있으면 이름 매칭 필수
  if (metaFilters.uploader_hint) {
    const uploaderText = [candidate._resolvedName, candidate.uploader_name, candidate.sender_name]
      .map(x => String(x || "")).join(" ").toLowerCase();
    if (!uploaderText.includes(metaFilters.uploader_hint.toLowerCase())) return false;
  }

  let score = 0;
  for (const term of terms) {
    const t = String(term || "").toLowerCase();
    if (!t) continue;
    if (String(candidate.file_name || "").toLowerCase().includes(t)) score += 5;
    if (String(candidate.title || "").toLowerCase().includes(t)) score += 4;
    if (String(candidate.summary || "").toLowerCase().includes(t)) score += 3;
    if (String(candidate.extracted_text || "").toLowerCase().includes(t)) score += 2;
    if (String(candidate.content || candidate.text || "").toLowerCase().includes(t)) score += 1;
    if (String(candidate._resolvedRoom || candidate.room_title || "").toLowerCase().includes(t)) score += 1;
  }
  candidate.relevance_score = Math.max(candidate.relevance_score || 0, score);
  return score >= 2;
}

function normalizeReportCategory(text = "") {
  const t = String(text || "").toLowerCase();
  if (/(언론|뉴스룸|공시|고객사\s*letter|letter|mou|대외|보도|기사|pr|ir|cr|comm|adr|solidigm|솔리다임|epic)/i.test(t)) return "대외컴";
  if (/(리스크|확인\s*필요|대응\s*필요|우려|지연|논란|이슈|화재|위기|리콜|장애|불확실|risk)/i.test(t)) return "이슈";
  return "보고";
}

function stripPhotoFileName(text = "") {
  return String(text || "")
    .replace(/\b(?:photo|image)[_@.-][^\s<>\]]+/gi, "이미지")
    .replace(/Telegram export file[^\n]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanReportTitle(text = "", category = "보고") {
  let t = stripPhotoFileName(text)
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\.[a-z0-9]{2,5}\b/gi, " ")
    .replace(/[_\-@]+/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/^(자료|파일|문서|보고자료|이미지|내용|확인|요약|정리)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || looksLikeBadRawTitle(t) || /^이미지\s*\d*장?$/.test(t)) {
    t = ({ 보고: "보고자료 핵심 점검", 이슈: "대응 필요 이슈 점검", 대외컴: "대외 메시지 점검" }[category] || "보고자료 핵심 점검");
  }
  if (t.length > 25) t = t.slice(0, 25).trim();
  if (t.length < 8) t = `${t} 주요 안건`.trim().slice(0, 25);
  return t;
}

function cleanReportSummary(text = "", card = {}) {
  const raw = stripPhotoFileName(cleanSourceTextForSummary(text || ""));
  if (!raw || /핵심 내용 확인/.test(raw)) {
    if (card.source_type === "image" || card.source_type === "image_group") return "이미지에서 확인 가능한 텍스트가 없음.";
    return "본문에서 확인 가능한 업무 내용이 제한적임.";
  }
  const first = raw.split(/\n|[.!?]\s/).map(s => s.trim()).filter(Boolean)[0] || raw;
  return first.slice(0, 160);
}

function formatReportSourceLocation(card = {}) {
  const roomName = card.original_room || card.source_room || card.room_title || card.source || "알 수 없는 방";
  const room = `[${escapeHtml(roomName)}]`;
  const actor = card.mixed_actors
    ? "여러 명"
    : (card.from_name || card.sender_name || "미확인");
  const date = card.date || card.dateStr || formatShortDateFromValue(card.created_at || "");
  const imageCount = Number(card.image_count || (card.source_type === "image" ? 1 : 0));
  if (imageCount > 0 || card.source_type === "image_group" || card.source_type === "image") {
    return `${room} / ${escapeHtml(date || "")} / 이미지 ${imageCount || 1}장`;
  }
  const file = sanitizeDisplayFileName(card.display_file_name || card.source_file || card.file_name || "");
  return `${room} / ${escapeHtml(date || "")}${file ? " / " + escapeHtml(file) : ""}`;
}

function formatReportCard(card) {
  if (!card) return "";
  const basis = [card.agenda_category, card.issue_title, card.title, card.summary, card.source_file, card.display_file_name].join(" ");
  const category = normalizeReportCategory(basis);
  const summary = cleanReportSummary(card.summary || card.text || card.content || "", card);
  const title = ((card.source_type === "image" || card.source_type === "image_group") && summary.includes("텍스트가 없음"))
    ? "이미지 내용 미확인 공유자료"
    : cleanReportTitle(card.issue_title || card.title || card.summary || card.source_file || "", category);
  const actionItems = Array.isArray(card.action_items) ? card.action_items : (Array.isArray(card.actions) ? card.actions : []);
  const lines = [
    `<b>[${escapeHtml(category)}] ${escapeHtml(title)}</b>`,
    `• <b>내용</b>: ${escapeHtml(summary)}`,
  ];
  if (actionItems.length) lines.push(`• <b>확인</b>: ${escapeHtml(stripPhotoFileName(actionItems.slice(0, 2).join(", ")).slice(0, 120))}`);
  lines.push(`• <b>위치</b>: ${formatReportSourceLocation(card)}`);
  return lines.join("\n");
}

function cardDedupKey(card = {}) {
  return [
    normalizeReportCategory([card.agenda_category, card.issue_title, card.summary].join(" ")),
    cleanReportTitle(card.issue_title || card.title || card.summary || card.source_file || ""),
    card.source_room || card.room_title || card.source || "",
    card.date || card.dateStr || "",
    sanitizeDisplayFileName(card.display_file_name || card.source_file || card.file_name || ""),
    card.image_count || "",
  ].join("|").toLowerCase();
}

function dedupeReportCards(cards = [], limit = 3) {
  const seen = new Set();
  const out = [];
  for (const card of cards.filter(Boolean)) {
    const key = cardDedupKey(card);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
    if (out.length >= limit) break;
  }
  return out;
}

function formatIssueCardForMaterialFind(card, index) {
  const body = formatReportCard(card);
  return `${body}\n\u2022 <b>\uC6D0\uBCF8</b>: \uD544\uC694\uD558\uBA74 "${index}\uBC88 \uC6D0\uBCF8 \uBCF4\uB0B4\uC918"\uB77C\uACE0 \uC785\uB825`;
}

// ── Advanced Parser + Layout-aware Text Splitter ───────────────────────────────

const CHUNK_POLICY = {
  faq:             { minTokens: 100,  maxTokens: 300,  overlapRatio: 0.10 },
  report:          { minTokens: 800,  maxTokens: 1200, overlapRatio: 0.18 },
  ppt:             { minTokens: 600,  maxTokens: 1000, overlapRatio: 0.15 },
  news:            { minTokens: 300,  maxTokens: 600,  overlapRatio: 0.12 },
  blog:            { minTokens: 300,  maxTokens: 600,  overlapRatio: 0.12 },
  meeting_note:    { minTokens: 700,  maxTokens: 1000, overlapRatio: 0.18 },
  telegram_thread: { minTokens: 500,  maxTokens: 800,  overlapRatio: 0.12 },
  image:           { minTokens: 0,    maxTokens: 0,    overlapRatio: 0    },
  short_memo:      { minTokens: 0,    maxTokens: 0,    overlapRatio: 0    },
};

function detectDocumentType(source) {
  const name = String(source.file_name || source.fileName || "").toLowerCase();
  const mime = String(source.mime_type || source.mimeType || source.file_type || source.fileType || "").toLowerCase();
  const text = String(source.extracted_text || source.summary || source.content || source.text || "");

  if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(name)) return "image";
  if (mime.includes("pdf") || name.endsWith(".pdf")) {
    if (/(회의|의사록|안건|발언|결정사항)/i.test(text)) return "meeting_note";
    return "report";
  }
  if (/(ppt|pptx|odp)$/.test(name) || mime.includes("presentation")) return "ppt";
  if (/(doc|docx|odt)$/.test(name) || mime.includes("word")) return "report";
  if (/\.(txt|md)$/.test(name)) {
    if (text.length < 500) return "short_memo";
    if (/(Q:|A:|질문:|답변:|FAQ)/i.test(text)) return "faq";
    return "short_memo";
  }
  if (/(회의|의사록|안건|발언|결정사항|참석자)/i.test(text)) return "meeting_note";
  if (/(뉴스|기사|보도자료|bloomberg|reuters|nikkei)/i.test(text)) return "news";
  if (text.length < 300) return "short_memo";
  if (/(전략|로드맵|비전|사업계획|추진계획)/i.test(text)) return "report";
  return "unknown";
}

function evaluateParserQuality(parsed) {
  const text = String(parsed?.full_text || parsed?.layout_text || "").trim();
  if (!text) return "failed";
  if (text.length < 100) return "low";
  if (/photo[_]|image_|Telegram export file/i.test(text)) return "low";
  if (text.length >= 1000) return "high";
  return "medium";
}

function buildParsedDocumentFromExistingFields(source) {
  const docType = detectDocumentType(source);
  const rawText = source.extracted_text || source.summary || source.content || source.text || "";
  const fullText = cleanSourceTextForSummary(rawText);
  const contextText = String(source._contextMessage || source.caption || "");
  const combinedText = [fullText, contextText].filter(Boolean).join("\n").trim();

  const parsed = {
    parser_type: docType === "image" ? "image_ocr" : "existing_fields",
    document_type: docType,
    pages: [],
    full_text: combinedText,
    layout_text: combinedText,
    parser_quality: "unknown",
    needs_ocr: docType === "image" && !combinedText,
    needs_manual_review: false,
  };
  parsed.parser_quality = evaluateParserQuality(parsed);
  return parsed;
}

async function runAdvancedParser(source, env) {
  // TODO: hook external OCR / vision / PDF parser here
  return buildParsedDocumentFromExistingFields(source);
}

async function ensureParsedDocumentsTable(env) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS parsed_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        parser_type TEXT DEFAULT '',
        document_type TEXT DEFAULT 'unknown',
        full_text TEXT DEFAULT '',
        layout_json TEXT DEFAULT '{}',
        parser_quality TEXT DEFAULT 'unknown',
        needs_ocr INTEGER DEFAULT 0,
        needs_manual_review INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (e) {
    console.error("ensureParsedDocumentsTable:", e);
  }
}

async function getParsedDocument(source, env) {
  if (!env.DB) return null;
  const sourceId = String(
    source.telegram_file_unique_id || source.file_name || source.id || ""
  );
  const sourceType = source.source_type || (source.file_name ? "file" : "message");
  if (!sourceId) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT * FROM parsed_documents WHERE source_type = ? AND source_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(sourceType, sourceId).first();
    return row || null;
  } catch (_) {
    return null;
  }
}

async function saveParsedDocument(source, parsed, env) {
  if (!env.DB) return;
  const sourceId = String(
    source.telegram_file_unique_id || source.file_name || source.id || ""
  );
  const sourceType = source.source_type || (source.file_name ? "file" : "message");
  if (!sourceId) return;
  try {
    await ensureParsedDocumentsTable(env);
    const existing = await getParsedDocument(source, env);
    if (existing) {
      await env.DB.prepare(`
        UPDATE parsed_documents
        SET parser_type=?, document_type=?, full_text=?, layout_json=?,
            parser_quality=?, needs_ocr=?, needs_manual_review=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(
        parsed.parser_type || "",
        parsed.document_type || "unknown",
        String(parsed.full_text || "").slice(0, 50000),
        JSON.stringify(parsed.pages || []),
        parsed.parser_quality || "unknown",
        parsed.needs_ocr ? 1 : 0,
        parsed.needs_manual_review ? 1 : 0,
        existing.id
      ).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO parsed_documents
          (source_type, source_id, parser_type, document_type, full_text, layout_json, parser_quality, needs_ocr, needs_manual_review)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(
        sourceType, sourceId,
        parsed.parser_type || "",
        parsed.document_type || "unknown",
        String(parsed.full_text || "").slice(0, 50000),
        JSON.stringify(parsed.pages || []),
        parsed.parser_quality || "unknown",
        parsed.needs_ocr ? 1 : 0,
        parsed.needs_manual_review ? 1 : 0
      ).run();
    }
  } catch (e) {
    console.error("saveParsedDocument:", e);
  }
}

async function ensureParsedDocument(source, env) {
  const existing = await getParsedDocument(source, env);
  if (existing && existing.parser_quality !== "failed") return existing;
  const parsed = await runAdvancedParser(source, env);
  await saveParsedDocument(source, parsed, env);
  return parsed;
}

function getBestTextForIssueCard(source, parsed) {
  const docType = detectDocumentType(source);
  if (parsed?.full_text && parsed.full_text.trim().length >= 50) return parsed.full_text;
  if (source.extracted_text && source.extracted_text.trim().length >= 20) return source.extracted_text;
  if (source.summary && source.summary.trim().length >= 20) return source.summary;
  if (source.content && source.content.trim().length >= 20) return source.content;
  if (source.caption && source.caption.trim().length >= 10) return source.caption;
  if (docType === "image") return "";
  const fn = source.file_name || "";
  return /^photo[_@.-]|^image[_@.-]/i.test(fn) ? "" : fn;
}

function splitTextByDocumentType(fullText, documentType) {
  const policy = CHUNK_POLICY[documentType] || CHUNK_POLICY.report;
  if (!policy.maxTokens) return [];
  const text = String(fullText || "").trim();
  if (!text) return [];

  // approx: 1 token ≈ 2 Korean chars
  const maxChars = policy.maxTokens * 2;
  const overlapChars = Math.floor(maxChars * policy.overlapRatio);

  const sections = text.split(/\n{2,}/);
  const chunks = [];
  let buf = "";

  for (const sec of sections) {
    if ((buf.length ? buf.length + 2 : 0) + sec.length <= maxChars) {
      buf = buf ? buf + "\n\n" + sec : sec;
    } else {
      if (buf) chunks.push(buf.trim());
      const overlap = overlapChars > 0 && buf.length > overlapChars
        ? buf.slice(-overlapChars)
        : "";
      buf = overlap ? overlap + "\n\n" + sec : sec;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

function isBotGeneratedOutput(text, senderName = "") {
  const t = String(text || "");
  const s = String(senderName || "").toLowerCase();
  if (s.includes("bot") || s.includes("koh_ai_bot")) return true;
  if (t.includes("저장된 파일") && t.includes("건입니다")) return true;
  if (t.includes("관련 파일") && t.includes("번호를 선택")) return true;
  if (t.includes("📌") && (t.includes("위치") || t.includes("공유/전달"))) return true;
  if (t.includes("· <b>내용</b>:") || t.includes("· <b>위치</b>:")) return true;
  return false;
}

function formatShortDateFromValue(v) {
  if (!v) return "";
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function summarizeByRule(text) {
  const t = cleanSourceTextForSummary(text);
  const sentences = t
    .split(/[.!?\n。]/)
    .map(s => s.trim())
    .filter(s => s.length >= 15)
    .filter(s => !/^(네|넵|알겠|확인|반영|수정|검토|전달)/.test(s));
  return sentences[0]
    ? sentences[0].slice(0, 140)
    : "본문에서 확인 가능한 업무 내용이 제한적임.";
}

async function summarizeCandidateContent(text, sixR, env) {
  const cleaned = cleanSourceTextForSummary(text);
  const rLabel = Array.isArray(sixR) && sixR.length ? sixR.join("/") : (sixR && typeof sixR === "string" ? sixR : "업무");
  if (!cleaned || cleaned.length < 20) return "본문에서 확인 가능한 업무 내용이 제한적임.";
  const prompt =
    `다음 자료를 ${rLabel} 관점의 업무 안건으로 1~2줄 요약해줘.\n\n` +
    `[규칙]\n` +
    `- 원문 문장을 그대로 복사하지 말 것\n` +
    `- 담당님/올려드립니다/첨부합니다 같은 전달 문구 제거\n` +
    `- 핵심 이슈, 목적, 일정, 보고/검토 포인트만 압축\n` +
    `- 추정 금지\n` +
    `- 120~160자 이내\n` +
    `- 문장 끝은 "~자료", "~안건", "~확인 필요"처럼 업무적으로 정리\n\n` +
    `[자료]\n${cleaned.slice(0, 5000)}`;
  try {
    const r = await difyChat(env, { query: prompt, user: "koh", conversationId: "" });
    const summary = cleanOneLine(r.answer || "").slice(0, 180);
    if (summary && !looksLikeRawChatResponse(summary)) return summary;
  } catch (e) {}
  return summarizeByRule(cleaned);
}

// Single-LLM-call version: gets title + summary + action_items in one shot
async function buildIssueCardFromCandidate(candidate, env) {
  // Advanced Parser: use cached parsed doc if present, else build from existing fields
  const parsedDoc = candidate._parsed || buildParsedDocumentFromExistingFields(candidate);
  const docType = parsedDoc.document_type || detectDocumentType(candidate);
  const rawText = getBestTextForIssueCard(candidate, parsedDoc);

  // Image/low-quality with no extractable text → return "확인 필요" card
  if (!rawText && (docType === "image" || parsedDoc.parser_quality === "low" || parsedDoc.parser_quality === "failed")) {
    return {
      issue_title: "이미지 내용 확인 필요",
      agenda_category: "업무 안건",
      summary: "이미지 텍스트가 추출되지 않아 안건 요약이 필요합니다. OCR 또는 원본 확인이 필요합니다.",
      six_r: [],
      action_items: [],
      source_room: candidate._resolvedRoom || candidate.room_title || "",
      source_file: candidate.file_name || "",
      original_author: "",
      shared_by: "",
      actor: candidate._resolvedName || candidate.uploader_name || candidate.sender_name || "",
      date: formatShortDateFromValue(candidate.created_at || candidate.date),
      relevance_score: 0,
    };
  }

  const cleanText = cleanSourceTextForSummary(rawText);
  const basisText = cleanText || candidate.file_name || "";
  const agenda_category = typeof classifyAgenda === "function" ? classifyAgenda(basisText) : "";
  const six_r = inferSixRByRule(basisText);
  const sixRArr = six_r ? [six_r] : [];

  let issue_title = "";
  let summary = "";
  let action_items = extractActionItemsByRule(basisText);

  // ONE LLM call: title + summary together (not 3 separate calls)
  if (basisText.length >= 20) {
    const prompt =
      `다음 업무 자료를 보고 JSON으로만 출력해줘. 마크다운, 설명 없이 JSON만.\n\n` +
      `{"title":"10~25자 명사형 제목","summary":"1~2줄 요약 원문복붙금지"}\n\n` +
      `[제목 금지] 담당님으로 시작/올려드립니다/첨부합니다/PMO는... 같은 설명문/파일명 그대로\n` +
      `[요약 금지] 원문 그대로 복사/담당님 인사말/전달 문구 그대로\n` +
      `[규칙] 핵심 이슈·목적·일정만. 추정 금지.\n\n` +
      `[자료]\n${basisText.slice(0, 3000)}`;
    try {
      const r = await difyChat(env, { query: prompt, user: "koh", conversationId: "" });
      const raw = String(r.answer || "");
      const m = raw.match(/\{[\s\S]*?\}/);
      if (m) {
        const obj = JSON.parse(m[0]);
        const rawTitle = cleanTitle(obj.title || "");
        const rawSummary = cleanOneLine(obj.summary || "").slice(0, 180);
        if (isValidIssueTitle(rawTitle)) issue_title = rawTitle;
        if (rawSummary && !looksLikeRawChatResponse(rawSummary)) summary = rawSummary;
      }
    } catch (e) {
      console.error("buildIssueCardFromCandidate LLM:", e);
    }
  }

  // Rule-based fallbacks — use safe helpers, never use image filenames as title
  if (!issue_title || looksLikeBadRawTitle(issue_title)) {
    issue_title = makeSafeIssueTitleFromText(basisText || candidate.file_name, "주요 이슈 확인 필요");
  }
  if (!summary || looksLikeRawChatResponse(summary)) {
    summary = makeSafeSummaryFromText(basisText || candidate.file_name || "");
    if (!summary) summary = summarizeByRule(basisText);
  }

  const isImage = isImageCandidate(candidate);

  return {
    issue_title,
    agenda_category,
    summary,
    six_r: sixRArr,
    action_items,
    source_type: isImage ? "image" : (candidate.source_type || "file"),
    source_room: candidate.original_room || candidate._resolvedRoom || candidate.room_title || candidate.resolved_room_title || candidate.source || "",
    original_room: candidate.original_room || "",
    source_file: candidate.file_name || "",
    display_file_name: isImage ? "이미지 1장" : (typeof sanitizeDisplayFileName === "function" ? sanitizeDisplayFileName(candidate.file_name || "") : candidate.file_name || ""),
    telegram_file_id: candidate.telegram_file_id || "",
    can_send_original: !!(candidate.telegram_file_id || candidate.r2_key),
    original_author: candidate.original_author || "",
    from_name: candidate.from_name || candidate.sender_name || "",
    shared_by: candidate.from_name || candidate.sender_name || "미확인",
    uploader: candidate.from_name || candidate.sender_name || "미확인",
    actor: candidate.from_name || candidate.sender_name || "미확인",
    date: formatShortDateFromValue(candidate.created_at || candidate.date),
    relevance_score: candidate._score || candidate.relevance_score || 0,
  };
}

async function retrieveRecentMaterialCandidates(plan, message, env) {
  const chatId = message && message.chat ? message.chat.id : 0;
  const isGroupOnly = kohIsGroupRoomPreferred(plan && plan.query ? plan.query : "");
  const { files: rawFiles, messages: rawMessages } =
    await kohFetchRecentFilesAndMessages(env, String(chatId), false, 14, "");
  const files = kohDedupFiles(rawFiles || []);

  const fileCandidates = files.map(r => ({
    source_type: "file",
    file_name: r.file_name || "",
    text: r.summary || r.extracted_text || r.content || "",
    summary: r.summary || "",
    extracted_text: r.extracted_text || "",
    content: r.content || "",
    _resolvedRoom: r.room_title || r.source || "",
    room_title: r.room_title || "",
    _resolvedName: r.uploader_name || r.sender_name || "",
    uploader_name: r.uploader_name || "",
    sender_name: r.sender_name || "",
    created_at: r.created_at || "",
    telegram_file_id: r.telegram_file_id || "",
    _score: 1
  }));

  const msgCandidates = (rawMessages || [])
    .filter(m => !kohLooksLikeCommandOrRequestOnly(m.content))
    .filter(m => !isBotGeneratedSummary(m.content, m.sender_name))
    .map(m => ({
      source_type: "message",
      file_name: "",
      text: m.content || m.text || "",
      content: m.content || m.text || "",
      summary: "",
      _resolvedRoom: m.room_title || "",
      room_title: m.room_title || "",
      _resolvedName: m.sender_name || "",
      uploader_name: m.sender_name || "",
      sender_name: m.sender_name || "",
      created_at: m.created_at || "",
      _score: 0.8
    }));

  return [...fileCandidates, ...msgCandidates]
    .filter(c => !isBotGeneratedOutput(c.text || c.content || c.summary, c.sender_name || c.uploader_name))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

// 현재 방에 공유된 파일들의 본문(extracted_text)을 기준으로 요약
async function handleRoomFileSummary(env, chatId, files, currentRoomId, roomTitle) {
  const display = files.slice(0, 5);
  console.log("ROOM_FILE_SUMMARY", {
    roomId: currentRoomId,
    roomTitle,
    filesCount: display.length,
    fileNames: display.map(f => f.file_name),
    extractedLengths: display.map(f => (f.extracted_text || f.content || "").length),
  });
  console.log("ROOM_FILE_SUMMARY_QUERY", {
    roomId: currentRoomId,
    roomTitle,
    filesCount: files.length,
    fileNames: files.map(f => f.file_name),
    extractedLengths: files.map(f => (f.extracted_text || "").length),
  });

  if (!display.length) {
    await kohSendHtml(env, chatId, "이 방에 공유된 자료를 찾지 못했습니다.");
    return true;
  }

  const blocks = [];
  for (const f of display) {
    const body = String(f.extracted_text || f.content || "").trim();
    const fileName = f.file_name || "파일명 미확인";
    const uploader = f.uploader_name || f.sender_name || f.from_name || "미확인";
    const date = kohFormatDate(f.created_at);

    if (body.length < 30) {
      blocks.push(`[${fileName}]\n상태: 본문 추출 실패\n사유: 텍스트가 없거나 파일 추출 로직 미작동`);
      continue;
    }

    try {
      const query = TONE_RULE +
        `다음은 "${fileName}" 파일에서 추출된 본문입니다. 이 본문 내용만 바탕으로 핵심 내용을 3개의 불릿으로 요약해줘.\n\n` +
        `[형식]\n- 핵심 내용 1\n- 핵심 내용 2\n- 핵심 내용 3\n\n` +
        `마크다운(*, #) 금지. 다른 자료나 지식 베이스 참고 금지. 오직 아래 본문 내용만 사용.\n\n` +
        `[본문]\n${body.slice(0, 6000)}`;
      const result = await difyChat(env, { query, user: "koh", conversationId: "" });
      const bullets = (result?.answer || "").trim() || "- 요약 생성 실패";
      blocks.push(`[${fileName}]\n업로드: ${uploader} / ${date}\n요약:\n${bullets}`);
    } catch (e) {
      console.error("handleRoomFileSummary dify:", e);
      blocks.push(`[${fileName}]\n업로드: ${uploader} / ${date}\n요약: 요약 생성 실패`);
    }
  }

  await kohSendHtml(env, chatId, blocks.join("\n\n"));
  return true;
}

// 텍스트에서 URL 추출
const NEWS_DOMESTIC_DOMAINS = [
  "naver.com", "news.naver.com", "daum.net", "chosun.com", "joins.com",
  "donga.com", "hankyung.com", "mk.co.kr", "yna.co.kr", "newsis.com",
  "edaily.co.kr", "etnews.com", "zdnet.co.kr", "bloter.net",
  "digitaltoday.co.kr", "businesspost.co.kr",
];

const NEWS_FOREIGN_DOMAINS = [
  "reuters.com", "bloomberg.com", "wsj.com", "ft.com", "nikkei.com",
  "cnbc.com", "theverge.com", "techcrunch.com", "apnews.com", "cnn.com",
  "bbc.com", "scmp.com",
];

// 도메인 기준 내신/외신/기타 분류
function classifyNewsDomain(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  const matches = (list) => list.some(d => host === d || host.endsWith("." + d));
  if (matches(NEWS_DOMESTIC_DOMAINS)) return "내신";
  if (matches(NEWS_FOREIGN_DOMAINS)) return "외신";
  return "기타";
}

// URL의 og:title 또는 <title>을 가져온다. 실패 시 도메인+경로 기반 제목 생성
async function fetchArticleTitle(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const html = (await res.text()).slice(0, 50000);
    const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    if (ogMatch) return ogMatch[1].trim();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim();
  } catch (e) {
    // fall through to fallback
  }
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/\/$/, "");
  } catch (e) {
    return url;
  }
}

// 현재 방에 공유된 뉴스/기사 링크를 내신/외신/기타로 구분해 제목+URL만 정리
async function handleNewsLinkList(env, chatId, currentRoomId, text) {
  const isTodayOnly = /오늘/.test(text);
  let since;
  if (isTodayOnly) {
    since = getKstDayRange().startIso;
  } else {
    since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19).replace("T", " ");
  }

  const rows = await env.DB.prepare(`
    SELECT content, room_title, created_at
    FROM messages
    WHERE CAST(room_id AS TEXT) = ?
      AND created_at >= ?
      AND content LIKE '%http%'
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(String(currentRoomId), since).all();

  const messages = rows.results || [];
  const roomTitle = messages[0]?.room_title || "";

  const seen = new Set();
  const urls = [];
  for (const m of messages) {
    for (const url of extractUrls(m.content)) {
      const clean = url.replace(/[.,)\]]+$/, "");
      if (!seen.has(clean)) {
        seen.add(clean);
        urls.push(clean);
      }
    }
  }

  console.log("NEWS_LINK_LIST", {
    roomId: currentRoomId,
    roomTitle,
    urlsCount: urls.length,
    domains: urls.map(u => { try { return new URL(u).hostname; } catch (e) { return ""; } }),
    mode: "title_url_only",
  });

  if (!urls.length) {
    await kohSendHtml(env, chatId, "이 방에 공유된 뉴스/기사 링크를 찾지 못했습니다.");
    return true;
  }

  const TOTAL_LIMIT = 20;
  const targetUrls = urls.slice(0, TOTAL_LIMIT);
  const omitted = urls.length - targetUrls.length;

  const articles = await Promise.all(targetUrls.map(async (url) => {
    let hostname = "";
    try { hostname = new URL(url).hostname; } catch (e) {}
    const title = await fetchArticleTitle(url);
    return { url, title, category: classifyNewsDomain(hostname) };
  }));

  const groups = { "내신": [], "외신": [], "기타": [] };
  for (const a of articles) {
    if (groups[a.category].length < 10) groups[a.category].push(a);
  }

  const sections = [];
  for (const cat of ["내신", "외신", "기타"]) {
    if (!groups[cat].length) continue;
    const lines = groups[cat].map(a => `- ${escapeHtml(a.title)} &lt;${escapeHtml(a.url)}&gt;`);
    sections.push(`${cat}\n${lines.join("\n")}`);
  }

  let output = sections.join("\n\n");
  if (omitted > 0) output += `\n\n외 ${omitted}건은 생략했습니다.`;

  await kohSendHtml(env, chatId, output);
  return true;
}

async function handleRecentMaterialBrief(items, chatId, env) {
  const filtered = (items || [])
    .filter(c => !isBotGeneratedOutput(c.text || c.content || c.summary, c._resolvedName || c.sender_name || c.uploader_name))
    .filter(c => {
      const raw = c.summary || c.extracted_text || c.content || c.text || c.file_name || "";
      const clean = cleanSourceTextForSummary(raw);
      return clean.length >= 20 || String(c.file_name || "").length >= 4;
    })
    .slice(0, 20);

  if (!filtered.length) {
    await kohSendHtml(env, chatId, "최근 공유자료에서 요약할 수 있는 원문을 찾지 못했습니다.");
    return;
  }

  const { imageGroups, nonImages } = groupImageCandidates(filtered);
  const cards = [];

  for (const group of imageGroups) {
    try {
      const card = await buildIssueCardFromImageGroup(group, env);
      if (card && !looksLikeBadRawTitle(card.issue_title)) cards.push(card);
    } catch (e) { console.error("handleRecentMaterialBrief imageGroup:", e); }
  }

  for (const c of nonImages.slice(0, 5)) {
    try {
      const card = await buildIssueCardFromCandidate(c, env);
      if (!card || !card.issue_title) continue;
      if (looksLikeBadRawTitle(card.issue_title)) continue;
      if (/^(네|넵|알겠|확인|반영|수정|검토|전달|그러하겠습니다)/.test(card.summary || "")) continue;
      cards.push(card);
    } catch (e) { console.error("handleRecentMaterialBrief card:", e); }
  }

  const finalCards = dedupeReportCards(cards, 3);

  if (!finalCards.length) {
    await kohSendHtml(env, chatId, "최근 공유자료는 확인되지만, 요약 가능한 업무 본문을 찾지 못했습니다.");
    return;
  }

  let output = finalCards.map(formatReportCard).join("\n\n");

  if (containsLegacyOutput(output)) {
    console.warn("[BLOCKED_LEGACY_OUTPUT] handleRecentMaterialBrief", output.slice(0, 300));
    output = "자료를 확인했지만 출력 포맷 오류가 감지되었습니다. /debug_today 로 적재 상태를 확인해주세요.";
  }
  const suffix = filtered.length > 5 ? `\n\n더 보고 싶으면 "더 보여줘"라고 입력해주세요.` : "";
  await kohSendHtml(env, chatId, output + suffix);
}

async function handleBriefingSummary(env, chatId, text, currentRoomId = "") {
  const { kstDate, startIso, endIso } = getKstDayRange();
  const { files: rawFiles, messages: rawMessages } =
    await kohFetchRecentFilesAndMessages(env, String(currentRoomId || ""), false, 2, "");
  const files = kohDedupFiles(rawFiles || []);
  const allItems = await kohResolveItems(env, files, "uploader_id", "uploader_name");

  const candidates = allItems
    .filter(c =>
      !isBotGeneratedOutput(
        c.summary || c.extracted_text || c.content || c.text || "",
        c._resolvedName || c.uploader_name || ""
      ) &&
      String(c.created_at || "") >= startIso &&
      String(c.created_at || "") <= endIso
    )
    .slice(0, 3);

  if (!candidates.length) {
    await kohSendHtml(env, chatId, `오늘(${kstDate} KST) 공유된 자료를 찾지 못했습니다.\n적재 상태 확인: /debug_today`);
    return;
  }

  const cards = [];
  for (const c of candidates) {
    try {
      const card = await buildIssueCardFromCandidate(c, env);
      if (card) cards.push(card);
    } catch (e) {
      console.error("handleBriefingSummary card:", e);
    }
  }

  if (!cards.length) {
    await kohSendHtml(env, chatId, "최근 공유 자료가 있지만 요약 가능한 본문을 찾지 못했습니다. 파서/OCR 확인이 필요합니다.");
    return;
  }

  const safeBriefingTitle = String(text || "").includes("\uB0B4\uC77C")
    ? "\uB0B4\uC77C \uBE0C\uB9AC\uD551 \uD6C4\uBCF4"
    : "\uC624\uB298 \uBE0C\uB9AC\uD551 \uD6C4\uBCF4";
  const reportHeader = `<b>${escapeHtml(safeBriefingTitle)} (${escapeHtml(kstDate)} KST)</b>\n\n`;
  let output = dedupeReportCards(cards, 3).map(formatReportCard).join("\n\n");

  if (containsLegacyOutput(output)) {
    console.warn("[BLOCKED_LEGACY_OUTPUT] handleBriefingSummary", output.slice(0, 300));
    output = "브리핑 자료를 확인했지만 출력 포맷 오류가 감지되었습니다.";
  }

  await kohSendHtml(env, chatId, reportHeader + output);
}

async function extractIssueCardsFromLongText(text, env, baseMeta = {}) {
  const cleaned = cleanSourceTextForSummary(text);
  if (!cleaned || cleaned.length < 50) return [];
  const prompt =
    `다음 본문에서 서로 다른 업무 안건을 최대 5개까지 분리해 JSON 배열로 출력해줘.\n\n` +
    `[각 항목 필드]\n` +
    `issue_title: 10~25자 명사형 제목\n` +
    `summary: 1~2줄 요약, 원문 복붙 금지\n` +
    `six_r: GR/PR/IR/CR/BR/ER 중 배열 (예: ["CR","GR"])\n` +
    `agenda_category: 정부·정책/노사·인사/사내 보고/대외컴/위기·이슈/사업·전략/글로벌·외신/행사·이벤트 중 하나\n` +
    `action_items: 최대 3개 배열\n\n` +
    `[규칙]\n` +
    `- 응답문/잡담 제외\n` +
    `- 여러 키워드가 있으면 안건별로 분리\n` +
    `- JSON 배열만 출력\n\n` +
    `[본문]\n${cleaned.slice(0, 7000)}`;
  try {
    const r = await difyChat(env, { query: prompt, user: "koh", conversationId: "" });
    const raw = String(r.answer || "");
    const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || "[]");
    if (Array.isArray(arr) && arr.length) {
      return arr.slice(0, 5).map(x => ({
        issue_title: cleanTitle(x.issue_title || ""),
        agenda_category: x.agenda_category || (typeof classifyAgenda === "function" ? classifyAgenda(cleaned) : ""),
        summary: cleanOneLine(x.summary || "").slice(0, 180),
        six_r: Array.isArray(x.six_r) ? x.six_r : [inferSixRByRule(cleaned)].filter(Boolean),
        action_items: Array.isArray(x.action_items) ? x.action_items.slice(0, 3) : [],
        source_room: baseMeta.source_room || "",
        source_file: baseMeta.source_file || "",
        original_author: baseMeta.original_author || "",
        shared_by: baseMeta.shared_by || "",
        actor: baseMeta.actor || "",
        date: baseMeta.date || ""
      }));
    }
  } catch (e) {
    console.error("extractIssueCardsFromLongText:", e);
  }
  const fallback = await buildIssueCardFromCandidate({
    text: cleaned,
    _resolvedRoom: baseMeta.source_room,
    file_name: baseMeta.source_file,
    _resolvedName: baseMeta.actor,
    created_at: baseMeta.date
  }, env);
  return fallback ? [fallback] : [];
}

function kohIsFileSendRequest(text = "") {
  return /(보내줘|공유해줘|첨부해줘|올려줘)/.test(String(text || ""));
}

function kohIsCrossRoomRequest(text = "") {
  return /(다른\s*방|타\s*방|전체\s*방|모든\s*방|여러\s*방|방들|단체방들|단톡방들|각\s*방|각종\s*방|방\s*전체|방별|내가\s*포함된\s*방|포함된\s*단체방)/.test(String(text || ""));
}

function kohIsCurrentRoomOnly(text = "") {
  const t = String(text || "");
  if (kohIsCrossRoomRequest(t)) return false;
  return /(이\s*방|이\s*단체방|이\s*단톡방|여기|현재\s*방|우리\s*방)/.test(t);
}

function kohIsGroupRoomPreferred(text = "") {
  return /(내가\s*포함된\s*방|단체방|단톡방|방들|다른\s*방|전체\s*방|각\s*방|각종\s*방|포함된\s*단체방|보고된\s*내용|공유된\s*내용)/.test(String(text || ""));
}

const KOH_EXCLUDED_ROOM_TITLES = ["다시왔지롱", "테스트봇방", "장난치지마라"];

function kohNormalizeRoomAlias(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/20\d{2}/g, "")
    .replace(/방/g, "")
    .replace(/[\s_\/\\\-.,()[\]{}:;'"`~!@#$%^&*+=|<>?]/g, "")
    .trim();
}

function kohResolveRoomAliasFromText(text = "") {
  const n = kohNormalizeRoomAlias(text);
  if ((n.includes("6r") || n.includes("6알")) && n.includes("전략") && (n.includes("권") || n.includes("kwon"))) {
    return "6R전략_w/권_2026";
  }
  if ((n.includes("6r") || n.includes("6알")) && n.includes("전략")) {
    return "6R전략_w/권_2026";
  }
  return "";
}

function kohRoomAliasMatches(rowOrTitle, aliasTitle = "") {
  if (!aliasTitle) return false;
  const row = typeof rowOrTitle === "object" && rowOrTitle ? rowOrTitle : { room_title: rowOrTitle };
  const target = kohNormalizeRoomAlias(aliasTitle);
  const values = [row.room_title, row.original_room, row._resolvedRoom, row.source_room, row.joined_room_title, row.room_id].filter(Boolean);
  return values.some(v => {
    const n = kohNormalizeRoomAlias(v);
    return n && (n.includes(target) || target.includes(n) || (target.includes("6r전략") && n.includes("6r전략")));
  });
}

function is6RStrategyRoom(rowOrTitle = "") {
  const row = typeof rowOrTitle === "object" && rowOrTitle ? rowOrTitle : { room_title: rowOrTitle };
  const values = [row.room_title, row.original_room, row._resolvedRoom, row.source_room, row.joined_room_title].filter(Boolean);
  return values.some((value) => {
    const n = kohNormalizeRoomAlias(value);
    return n.includes("6r전략w권") || n.includes("6r전략권") || n.includes("ai컴기획팀과권");
  });
}

function kohIsExcludedRoomTitle(title = "") {
  const n = kohNormalizeRoomAlias(title);
  return KOH_EXCLUDED_ROOM_TITLES.some(t => n === kohNormalizeRoomAlias(t));
}

// 방 타입 감지
function isInfoRoom(roomTitle) {
  return String(roomTitle || "").includes(INFO_ROOM_KEYWORD);
}

// 메시지에서 태그 파싱 (첫 줄 기준)
function parseMessageTags(text) {
  const firstLine = String(text || "").split("\n")[0];
  const statusTag = STATUS_TAGS.find(t => firstLine.includes(t)) || null;
  const fieldTags = FIELD_TAGS.filter(t => firstLine.includes(t));
  const infoTags = INFO_ROOM_TAGS.filter(t => firstLine.includes(t));
  return { statusTag, fieldTags, infoTags };
}

// 업무명, 진행내용, 마일스톤 추출
function parseWorkReportFields(text) {
  const extract = (label) => {
    const m = String(text || "").match(
      new RegExp(`^\\s*-\\s*${label}\\s*[:：]\\s*(.*)$`, "m")
    );
    return m ? m[1].trim() : "";
  };
  return {
    taskName:   extract("업무명"),
    progress:   extract("진행내용"),
    milestone:  extract("마일스톤"),
  };
}

// 마일스톤 날짜에서 D-N 계산
function calcDaysLeft(milestoneText) {
  const m = String(milestoneText || "").match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const diff = Math.ceil(
    (Date.parse(m[1]) - Date.now()) / 86400000
  );
  return diff;
}

// ===== 업무보고방 입력 검증 =====
const WORK_REPORT_STATUS_TAGS = ["#보고", "#Fup", "#공유", "#일정"];
const WORK_REPORT_FIELD_TAGS = ["#6R리뷰", "#6RMonthly", "#우군화", "#AI", "#KPI", "#기획"];
const WORK_REPORT_MILESTONE_REQUIRED_TAGS = ["#보고", "#일정"];

const WORK_REPORT_TAG_GUIDE_MESSAGE =
  "양식을 확인해 주세요. 첫 줄에 상태태그 1개와 분야태그 1개 이상이 필요합니다.\n\n" +
  "상태태그(1개) : #보고 #Fup #공유 #일정\n" +
  "분야태그(1개 이상) : #6R리뷰 #6RMonthly #우군화 #AI #KPI #기획\n\n" +
  "본문 양식\n" +
  "- 업무명 :\n" +
  "- 진행내용 :\n" +
  "- 마일스톤 : (#보고·#일정은 필수, YYYY-MM-DD)";

const WORK_REPORT_MILESTONE_GUIDE_MESSAGE =
  "#보고 또는 #일정 보고에는 마일스톤이 필요합니다. 날짜를 YYYY-MM-DD 형식으로 추가해 주세요.\n" +
  "예시) 마일스톤 : 담당님 재보고 (2026-06-12)";

function isWorkReportRoom(env, chatId) {
  const target = String(env.WORK_REPORT_CHAT_ID || "").trim();
  return !!target && String(chatId) === target;
}

function kohIsWorkReportValidationExempt(text = "") {
  const t = String(text || "").trim();
  if (!t) return true;
  if (/^\/\w+/.test(t)) return true;
  if (/@KOH_AI_bot/i.test(t)) return true;
  return false;
}

// 첫 줄의 상태태그/분야태그, 마일스톤(#보고·#일정 필수)을 검증
function validateWorkReportFirstLine(text = "") {
  const firstLine = String(text || "").split(/\r?\n/)[0] || "";
  const tokens = firstLine.split(/\s+/).filter(Boolean);
  const statusTags = tokens.filter(t => WORK_REPORT_STATUS_TAGS.includes(t));
  const fieldTags = tokens.filter(t => WORK_REPORT_FIELD_TAGS.includes(t));

  if (statusTags.length !== 1 || fieldTags.length === 0) {
    return { ok: false, reason: "tags" };
  }

  const statusTag = statusTags[0];
  const milestoneLine = String(text || "")
    .split(/\r?\n/)
    .find(line => /마일스톤\s*[:：]/.test(line)) || "";
  const milestoneMatch = milestoneLine.match(/(\d{4}-\d{2}-\d{2})/);
  const milestoneDate = milestoneMatch ? milestoneMatch[1] : "";

  if (WORK_REPORT_MILESTONE_REQUIRED_TAGS.includes(statusTag) && !milestoneDate) {
    return { ok: false, reason: "milestone", statusTag, fieldTags };
  }

  return { ok: true, statusTag, fieldTags, milestoneDate };
}

function extractWorkReportField(text, label) {
  const re = new RegExp(`^\\s*[-*•]?\\s*${label}\\s*[:：]\\s*(.*)$`, "m");
  const m = String(text || "").match(re);
  return m ? m[1].trim() : "";
}

async function ensureWorkReportsTable(env) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS work_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        status_tag TEXT DEFAULT '',
        field_tags TEXT DEFAULT '',
        task_name TEXT DEFAULT '',
        progress TEXT DEFAULT '',
        milestone_date TEXT DEFAULT '',
        owner TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (e) {
    console.error("ensureWorkReportsTable:", e);
  }
}

async function saveWorkReport(env, report) {
  if (!env.DB) return false;
  try {
    await ensureWorkReportsTable(env);
    await env.DB.prepare(`
      INSERT INTO work_reports (room_id, status_tag, field_tags, task_name, progress, milestone_date, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      String(report.roomId),
      report.statusTag || "",
      report.fieldTags || "",
      report.taskName || "",
      report.progress || "",
      report.milestoneDate || "",
      report.owner || ""
    ).run();
    return true;
  } catch (e) {
    console.error("saveWorkReport:", e);
    return false;
  }
}

async function kohSendReply(env, chatId, text, replyToMessageId) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
    })
  });
}

// 양식 검증. 실패 시 되묻고 true(처리 종료) 반환, 통과 시 work_reports 저장 후 false 반환
async function handleWorkReportValidation(env, message, text) {
  const validation = validateWorkReportFirstLine(text);
  if (!validation.ok) {
    const guide = validation.reason === "milestone"
      ? WORK_REPORT_MILESTONE_GUIDE_MESSAGE
      : WORK_REPORT_TAG_GUIDE_MESSAGE;
    await kohSendReply(env, message.chat.id, guide, message.message_id);
    message._persisted = true;
    return true;
  }

  const owner = await getCanonicalUserName(env, message.from);
  await saveWorkReport(env, {
    roomId: message.chat.id,
    statusTag: validation.statusTag,
    fieldTags: validation.fieldTags.join(" "),
    taskName: extractWorkReportField(text, "업무명"),
    progress: extractWorkReportField(text, "진행내용"),
    milestoneDate: validation.milestoneDate,
    owner,
  });
  return false;
}

function kohIsRequestLikeForBriefing(content = "") {
  const t = String(content || "").trim();
  if (!t) return true;
  if (/^\/\w+/.test(t)) return true;
  if (/@KOH_AI_bot/i.test(t)) return true;
  if (kohLooksLikeCommandOrRequestOnly(t)) return true;
  if (/(요약해줘|정리해줘|알려줘|보여줘|보내줘|공유해줘|찾아줘|뭐야|무엇|어디|있어\?|테스트|저장 테스트|브리핑_test|debug)/i.test(t)) return true;
  return false;
}

function kohHasWorkSignal(content = "") {
  return /(보고|자료|공유|회의|일정|마감|확인|검토|완료|진행|담당|결정|리스크|후속|follow|임원|사장|CEO|PMO|TF|MOU|Letter|화재|대외|IR|PR|CR|선포식|비전|Vision|Solidigm|솔리다임|EPIC)/i.test(String(content || ""));
}

function kohLooksLikeCommandOrRequestOnly(content = "") {
  const t = String(content || "").trim();

  if (!t) return true;
  if (/^\/\w+/.test(t)) return true;
  if (kohIsJunkMessage(t)) return true;
  if (/@KOH_AI_bot|@KOH_ai_bot/i.test(t)) return true;
  // Filter out bot-style structured answers (contain bullet markers)
  if (/🧩|📎|👤/.test(t)) return true;

  const normalized = kohNormalizeText(t);
  const words = normalized.split(" ").filter(Boolean);

  // Strong request patterns — always filter regardless of length
  if (/(내가\s*포함된\s*방|포함된\s*단체방|단체방에\s*보고된|공유된\s*내용\s*요약|다른\s*방들도|방들에서)/.test(t)) return true;

  // Request verb endings — filter if short sentence (no real content)
  const requestVerb =
    /(요약해줘|정리해줘|알려줘|보내줘|공유해줘|찾아줘|보여줘|확인해줘|전달해줘|첨부해줘|올려줘|설명해줘)$/.test(t.replace(/[.!?]$/, ""));
  if (requestVerb && words.length <= 8) return true;

  // Short request sentences
  const requestLike =
    /(요약|정리|알려줘|보내줘|공유해줘|찾아줘|해줘|뭐야|확인해줘|뭐있어|뭐있었|뭐가\s*있)/.test(t);
  if (requestLike && words.length <= 5) return true;

  return false;
}

function kohScoreRecord(record, terms) {
  const source = kohNormalizeText([
    record.file_name,
    record.summary,
    record.extracted_text,
    record.content,
    record.room_title,
    record.sender_name,
    record.uploader_name
  ].filter(Boolean).join(" "));

  if (!terms.length) return 1;

  let score = 0;

  for (const term of terms) {
    const n = kohNormalizeText(term);
    if (!n) continue;

    // 복합 키워드는 높은 가중치
    if (n.length >= 4) {
      if (source.includes(n)) score += 20;
      else if (source.replace(/\s+/g, "").includes(n.replace(/\s+/g, ""))) score += 15;
    } else {
      if (source.includes(n)) score += 10;
      if (source.replace(/\s+/g, "").includes(n.replace(/\s+/g, ""))) score += 5;
    }
  }

  if (record.file_name) score += 2;
  if (record.summary || record.extracted_text) score += 2;

  return score;
}

function kohFormatDate(value = "") {
  const s = String(value || "");
  if (s.length >= 10) return s.slice(5, 10).replace("-", "/");
  return "일자 확인 필요";
}

function kohShortText(value = "", max = 180) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function kohFormatThreeLineItemOld({ title = "", content = "", location = "", person = "", date = "" }) {
  return kohFormatThreeLineItem({ title, content, location, person, date });
}

function kohFormatThreeLineItem({ title = "", content = "", location = "", person = "", date = "" }) {
  const locParts = String(location || "").split(" > ");
  const sourceRoom = locParts[0]?.replace(/^\[|\]$/g, "") || "";
  const sourceFile = locParts.slice(1).join(" > ") || "";
  return formatIssueCard({
    issue_title: title,
    summary: content,
    source_room: sourceRoom,
    source_file: sourceFile,
    display_file_name: sourceFile,
    shared_by: person,
    uploader: person,
    date,
    six_r: [],
    agenda_category: "",
    action_items: [],
  });
}

async function kohSendHtml(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
}

async function kohSendDocument(env, chatId, file, caption = "") {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  const documentId = file._sendTelegramFileId || file.telegram_file_id;
  if (!documentId) return false;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      document: documentId,
      caption,
      parse_mode: "HTML"
    })
  });

  return res.ok;
}

// fileDays: number of days back to look (null = no date limit)
async function kohFetchRecentFilesAndMessages(env, currentRoomId = "", currentRoomOnly = false, fileDays = 7, roomAliasTitle = "") {
  // null 또는 90일 초과는 cap — unbounded scan 금지
  const cappedDays = (fileDays === null || Number(fileDays) > 90) ? 90 : Number(fileDays);
  const fileSince = new Date(Date.now() - cappedDays * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const msgDays   = Math.min(cappedDays, 14);
  const msgSince  = new Date(Date.now() - msgDays * 86400000).toISOString().slice(0, 19).replace("T", " ");

  const fileDateFilter = "AND f.created_at >= ?";
  const roomFilter = currentRoomOnly && currentRoomId ? "AND CAST(f.room_id AS TEXT) = ?" : "";
  const msgRoomFilter = currentRoomOnly && currentRoomId ? "AND CAST(m.room_id AS TEXT) = ?" : "";

  // source_status 컬럼 여부에 따라 active 우선 정렬 적용
  const hasFileStatus = await columnExists(env, "files", "source_status");
  const hasMsgStatus = await columnExists(env, "messages", "source_status");
  const fileOrderBy = hasFileStatus
    ? "CASE WHEN COALESCE(f.source_status,'legacy') = 'active' THEN 0 ELSE 1 END ASC, f.created_at DESC"
    : "f.created_at DESC";
  const msgOrderBy = hasMsgStatus
    ? "CASE WHEN COALESCE(m.source_status,'legacy') = 'active' THEN 0 ELSE 1 END ASC, m.created_at DESC"
    : "m.created_at DESC";

  const fileSql = `
    SELECT
      f.id,
      f.room_id,
      COALESCE(
        CASE WHEN CAST(f.room_id AS INTEGER) < 0 THEN NULLIF(r.room_title, '') END,
        CASE WHEN CAST(f.room_id AS INTEGER) < 0 THEN NULLIF(f.room_title, '1:1') END,
        CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' END,
        f.room_title,
        '알 수 없는 방'
      ) AS room_title,
      COALESCE(NULLIF(f.uploader_name, ''), '') AS uploader_name,
      f.uploader_id,
      '' AS sender_id,
      f.file_name,
      0 AS file_size,
      '' AS telegram_file_id,
      '' AS telegram_file_unique_id,
      f.summary,
      f.content AS extracted_text,
      f.content,
      '' AS tags_json,
      '' AS source_type,
      f.saved_by,
      '' AS r2_key,
      f.created_at,
      ${hasFileStatus ? "f.source_status" : "'legacy'"} AS source_status,
      ${hasFileStatus ? "COALESCE(f.original_room, '')" : "''"} AS original_room,
      ${hasFileStatus ? "COALESCE(f.from_name, '')" : "''"} AS from_name,
      ${hasFileStatus ? "COALESCE(f.media_group_key, '')" : "''"} AS media_group_key
    FROM files f
    LEFT JOIN rooms r ON CAST(r.room_id AS TEXT) = CAST(f.room_id AS TEXT)
    WHERE 1=1
      ${fileDateFilter}
      ${roomFilter}
    ORDER BY ${fileOrderBy}
    LIMIT 50
  `;

  const msgSql = `
    SELECT
      m.id,
      m.room_id,
      COALESCE(
        CASE WHEN CAST(m.room_id AS INTEGER) < 0 THEN NULLIF(r.room_title, '') END,
        CASE WHEN CAST(m.room_id AS INTEGER) < 0 THEN NULLIF(m.room_title, '1:1') END,
        CASE WHEN CAST(m.room_id AS INTEGER) > 0 THEN '1:1' END,
        m.room_title,
        '알 수 없는 방'
      ) AS room_title,
      m.sender_name,
      m.sender_id,
      '' AS source_type,
      m.saved_by,
      m.content,
      m.created_at,
      ${hasMsgStatus ? "m.source_status" : "'legacy'"} AS source_status,
      ${hasMsgStatus ? "COALESCE(m.original_room, '')" : "''"} AS original_room,
      ${hasMsgStatus ? "COALESCE(m.from_name, '')" : "''"} AS from_name,
      ${hasMsgStatus ? "COALESCE(m.media_group_key, '')" : "''"} AS media_group_key
    FROM messages m
    LEFT JOIN rooms r ON CAST(r.room_id AS TEXT) = CAST(m.room_id AS TEXT)
    WHERE m.created_at >= ?
      AND m.content IS NOT NULL
      AND m.content != ''
      AND m.content NOT LIKE '/%'
      AND m.content NOT LIKE '%@KOH_AI_bot%'
      ${msgRoomFilter}
    ORDER BY ${msgOrderBy}
    LIMIT 100
  `;

  // Build bind arrays (fileSince always present — no unbounded scan)
  const fileParams = [fileSince];
  if (currentRoomOnly && currentRoomId) fileParams.push(String(currentRoomId));

  const msgParams = [msgSince];
  if (currentRoomOnly && currentRoomId) msgParams.push(String(currentRoomId));

  const fileStmt = env.DB.prepare(fileSql);
  const msgStmt  = env.DB.prepare(msgSql);

  const [fileRes, msgRes] = await Promise.all([
    fileStmt.bind(...fileParams).all(),
    msgStmt.bind(...msgParams).all(),
  ]);

  const rawFiles = fileRes.results || [];
  const rawMessages = msgRes.results || [];
  const aliasFiles = roomAliasTitle ? rawFiles.filter(r => kohRoomAliasMatches(r, roomAliasTitle)) : rawFiles;
  const aliasMessages = roomAliasTitle ? rawMessages.filter(r => kohRoomAliasMatches(r, roomAliasTitle)) : rawMessages;
  const roomScopedFiles = roomAliasTitle && aliasFiles.length ? aliasFiles : rawFiles;
  const roomScopedMessages = roomAliasTitle && aliasMessages.length ? aliasMessages : rawMessages;
  const excludedFiles = roomScopedFiles.filter(r => kohIsExcludedRoomTitle(r.room_title));
  const excludedMessages = roomScopedMessages.filter(r => kohIsExcludedRoomTitle(r.room_title));

  return {
    files: roomScopedFiles.filter(r => !kohIsExcludedRoomTitle(r.room_title)),
    messages: roomScopedMessages.filter(r => !kohIsExcludedRoomTitle(r.room_title)),
    debug: {
      rawFiles: rawFiles.length,
      rawMessages: rawMessages.length,
      aliasFiles: aliasFiles.length,
      aliasMessages: aliasMessages.length,
      excludedRoomCount: excludedFiles.length + excludedMessages.length,
      roomAliasTitle,
    },
  };
}

// ── Intent constants ──────────────────────────────────────────────────────────
const KOH_INTENT = {
  FILE_LIST:              "FILE_LIST",
  FILE_SUMMARY:           "FILE_SUMMARY",
  FILE_RESEND:            "FILE_RESEND",
  MESSAGE_SUMMARY:        "MESSAGE_SUMMARY",
  PRIORITY:               "PRIORITY",
  GENERAL_CHAT:           "GENERAL_CHAT",
  ADMIN_COMMAND:          "ADMIN_COMMAND",
  MATERIAL_FIND:          "MATERIAL_FIND",
  MEETING_SUMMARY:        "MEETING_SUMMARY",
  SCHEDULE_CHECK:         "SCHEDULE_CHECK",
  ACTION_ITEM_CHECK:      "ACTION_ITEM_CHECK",
  NEWS_SEARCH:            "NEWS_SEARCH",
  NEWS_LIST:              "NEWS_LIST",
  STRATEGIC_6R_JUDGMENT:  "STRATEGIC_6R_JUDGMENT",
  BRIEFING_SUMMARY:       "BRIEFING_SUMMARY",
};

// ── 6R 프레임워크 ─────────────────────────────────────────────────────────────
const SIX_R_FRAMEWORK = {
  GR: { label: "정부관계(GR)", keywords: ["정부", "정책", "규제", "국회", "법", "지자체", "adr", "ipo", "sec", "상장", "지방선거"] },
  PR: { label: "언론홍보(PR)", keywords: ["언론", "보도", "pr", "커뮤니케이션", "대외", "기자", "입장문", "성명", "인터뷰"] },
  IR: { label: "투자자관계(IR)", keywords: ["투자자", "주주", "실적", "ir", "기업가치", "경영설명회"] },
  CR: { label: "고객관계(CR)", keywords: ["고객", "cr", "고객사", "제품", "납품", "공급"] },
  BR: { label: "협력사관계(BR)", keywords: ["협력사", "br", "파트너", "공급망", "mou", "상생"] },
  ER: { label: "구성원관계(ER)", keywords: ["직원", "구성원", "er", "노사", "노조", "성과급", "임직원", "the소통"] },
};

function detect6R(text) {
  const t = String(text || "").toLowerCase();
  const result = [];
  for (const [key, r] of Object.entries(SIX_R_FRAMEWORK)) {
    if (r.keywords.some(kw => t.includes(kw))) result.push(key);
  }
  return result.length ? result : [];
}

function buildAnswerPlan(text) {
  const t = String(text || "").trim();
  const intent = kohDetectIntent(t);
  const terms = kohExtractSearchTerms(t);
  const isInternal = kohIsInternalKnowledgeRequest(t);
  const six_r = detect6R(t);
  const RETRIEVAL_MAP = {
    [KOH_INTENT.GENERAL_CHAT]:          "NONE",
    [KOH_INTENT.ADMIN_COMMAND]:         "NONE",
    [KOH_INTENT.FILE_LIST]:             "FILES",
    [KOH_INTENT.FILE_SUMMARY]:          "FILES",
    [KOH_INTENT.FILE_RESEND]:           "FILES",
    [KOH_INTENT.MATERIAL_FIND]:         "FILES_AND_MESSAGES",
    [KOH_INTENT.MESSAGE_SUMMARY]:       "MESSAGES",
    [KOH_INTENT.MEETING_SUMMARY]:       "MESSAGES",
    [KOH_INTENT.SCHEDULE_CHECK]:        "FILES_AND_MESSAGES",
    [KOH_INTENT.ACTION_ITEM_CHECK]:     "FILES_AND_MESSAGES",
    [KOH_INTENT.PRIORITY]:              "FILES_AND_MESSAGES",
    [KOH_INTENT.NEWS_SEARCH]:           "EXTERNAL_SEARCH",
    [KOH_INTENT.NEWS_LIST]:             "MESSAGES",
    [KOH_INTENT.STRATEGIC_6R_JUDGMENT]: "FILES_AND_MESSAGES",
    [KOH_INTENT.BRIEFING_SUMMARY]:      "FILES_AND_MESSAGES",
  };
  const retrieval_needed = RETRIEVAL_MAP[intent] || (isInternal ? "FILES_AND_MESSAGES" : "NONE");
  return {
    intent: intent || "null",
    user_goal: t.slice(0, 100),
    retrieval_needed,
    answer_mode: intent?.toLowerCase() || "general",
    search_terms: terms,
    room_scope: kohIsCurrentRoomOnly(t) ? "current_room_only" : "all_accessible_sources",
    cross_room_allowed: !kohIsCurrentRoomOnly(t),
    six_r_needed: intent === KOH_INTENT.STRATEGIC_6R_JUDGMENT || six_r.length > 0,
    six_r_classification: six_r,
    confidence: intent ? "high" : isInternal ? "medium" : "low",
    reason: intent ? `${intent} 패턴 감지` : isInternal ? "내부 지식 요청" : "일반 대화",
  };
}

function kohFormatIssueCard({ title, summary, six_r, source_room, source_file, uploader, date, action_items, risk } = {}) {
  return formatIssueCard({
    issue_title: title,
    summary,
    six_r: Array.isArray(six_r) ? six_r : (six_r ? [six_r] : []),
    source_room,
    source_file,
    display_file_name: source_file || "",
    shared_by: uploader,
    uploader,
    date,
    action_items: action_items || [],
    agenda_category: "",
  });
}

function kohRelevanceGate(items, terms, threshold = 8) {
  if (!terms?.length) return items;
  const filtered = items.filter(item => (item._score || 0) >= threshold);
  return filtered.length > 0 ? filtered : [];
}

function kohDetectIntent(text = "") {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  // Normalize common typos/colloquials for matching
  const n = t
    .replace(/됫/g, "됐").replace(/됬/g, "됐").replace(/공유됫/g, "공유됐")
    .replace(/보내조/g, "보내줘").replace(/줘라/g, "줘").replace(/좀$/g, "줘")
    .replace(/알려조/g, "알려줘").replace(/정리좀/g, "정리해줘").replace(/요약좀/g, "요약해줘");

  // BRIEFING patterns (early check)
  if (isBriefingRequestCheck(n)) return KOH_INTENT.BRIEFING_SUMMARY;

  // RECENT_MATERIAL_BRIEF patterns → FILE_LIST intent
  if (isRecentMaterialBriefRequest(n)) return KOH_INTENT.FILE_LIST;

  // GENERAL_CHAT: clearly conversational, no internal data retrieval
  if (/^(날씨.*어때|오늘\s*날씨|점심.*뭐|밥.*뭐\s*먹|이거.*왜\s*안\s*돼|어떻게.*테스트|문장.*바꿔|번역해줘|설명해줘|정의가\s*뭐야|차이.*뭐야|예시.*들어|안녕하세요|반갑습니다)/.test(n) &&
      !/(파일|자료|문서|방|공유|저장|보고|안건|회의|일정|업무|kpi|보내|요약|정리|올라온|첨부|공유됐|공유된|진행|확인해야)/.test(n)) return KOH_INTENT.GENERAL_CHAT;

  // ADMIN_COMMAND: user name registration
  if (/\/set_user_name\b/.test(n) ||
      (/(id|아이디)\s*(등록|추가|입력)/.test(n) && /(해줘|해라|해줘라)/.test(n)) ||
      /이름\s*(정규화|수정|변경|바꿔|등록)/.test(n)) return KOH_INTENT.ADMIN_COMMAND;

  // NEWS_SEARCH: external news query
  if (/(뉴스.*확인|기사.*찾아|최신.*동향|외신.*확인|bloomberg|reuters|nikkei.*뉴스|언론.*보도.*어때|sk하이닉스.*뉴스|hbm.*기사)/.test(n) &&
      !/(방|대화|공유|자료|파일|보고된|내가)/.test(n)) return KOH_INTENT.NEWS_SEARCH;

  // NEWS_LIST: 뉴스/기사 "링크 목록"을 명시적으로 요청할 때만 (요약/정리는 본문 요약 경로로 넘김)
  if (/(뉴스|기사)/.test(n) &&
      /(목록|리스트|링크\s*(목록|정리|모아|보여)|url\s*(목록|정리))/.test(n) &&
      !/(본문|내용\s*요약|핵심\s*내용|요약해|정리해)/.test(n)) return KOH_INTENT.NEWS_LIST;

  // STRATEGIC_6R_JUDGMENT: 6R analysis
  if (/(어느\s*[rR]에서|[gGpPiIcCbBeE][rR]\s*(이야|야|인가|관련|해당|맞아|담당)|6r.*분류|6r.*판단|이해관계자.*정리|커뮤니케이션.*전략|어디서.*대응|입장.*정리해줘)/.test(n)) return KOH_INTENT.STRATEGIC_6R_JUDGMENT;

  // MEETING_SUMMARY: meeting-specific
  if (/(회의\s*(내용|결과|정리|요약|안건)|아까\s*회의|오늘\s*회의|회의록|미팅\s*내용|간담회\s*내용|회의에서\s*(나온|정해진|결정))/.test(n)) return KOH_INTENT.MEETING_SUMMARY;

  // ACTION_ITEM_CHECK: action items
  if (/(액션\s*아이템|해야\s*할\s*(일|것|과제)|챙겨야\s*할|다음\s*단계|확인\s*필요\s*사항|내가\s*해야|마감.*언제|담당\s*(확인|정리))/.test(n)) return KOH_INTENT.ACTION_ITEM_CHECK;

  // SCHEDULE_CHECK: schedule
  if (/(이번주\s*(일정|챙겨야|할\s*것)|오늘\s*(일정|해야)|일정.*(어때|어떻게|알려|보여|확인|요약|정리)|보고\s*일정|회의\s*일정|마감\s*일정|이\s*방.*일정|사진.*일정|이미지.*일정)/.test(n)) return KOH_INTENT.SCHEDULE_CHECK;

  // MATERIAL_FIND: locating specific material
  if (/(자료\s*어디|파일\s*어디|어디\s*있어|어느\s*방에|그\s*문서|그\s*발표자료|어느\s*파일|찾아줘.*자료|자료.*찾아줘)/.test(n)) return KOH_INTENT.MATERIAL_FIND;

  // FILE_RESEND: explicit send/transfer/share of a file
  if (/(보내줘|전달해줘|전달\s*요청|첨부해줘|올려줘|파일\s*줘|자료\s*줘|원본\s*보내|다시\s*보내|공유해줘|파일\s*전달|자료\s*공유|다시\s*올려|그\s*파일\s*줘|그\s*자료\s*보내)/.test(n)) return KOH_INTENT.FILE_RESEND;

  // FILE_SUMMARY: asking for content/summary of a specific file
  if (/(파일\s*(내용|요약|정리|상세|핵심|안에|뭐야)|자료\s*(내용|요약|정리|상세|기반|핵심|알려줘)|문서\s*(내용|요약|정리|안에|뭐야|뭐였)|보고자료.*요약|자료.*요약해|내용.*알려|내용.*정리|핵심만|자세히\s*알려|보고용.*요약|이\s*자료.*정리|자료.*내용|이\s*내용|이\s*문서|보고\s*내용.*요약|보고\s*된\s*거.*정리|보고된\s*거.*정리|자료\s*기반|파일\s*안에)/.test(n)) return KOH_INTENT.FILE_SUMMARY;

  // BRIEFING_SUMMARY: on-demand briefing from recent shared content
  if (/(브리핑|내일\s*오전\s*(브리핑|내용|공유)|오늘\s*공유된\s*내용.*브리핑|브리핑\s*(내용|후보|공유|준비)|오늘\s*(브리핑|공유\s*내용\s*정리)|내일\s*(챙겨야|보고)|아침\s*브리핑|오늘\s*아침\s*(정리|공유)|브리핑\s*뭐|내일\s*보고\s*(뭐|준비)|최근\s*공유.*브리핑)/.test(n)) return KOH_INTENT.BRIEFING_SUMMARY;

  // FILE_LIST: list of shared files (no specific content required)
  if (/(파일\s*(목록|뭐야|뭐가|어떤|있어|있지|공유됐|공유된|뭐있어|뭐있었|올라온|리스트|정리|올라왔|있었)|자료\s*(목록|뭐야|뭐있어|뭐있었어|있어|있지|공유됐|공유된|올라온|어떤|리스트|올라왔|있었)|공유된\s*(파일|자료|거|것)|저장된\s*(파일|자료)|올라온\s*(자료|문서|파일)|첨부된\s*(자료|파일)|전부\s*(보여|확인|알려)|전체\s*(보여|확인)|자료\s*전부|파일\s*전부|자료.*보여줘|보여줘.*자료|자료\s*뭐|파일\s*뭐|공유됐던\s*(거|것)|방에\s*올라온|최근.*자료.*확인|일주일.*자료)/.test(n)) return KOH_INTENT.FILE_LIST;

  // PRIORITY: urgency/priority check
  if (/(먼저\s*챙길|우선순위|챙겨야\s*할|이번주\s*안건|제일\s*급한|오늘\s*챙길|확인\s*필요한\s*일|뭐부터\s*봐야|뭐부터\s*해야|내가\s*먼저\s*볼|보고\s*전에\s*확인)/.test(n)) return KOH_INTENT.PRIORITY;

  // MESSAGE_SUMMARY: discussion/meeting summary
  const isSummaryRequest =
    /(요약|정리|안건|논의|얘기|내용|공유|올라온|나온|보고된|주요|이슈|과제|챙겨야|뭐\s*있|뭐가\s*있|뭐\s*나왔|뭐\s*올라)/.test(n) &&
    /(해줘|해주세요|정리해|요약해|알려줘|보여줘|뭐야|있어|있었어|있나|됐어|됐나)/.test(n);

  const isExplicitSummary =
    /(보고된\s*내용|단체방|단톡방|포함된\s*방|다른\s*방|무슨\s*얘기|이번주\s*주요|논의\s*내용|회의\s*내용|주요\s*안건|이번주.*정리|최근.*논의|방에서.*나온|여기\s*방|오늘.*내용|어제.*내용|이번주.*내용|최근.*내용|안건.*정리|내용.*정리|대화.*정리|자료.*정리)/.test(n);

  if (isSummaryRequest || isExplicitSummary) return KOH_INTENT.MESSAGE_SUMMARY;

  // Ambiguous / low confidence → null
  return null;
}

// Returns human-readable intent label for debug
function kohIntentLabel(intent) {
  return intent || "UNKNOWN(미분류)";
}

// Pending selection: store up to 3 candidates by chatId, expire 10 min
async function kohSavePending(env, chatId, intent, items) {
  if (!env.CONVERSATIONS) return;
  await env.CONVERSATIONS.put(
    `koh_pending_${chatId}`,
    JSON.stringify({ intent, files: items, createdAt: Date.now() }),
    { expirationTtl: 600 }
  );
}

async function kohHandlePendingSelection(env, chatId, userId, text) {
  if (!env.CONVERSATIONS) return false;
  const raw = await env.CONVERSATIONS.get(`koh_pending_${chatId}`);
  if (!raw) return false;
  let state;
  try { state = JSON.parse(raw); } catch (_) { return false; }
  if (Date.now() - (state.createdAt || 0) > 600000) {
    await env.CONVERSATIONS.delete(`koh_pending_${chatId}`);
    return false;
  }
  const n = Number(String(text || "").replace(/[번호\s]/g, "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 3) return false;
  const item = (state.files || [])[n - 1];
  if (!item) return false;
  await env.CONVERSATIONS.delete(`koh_pending_${chatId}`);

  const resolvedRoom = item._resolvedRoom || "알 수 없는 방";
  const resolvedName = item._resolvedName || item.uploader_name || "공유자 확인 필요";
  const location = `${resolvedRoom} > ${item.file_name || "파일명 없음"}`;

  if (state.intent === KOH_INTENT.FILE_RESEND) {
    const tgFileId = item._sendTelegramFileId || item.telegram_file_id || "";
    if (tgFileId) {
      const caption = kohFormatThreeLineItem({
        title: inferTitle(item),
        content: item.summary || item.extracted_text || item.content || "첨부 파일",
        location,
        person: resolvedName,
        date: kohFormatDate(item.created_at),
      });
      await kohSendDocument(env, chatId, item, caption);
    } else {
      await kohSendHtml(env, chatId, kohFormatThreeLineItem({
        title: inferTitle(item),
        content: "파일 원본 정보는 있으나 telegram_file_id가 없어 재전송할 수 없습니다.",
        location,
        person: resolvedName,
        date: kohFormatDate(item.created_at),
      }));
    }
  } else {
    // FILE_SUMMARY
    const summaryText = item.summary || item.extracted_text || item.content;
    await kohSendHtml(env, chatId, kohFormatThreeLineItem({
      title: inferTitle(item),
      content: summaryText
        ? String(summaryText).slice(0, 400)
        : "파일 원본은 확인되지만 본문 추출/요약이 없어 내용 요약은 어렵습니다. 필요하면 파일 전달 요청 가능합니다.",
      location,
      person: resolvedName,
      date: kohFormatDate(item.created_at),
    }));
  }
  return true;
}

// Helper: resolve names and room titles for a list of file/message rows
async function kohResolveItems(env, items, idField, nameField) {
  return Promise.all(items.map(async item => {
    const name = await resolveUserName(env, item[idField], item[nameField] || "공유자 확인 필요");
    const room = kohResolveRoomTitle(item, name);
    return { ...item, _resolvedName: name, _resolvedRoom: room };
  }));
}

// Deduplicates files, picks one representative per unique file.
// Primary key is file_name+room_id so rows with/without telegram_file_unique_id
// for the same file always end up in the same group.
function kohDedupFilesOld(files) {
  const groups = new Map();

  for (const f of files) {
    const baseName = String(f.file_name || "").toLowerCase().replace(/\s+/g, " ").trim();
    // file_name+room_id is most reliable — groups same file regardless of whether
    // telegram_file_unique_id is present on all rows.
    const key = baseName
      ? `name:${baseName}:${f.room_id || ""}`
      : f.telegram_file_unique_id
      ? `uniq:${f.telegram_file_unique_id}`
      : f.telegram_file_id
      ? `fid:${f.telegram_file_id}`
      : `id:${f.id}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  return [...groups.entries()].map(([, rows]) => {
    // Score each row to find best representative
    const ranked = rows.slice().sort((a, b) => {
      const s = r =>
        (r.telegram_file_id ? 10000 : 0) +
        (r.summary ? 2000 : 0) +
        (r.extracted_text ? 1000 : 0) +
        (r.content ? 500 : 0) +
        Number(r.file_size || 0);
      return s(b) - s(a);
    });

    const rep = { ...ranked[0] };
    rep._duplicateIds = rows.map(r => r.id);
    rep._isDuplicate  = rows.length > 1;

    // Merge best summary/extracted_text from duplicates if representative is missing
    if (!rep.summary) {
      const best = rows.map(r => r.summary || "").sort((a, b) => b.length - a.length)[0];
      if (best) rep.summary = best;
    }
    if (!rep.extracted_text) {
      const best = rows.map(r => r.extracted_text || "").sort((a, b) => b.length - a.length)[0];
      if (best) rep.extracted_text = best;
    }

    return rep;
  });
}

function kohDedupFiles(files) {
  const groups = new Map();

  for (const f of files || []) {
    const baseName = String(f.file_name || "").toLowerCase().replace(/\s+/g, " ").trim();
    const day = String(f.created_at || "").slice(0, 10);
    const size = Number(f.file_size || 0) || 0;
    const mgk = String(f.media_group_key || "").trim();
    const key = mgk
      ? `mgk:${mgk}`
      : f.telegram_file_unique_id
      ? `uniq:${f.telegram_file_unique_id}`
      : f.telegram_file_id
      ? `tg:${f.telegram_file_id}`
      : baseName && size
      ? `name_size_room:${baseName}:${size}:${f.room_id || ""}`
      : baseName && day
      ? `name_day:${baseName}:${day}`
      : baseName
      ? `name_room:${baseName}:${f.room_id || ""}`
      : `id:${f.id}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  return [...groups.entries()].map(([key, rows]) => {
    const ranked = rows.slice().sort((a, b) => {
      const score = r =>
        (r.telegram_file_id ? 10000 : 0) +
        (r.summary ? 2000 : 0) +
        (r.extracted_text ? 1000 : 0) +
        (r.content ? 500 : 0) +
        Number(r.file_size || 0) +
        ((Date.parse(r.created_at || "") || 0) / 100000000000);
      return score(b) - score(a);
    });

    const rep = { ...ranked[0] };
    const sendable = ranked.find(r => r.telegram_file_id);
    if (sendable) {
      rep._sendTelegramFileId = sendable.telegram_file_id;
      rep._sendFileRowId = sendable.id;
    }
    rep._dedupKey = key;
    rep._representativeId = rep.id;
    rep._duplicateIds = rows.map(r => r.id);
    rep._isDuplicate = rows.length > 1;
    if (!rep.summary) rep.summary = rows.map(r => r.summary || "").sort((a, b) => b.length - a.length)[0] || rep.summary;
    if (!rep.extracted_text) rep.extracted_text = rows.map(r => r.extracted_text || "").sort((a, b) => b.length - a.length)[0] || rep.extracted_text;
    if (!rep.content) rep.content = rows.map(r => r.content || "").sort((a, b) => b.length - a.length)[0] || rep.content;
    return rep;
  });
}

async function kohHandleInternalKnowledgeRequest(env, chatId, text, currentRoomId = "", userId = "") {
  if (!env.DB) {
    await kohSendHtml(env, chatId, "DB 연결이 없어 저장 기록을 확인할 수 없음.");
    return true;
  }

  const intent          = kohDetectIntent(text);
  const terms           = kohExtractSearchTerms(text);
  const roomAliasTitle  = kohResolveRoomAliasFromText(text);
  // 그룹방에서의 요청은 "다른 방/방들/방별/포함된 단체방" 등 명시적 교차-방 요청이거나
  // 특정 다른 방 별칭을 지목한 경우가 아니면 항상 현재 방(room_id) 기준으로만 조회한다.
  const crossRoomRequest = kohIsCrossRoomRequest(text) || !!roomAliasTitle;
  const currentRoomOnly = !!currentRoomId && !crossRoomRequest;
  const groupPreferred  = kohIsGroupRoomPreferred(text) || !!roomAliasTitle;
  const hasTerms        = terms.length > 0;
  const MIN_SCORE       = hasTerms ? 5 : 0;

  // Score files: when no terms, return all (score=0 still passes MIN_SCORE=0)
  function scoreFiles(rows) {
    return rows.map(r => ({
      ...r,
      _score: kohScoreRecord(r, terms) +
        (groupPreferred && Number(r.room_id || 0) < 0 ? 10 : 0) +
        (roomAliasTitle && kohRoomAliasMatches(r, roomAliasTitle) ? 25 : 0),
    }))
    .filter(r => r._score >= MIN_SCORE)
    .sort((a, b) => b._score - a._score);
  }

  function scoreMsgs(rows) {
    return rows
      .filter(m => !kohLooksLikeCommandOrRequestOnly(m.content))
      .filter(m => !isBotGeneratedSummary(m.content, m.sender_name))
      .map(m => ({
        ...m,
        _score: kohScoreRecord(m, terms) +
          (groupPreferred && Number(m.room_id || 0) < 0 ? 20 : 0) +
          (roomAliasTitle && kohRoomAliasMatches(m, roomAliasTitle) ? 25 : 0),
      }))
      .filter(r => r._score >= (hasTerms ? 5 : 1))
      .sort((a, b) => b._score - a._score);
  }

  function fileSummaryText(f) {
    if (f.action_plan || f.deadline || f.background) {
      const parts = [];
      if (f.summary && !f.summary.startsWith("요약 미생성") && !f.summary.startsWith("분석 중")) {
        parts.push(f.summary);
      }
      if (f.deadline) parts.push(`⚡ 마감: ${f.deadline}`);
      if (f.action_plan) parts.push(`📋 액션: ${f.action_plan}`);
      if (f.key_persons) parts.push(`👤 담당자: ${f.key_persons}`);
      if (parts.length) return parts.join("\n");
    }
    const s = String(f.summary || f.extracted_text || f.content || "").trim();
    if (s && !s.startsWith("요약 미생성") && !s.startsWith("분석 중")) return s.slice(0, 300);
    return "";
  }

  function exportFileNote(f) {
    return !f.telegram_file_id && (f.source_type === "telegram_export" || f.saved_by === "telegram_export_importer")
      ? "\n원본은 export 자료 기준으로 확인됨. Telegram 재전송은 불가할 수 있음."
      : "";
  }

  // BRIEFING_SUMMARY: on-demand briefing from recent shared content
  if (intent === KOH_INTENT.BRIEFING_SUMMARY) {
    await handleBriefingSummary(env, chatId, text, currentRoomId);
    return true;
  }

  // NEWS_LIST: 현재 방에 공유된 뉴스/기사 링크를 제목+URL 목록으로 정리
  if (intent === KOH_INTENT.NEWS_LIST) {
    await handleNewsLinkList(env, chatId, currentRoomId, text);
    return true;
  }

  // GENERAL_CHAT: skip file retrieval, answer directly
  if (intent === KOH_INTENT.GENERAL_CHAT) {
    try {
      const query = TONE_RULE +
        `당신은 권오혁 담당의 AI 비서입니다.\n` +
        `아래 요청에 내부 자료 검색 없이 직접 답변해주세요.\n\n` +
        `요청: ${text}\n\n` +
        `간결하고 실용적으로 답변. 최신 정보가 필요하면 외부 검색 기능 연결 필요를 짧게 안내.`;
      const result = await difyChat(env, { query, user: "koh", conversationId: "" });
      if (result.answer) { await kohSendHtml(env, chatId, result.answer); return true; }
    } catch (e) { console.error("GENERAL_CHAT:", e); }
    await kohSendHtml(env, chatId, "답변 생성 실패. 다시 시도해주세요.");
    return true;
  }

  // ADMIN_COMMAND: handle user registration via natural language
  if (intent === KOH_INTENT.ADMIN_COMMAND) {
    const nameMatch = text.match(/([가-힣]{2,4})\s*(이름|id|아이디)\s*(등록|정규화|수정|변경)/);
    if (nameMatch && env.DB) {
      const targetName = nameMatch[1];
      try {
        const existing = await env.DB.prepare(`SELECT telegram_id, name, canonical_name FROM users WHERE name LIKE ? OR canonical_name LIKE ? LIMIT 3`).bind(`%${targetName}%`, `%${targetName}%`).all();
        const rows = existing.results || [];
        if (rows.length === 1) {
          await env.DB.prepare(`UPDATE users SET canonical_name = ? WHERE telegram_id = ?`).bind(targetName, rows[0].telegram_id).run();
          await kohSendHtml(env, chatId, `사용자명 정규화 완료: ${rows[0].telegram_id} → ${targetName}`);
        } else if (rows.length > 1) {
          const list = rows.map(r => `· ${r.name || r.canonical_name} (ID: ${r.telegram_id})`).join("\n");
          await kohSendHtml(env, chatId, `이름이 유사한 사용자가 여러 명입니다:\n${list}\n\n정확한 user_id로 /set_user_name 명령을 사용해주세요.`);
        } else {
          await kohSendHtml(env, chatId, `"${targetName}" 이름의 사용자를 찾지 못했습니다.\n/set_user_name <user_id> <이름> 으로 직접 등록해주세요.`);
        }
      } catch (e) {
        await kohSendHtml(env, chatId, `사용자 조회 실패: ${String(e?.message || e).slice(0, 200)}`);
      }
    } else {
      await kohSendHtml(env, chatId, `사용자명 등록 방법:\n/set_user_name <user_id> <이름>\n예: /set_user_name 5965410906 이동연`);
    }
    return true;
  }

  // Initial fetch: 14-day window (or 7-day for FILE_LIST)
  const initDays = (intent === KOH_INTENT.FILE_LIST && !hasTerms) ? 7 : 14;
  const { files: rawFiles, messages } = await kohFetchRecentFilesAndMessages(env, currentRoomId, currentRoomOnly, initDays, roomAliasTitle);
  const files = kohDedupFiles(rawFiles);

  console.log("kohHandleInternalKnowledgeRequest fetch", {
    roomId: currentRoomId,
    currentRoomOnly,
    intent,
    filesFound: files.length,
    fileNames: files.map((f) => f.file_name).filter(Boolean).slice(0, 20),
  });

  let scoredFiles = scoreFiles(files);
  const scoredMsgs = scoreMsgs(messages);

  // Group-preferred: if group results exist, exclude 1:1 messages
  let filteredMsgs = scoredMsgs;
  if (groupPreferred) {
    const groupOnly = scoredMsgs.filter(m => Number(m.room_id || 0) < 0);
    if (groupOnly.length > 0) filteredMsgs = groupOnly;
  }

  // PRIORITY: delegate to existing handler
  if (intent === KOH_INTENT.PRIORITY) return false;

  // Low confidence intent — ask user what they mean (no LLM call to stay within CPU limit)
  if (intent === null) {
    try {
      const rows = await fetchDigestRows(env, 7, 100);
      const corpus = buildDigestCorpus(rows);
      const senderName = (await getUser(userId, env))?.name || "담당자";
      const query =
        TONE_RULE + SUMMARY_RULE +
        `당신은 권오혁 담당의 AI 비서입니다.\n` +
        `아래는 최근 7일간 팀 자료입니다.\n\n` +
        `[팀 자료]\n${corpus.slice(0, 6000)}\n\n` +
        `[${senderName}의 요청]\n${text}\n\n` +
        `위 자료를 참고해서 요청에 직접 답해줘.\n` +
        `SUMMARY_RULE 형식으로 안건별 정리.\n` +
        `"메뉴 선택" 안내 절대 금지.`;
      const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
      if (result?.answer) {
        await kohSendHtml(env, chatId, result.answer);
        return true;
      }
    } catch (e) {
      console.error("intent null dify fallback:", e);
    }
    await kohSendHtml(env, chatId, `질문을 이해하지 못했습니다.\n예시: "오늘 자료 정리해줘"`);
    return true;
  }

  // ── FILE_LIST → handleRecentMaterialBrief (IssueCard only, no raw output) ───
  if (intent === KOH_INTENT.FILE_LIST) {
    if (!scoredFiles.length && !hasTerms) {
      const { files: f30r } = await kohFetchRecentFilesAndMessages(env, currentRoomId, currentRoomOnly, 30, roomAliasTitle);
      scoredFiles = scoreFiles(kohDedupFiles(f30r));
    }

    if (!scoredFiles.length) {
      await kohSendHtml(env, chatId, currentRoomOnly ? "이 방에 공유된 자료를 찾지 못했습니다." : "최근 저장 기록에서 관련 자료를 찾지 못했습니다.");
      return true;
    }

    if (/(요약|정리)/.test(text)) {
      const roomTitle = scoredFiles[0]?.room_title || "";
      return await handleRoomFileSummary(env, chatId, scoredFiles, currentRoomId, roomTitle);
    }

    const display = scoredFiles.slice(0, 5);
    const allItems = await kohResolveItems(env, display, "uploader_id", "uploader_name");

    await handleRecentMaterialBrief(allItems, chatId, env);
    return true;
  }

  // ── FILE_SUMMARY ──────────────────────────────────────────────────────────
  if (intent === KOH_INTENT.FILE_SUMMARY) {
    if (!scoredFiles.length) {
      await kohSendHtml(env, chatId,
        hasTerms
          ? `관련 파일이 확인되지 않습니다. (검색어: ${terms.join(", ")})\n관련 파일이 없으면 포함된 방 메시지 기준으로 확인한 내용은 아래와 같음.`
          : "관련 파일을 찾을 수 없습니다."
      );
      return true;
    }
    const top = scoredFiles[0], second = scoredFiles[1];
    const ambiguous = second && (top._score - second._score) <= 8;
    if (false && ambiguous) {
      const candidates = await kohResolveItems(env, scoredFiles.slice(0, 3), "uploader_id", "uploader_name");
      await kohSavePending(env, chatId, KOH_INTENT.FILE_SUMMARY, candidates);
      const body = candidates.map((f, i) => kohFormatThreeLineItem({
        title: `${i + 1}. ${inferTitle(f)}`,
        content: (fileSummaryText(f) || "요약 없음") + exportFileNote(f),
        location: `${f._resolvedRoom} > ${f.file_name || "파일명 없음"}`,
        person: f._resolvedName,
        date: kohFormatDate(f.created_at),
      })).join("\n\n");
      await kohSendHtml(env, chatId, `<b>관련 파일이 여러 개입니다. 요약할 번호를 선택해주세요.</b>\n\n${body}`);
      return true;
    }
    const [item] = await kohResolveItems(env, [top], "uploader_id", "uploader_name");
    const sumText = fileSummaryText(item);
    await kohSendHtml(env, chatId, kohFormatThreeLineItem({
      title: inferTitle(item),
      content: sumText
        ? String(sumText).slice(0, 400)
        : "파일 원본은 확인되지만 본문 추출/요약이 없어 내용 요약은 어렵습니다. 필요하면 파일 전달 요청 가능합니다.",
      location: `${item._resolvedRoom} > ${item.file_name || "파일명 없음"}`,
      person: item._resolvedName,
      date: kohFormatDate(item.created_at),
    }));
    return true;
  }

  // ── FILE_RESEND ───────────────────────────────────────────────────────────
  if (intent === KOH_INTENT.FILE_RESEND) {
    if (!scoredFiles.length) {
      if (filteredMsgs.length) {
        const items = await kohResolveItems(env, filteredMsgs.slice(0, 3), "sender_id", "sender_name");
        const body = items.map((m, i) => kohFormatThreeLineItem({
          title: `${i + 1}. ${inferTitle(m)}`,
          content: String(m.content || "관련 메시지 확인됨").slice(0, 200),
          location: `${m._resolvedRoom} > 관련 메시지`,
          person: m._resolvedName,
          date: kohFormatDate(m.created_at),
        })).join("\n\n");
        await kohSendHtml(env, chatId, `<b>파일 원본은 없음. 관련 메시지 기준 내용입니다.</b>\n\n${body}`);
      } else {
        await kohSendHtml(env, chatId, hasTerms
          ? `최근 저장 기록에서 관련 내용을 찾지 못함.`
          : "관련 파일이나 메시지를 찾을 수 없습니다."
        );
      }
      return true;
    }
    if (scoredFiles.length === 1) {
      const [item] = await kohResolveItems(env, [scoredFiles[0]], "uploader_id", "uploader_name");
      const caption = kohFormatThreeLineItem({
        title: inferTitle(item),
        content: fileSummaryText(item) || "첨부 파일",
        location: `${item._resolvedRoom} > ${item.file_name || "파일명 없음"}`,
        person: item._resolvedName,
        date: kohFormatDate(item.created_at),
      });
      const sent = await kohSendDocument(env, chatId, item, caption);
      if (!sent) {
        await kohSendHtml(env, chatId, kohFormatThreeLineItem({
          title: inferTitle(item),
          content: "파일 원본 정보는 있으나 telegram_file_id가 없어 재전송할 수 없습니다.",
          location: `${item._resolvedRoom} > ${item.file_name || "파일명 없음"}`,
          person: item._resolvedName,
          date: kohFormatDate(item.created_at),
        }));
      }
      return true;
    }
    const candidates = await kohResolveItems(env, scoredFiles.slice(0, 3), "uploader_id", "uploader_name");
    await kohSavePending(env, chatId, KOH_INTENT.FILE_RESEND, candidates);
    const body = candidates.map((f, i) => formatResendCandidateLine(f, i + 1)).join("\n");
    await kohSendHtml(env, chatId, `관련 원본 후보 ${candidates.length}건입니다. 보낼 번호를 선택해주세요.\n\n${body}`);
    return true;
  }

  // ── MEETING_SUMMARY ───────────────────────────────────────────────────────
  if (intent === KOH_INTENT.MEETING_SUMMARY) {
    const meetingMsgs = filteredMsgs.slice(0, 20);
    if (!meetingMsgs.length && !scoredFiles.length) {
      await kohSendHtml(env, chatId, "회의 기록을 찾지 못했습니다.");
      return true;
    }
    const corpus = meetingMsgs.map(m =>
      `[${kohFormatDate(m.created_at)}] ${m._resolvedRoom || m.room_title || ""} | ${m.sender_name || ""}: ${String(m.content || "").slice(0, 300)}`
    ).join("\n");
    try {
      const q = TONE_RULE + SUMMARY_RULE +
        `다음은 회의/논의 기록입니다. 회의 결과를 정리해줘.\n\n` +
        `[정리 항목]\n· 논의된 안건\n· 결정사항\n· 액션아이템 (담당자, 기한)\n· 확인 필요 사항\n\n` +
        `[회의 기록]\n${corpus.slice(0, 6000)}\n\n요청: ${text}`;
      const r = await difyChat(env, { query: q, user: "koh", conversationId: "" });
      if (r.answer) { await kohSendHtml(env, chatId, r.answer); return true; }
    } catch (e) { console.error("MEETING_SUMMARY:", e); }
    await kohSendHtml(env, chatId, "회의 내용 요약 생성 실패. 다시 시도해주세요.");
    return true;
  }

  // ── SCHEDULE_CHECK / ACTION_ITEM_CHECK ────────────────────────────────────
  if (intent === KOH_INTENT.SCHEDULE_CHECK || intent === KOH_INTENT.ACTION_ITEM_CHECK) {
    const allItems = [...scoredFiles.slice(0, 10), ...filteredMsgs.slice(0, 20)];
    if (!allItems.length) {
      await kohSendHtml(env, chatId, currentRoomOnly ? "이 방에서 일정 정보를 찾지 못했습니다." : "관련 일정·액션아이템을 찾지 못했습니다.");
      return true;
    }

    if (intent === KOH_INTENT.SCHEDULE_CHECK) {
      const { kstDate } = getKstDayRange();
      const { start: weekStart, end: weekEnd } = getKstWeekRange();
      const isTodayOnly = /오늘/.test(text) && !/이번주|주간/.test(text);
      const scopeLabel = isTodayOnly ? `오늘(${kstDate}) 하루` : `이번주(${weekStart} ~ ${weekEnd})`;
      const imageFiles = scoredFiles.filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f.file_name || ""));
      const corpus = [
        ...scoredFiles.slice(0, 10).map(f => `[자료] ${f.room_title || ""} | ${f.file_name || ""}: ${String(f.summary || f.extracted_text || f.content || "").slice(0, 500)}`),
        ...filteredMsgs.slice(0, 20).map(m => `[대화] ${m.room_title || ""} | ${m.sender_name || ""}: ${String(m.content || "").slice(0, 200)}`),
      ].join("\n");
      try {
        const q = TONE_RULE +
          `이미지 또는 자료에서 일정 정보를 추출할 때는 날짜와 회의명만 간결하게 정리하세요. 액션아이템, 담당자, 상세 설명은 사용자가 별도로 요청하지 않는 한 출력하지 마세요.\n\n` +
          `오늘 날짜(KST): ${kstDate}\n` +
          `이번주 범위(KST): ${weekStart} ~ ${weekEnd}\n\n` +
          `아래 자료에서 ${scopeLabel}에 해당하는 일정만 추출해서 정리해줘.\n\n` +
          `[출력 형식]\n` +
          (isTodayOnly
            ? `오늘 주요 일정\n- MM/DD 회의명\n- MM/DD 회의명\n`
            : `오늘 주요 일정\n- MM/DD 회의명\n\n이번주 주요 일정\n- MM/DD 회의명\n- MM/DD 회의명\n`) +
          `\n날짜를 알 수 없는 항목은 "날짜 미확인"으로 표시.\n` +
          `일정이 없는 날짜/구간은 출력하지 마세요.\n` +
          `위 형식 외의 텍스트(인사말, 설명 등)는 출력하지 마세요.\n\n` +
          `[자료]\n${corpus.slice(0, 6000)}\n\n요청: ${text}`;
        const r = await difyChat(env, { query: q, user: "koh", conversationId: "" });
        const answer = (r.answer || "").trim();
        if (imageFiles.length) {
          console.log("IMAGE_SCHEDULE_EXTRACT", {
            roomId: currentRoomId,
            roomTitle: imageFiles[0]?.room_title || "",
            imageFileId: imageFiles.map(f => f.telegram_file_id || f.file_name),
            extractedScheduleCount: (answer.match(/^- /gm) || []).length,
          });
        }
        if (answer) { await kohSendHtml(env, chatId, answer); return true; }
      } catch (e) { console.error("SCHEDULE_CHECK:", e); }
      await kohSendHtml(env, chatId, "일정 추출 실패. 다시 시도해주세요.");
      return true;
    }

    // ACTION_ITEM_CHECK
    const corpus = [
      ...scoredFiles.slice(0, 10).map(f => `[파일] ${f._resolvedRoom || f.room_title || ""} | ${f.file_name || ""}: ${String(f.summary || f.content || "").slice(0, 300)}`),
      ...filteredMsgs.slice(0, 20).map(m => `[대화] ${m._resolvedRoom || m.room_title || ""} | ${m.sender_name || ""}: ${String(m.content || "").slice(0, 200)}`),
    ].join("\n");
    try {
      const q = TONE_RULE +
        `아래 자료에서 액션아이템과 해야 할 일을 추출해줘.\n\n` +
        `[추출 형식]\n📋 액션: 할 일 | 담당자 (불명확하면 "확인 필요")\n\n` +
        `[자료]\n${corpus.slice(0, 6000)}\n\n요청: ${text}`;
      const r = await difyChat(env, { query: q, user: "koh", conversationId: "" });
      if (r.answer) { await kohSendHtml(env, chatId, r.answer); return true; }
    } catch (e) { console.error("ACTION_ITEM_CHECK:", e); }
    await kohSendHtml(env, chatId, "액션아이템 추출 실패. 다시 시도해주세요.");
    return true;
  }

  // ── STRATEGIC_6R_JUDGMENT ─────────────────────────────────────────────────
  if (intent === KOH_INTENT.STRATEGIC_6R_JUDGMENT) {
    const six_r = detect6R(text);
    const corpus = [...scoredFiles.slice(0, 5), ...filteredMsgs.slice(0, 10)].map(r =>
      `[${r._resolvedRoom || r.room_title || ""}] ${r.file_name || r.sender_name || ""}: ${String(r.summary || r.content || "").slice(0, 300)}`
    ).join("\n");
    try {
      const sixRDefs = Object.entries(SIX_R_FRAMEWORK).map(([k, v]) => `${k}(${v.label}): ${v.keywords.slice(0, 4).join(", ")}`).join(" | ");
      const q = TONE_RULE +
        `[6R 프레임워크]\n${sixRDefs}\n\n` +
        `위 6R 프레임워크 기준으로 아래 요청을 분류하고 대응 방향을 제시해줘.\n\n` +
        `[관련 자료]\n${corpus.slice(0, 4000) || "관련 자료 없음"}\n\n` +
        `[요청]\n${text}\n\n` +
        `[답변 형식]\n분류: GR/PR/IR/CR/BR/ER 중 해당\n이유: 왜 이 R인지\n이해관계자: 핵심 관계자\n대응 방향: 구체적 액션`;
      const r = await difyChat(env, { query: q, user: "koh", conversationId: "" });
      if (r.answer) { await kohSendHtml(env, chatId, r.answer); return true; }
    } catch (e) { console.error("STRATEGIC_6R:", e); }
    await kohSendHtml(env, chatId, "6R 판단 생성 실패. 다시 시도해주세요.");
    return true;
  }

  // ── MATERIAL_FIND → IssueCard 요약 (번호 선택 금지) ──────────────────────
  if (intent === KOH_INTENT.MATERIAL_FIND) {
    // 동적 검색어 추출 + synonym 확장
    const baseTerms = extractDynamicSearchTerms(text);
    const searchTerms = expandSearchTerms(baseTerms.length ? baseTerms : terms);
    const metaFilters = extractMetadataFilters(text);
    const plan = { search_terms: searchTerms.length ? searchTerms : terms, user_goal: text, meta_filters: metaFilters };

    const gated = kohRelevanceGate(scoredFiles, searchTerms.length ? searchTerms : terms, 5);
    const relFiltered = gated.filter(c => passMaterialFindRelevance(c, plan));
    if (!relFiltered.length && !filteredMsgs.length) {
      const displayTerms = baseTerms.length ? baseTerms.slice(0, 3) : terms.slice(0, 3);
      await kohSendHtml(env, chatId, displayTerms.length
        ? `"${displayTerms.join(", ")}" 관련 자료를 찾지 못했습니다.`
        : "관련 자료를 찾지 못했습니다.");
      return true;
    }
    const rawItems = await kohResolveItems(env, relFiltered.slice(0, 5), "uploader_id", "uploader_name");
    const items = rawItems
      .filter(f => !isBotGeneratedOutput(f.summary || f.content || "", f._resolvedName || ""))
      .slice(0, 3);

    if (!items.length) {
      await kohSendHtml(env, chatId, "관련 자료는 확인되지만, 요약 가능한 본문을 찾지 못했습니다. 원본이 필요하면 자료명을 지정해 요청해주세요.");
      return true;
    }

    // 후보를 pending에 저장 (이후 "1번 원본 보내줘" 처리용)
    await kohSavePending(env, chatId, KOH_INTENT.FILE_RESEND, items);

    const cards = [];
    for (const f of items) {
      try {
        const card = await buildIssueCardFromCandidate(f, env);
        if (!card || !card.summary) continue;
        if (looksLikeRawChatResponse(card.summary)) continue;
        cards.push(card);
      } catch (e) {
        console.error("MATERIAL_FIND IssueCard:", e);
      }
    }

    if (!cards.length) {
      await kohSendHtml(env, chatId, "관련 자료는 확인되지만, 요약 가능한 업무 본문을 찾지 못했습니다. 원본이 필요하면 자료명을 지정해 요청해주세요.");
      return true;
    }

    const output = cards.map((card, idx) => formatIssueCardForMaterialFind(card, idx + 1)).join("\n\n");
    await kohSendHtml(env, chatId, output);
    return true;
  }

  // ── NEWS_SEARCH ───────────────────────────────────────────────────────────
  if (intent === KOH_INTENT.NEWS_SEARCH) {
    if (isExternalSearchEnabled && isExternalSearchEnabled(env)) {
      // 외부 검색으로 위임
      return false;
    }
    await kohSendHtml(env, chatId, `뉴스 검색 기능이 비활성화되어 있습니다.\nTAVILY_API_KEY 및 EXTERNAL_SEARCH_ENABLED 설정이 필요합니다.`);
    return true;
  }

  // ── MESSAGE_SUMMARY ───────────────────────────────────────────────────────
  if (filteredMsgs.length > 0) {
    const items = await kohResolveItems(env, filteredMsgs.slice(0, 5), "sender_id", "sender_name");
    const body = items.map((m, i) => kohFormatThreeLineItem({
      title: `${i + 1}. ${inferTitle(m)}`,
      content: String(m.content || "관련 메시지 확인됨").slice(0, 200),
      location: `${m._resolvedRoom} > 관련 메시지`,
      person: m._resolvedName,
      date: kohFormatDate(m.created_at),
    })).join("\n\n");
    await kohSendHtml(env, chatId, `<b>${currentRoomOnly ? "이 방" : "포함된 방"} 최근 기록입니다.</b>\n\n${body}`);
    return true;
  }

  // Fallback: show files
  if (scoredFiles.length > 0) {
    const items = await kohResolveItems(env, scoredFiles.slice(0, 3), "uploader_id", "uploader_name");
    const body = items.map((f, i) => kohFormatThreeLineItem({
      title: `${i + 1}. ${inferTitle(f)}`,
      content: (fileSummaryText(f) || "요약 없음") + exportFileNote(f),
      location: `${f._resolvedRoom} > ${f.file_name || "파일명 없음"}`,
      person: f._resolvedName,
      date: kohFormatDate(f.created_at),
    })).join("\n\n");
    const canSend = items.some(f => f.telegram_file_id);
    await kohSendHtml(env, chatId, `<b>${currentRoomOnly ? "이 방" : "관련"} 파일 기록입니다.</b>\n\n${body}${canSend ? "\n\n파일을 받으려면 파일명 언급 후 '보내줘'라고 해주세요." : ""}`);
    return true;
  }

  await kohSendHtml(env, chatId, currentRoomOnly ? "이 방에 공유된 자료를 찾지 못했습니다." : "최근 저장 기록에서 관련 내용을 찾지 못했습니다.");
  return true;
}

export default {
  async fetch(request, env, ctx) {
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
      ctx.waitUntil(handleUpdate(update, env, isRelay));
    } catch (e) {
      console.error("handleUpdate error:", e);
    }
    return new Response("OK");
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        await sendDailyBriefing(env, { mock: false });
      } catch (error) {
        console.error("scheduled daily briefing failed:", error);
        const target = env.DAILY_BRIEFING_CHAT_ID || env.ADMIN_CHAT_ID || env.ADMIN_TELEGRAM_ID || "";
        if (target) {
          try {
            await sendMessage(env, target, "아침 브리핑 발송 실패함.");
          } catch (notifyError) {
            console.error("scheduled daily briefing notify failed:", notifyError);
          }
        }
      }
    })());
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
async function dbInsert(env, { roomId, roomTitle, senderId, senderName, content, savedBy, telegramMessageId = "", sourceType = "" }, options = {}) {
  if (!env.DB || !content?.trim()) return false;
  try {
    const table = await env.DB.prepare(`PRAGMA table_info(messages)`).all();
    const existing = new Set((table.results || []).map((c) => c.name));
    if (!existing.has("room_id") || !existing.has("content")) {
      throw new Error(`messages schema missing required columns: ${[...existing].join(",")}`);
    }
    const values = {
      telegram_message_id: String(telegramMessageId || ""),
      room_id: String(roomId),
      room_title: roomTitle || "",
      sender_id: String(senderId || ""),
      sender_name: senderName || "",
      content: content.slice(0, 4000),
      saved_by: savedBy || "koh",
      source_type: sourceType || "telegram_group",
      source_status: "active",
    };
    const columns = Object.keys(values).filter((name) => existing.has(name));
    const placeholders = columns.map(() => "?").join(", ");
    await env.DB.prepare(`INSERT INTO messages (${columns.join(", ")}) VALUES (${placeholders})`)
      .bind(...columns.map((name) => values[name]))
      .run();
    console.log("message saved", {
      room_title: values.room_title,
      sender_name: values.sender_name,
      source_type: values.source_type,
    });
    return true;
  } catch (e) {
    console.error("dbInsert:", e);
    if (options.throwOnError) throw e;
    return false;
  }
}

// 멤버십 기록
async function ensureInfoItemsTable(env) {
  if (!env.DB) return false;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS info_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_message_id TEXT,
      message_key TEXT,
      room_id TEXT,
      room_title TEXT,
      category TEXT,
      person_tag TEXT,
      reporter TEXT,
      title TEXT,
      summary TEXT,
      implication TEXT,
      source_text TEXT,
      sender_id TEXT,
      sender_name TEXT,
      message_time TEXT,
      raw_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  return true;
}

function parseInfoItem(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  const tags = firstLine.match(/#[^\s#]+/g) || [];
  const category = tags[0] || "";
  const allowed = new Set(["#정책", "#국회", "#BH", "#글로벌"]);
  if (!allowed.has(category)) return null;

  const field = (label) => {
    const labels = "보고자|안건|주요\\s*내용|시사점|원출처";
    const re = new RegExp(`(?:^|\\n)\\s*(?:[*-]\\s*)?${label}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*(?:[*-]\\s*)?(?:${labels})\\s*[:：]|$)`, "i");
    const match = raw.match(re);
    return match ? match[1].trim() : "";
  };

  const item = {
    category,
    person_tag: tags[1] || "",
    reporter: field("보고자").replace(/^#/, "").trim(),
    title: field("안건"),
    summary: field("주요\\s*내용"),
    implication: field("시사점"),
    source_text: field("원출처"),
    raw_text: raw,
  };
  return (item.title || item.summary) ? item : null;
}

async function saveInfoItem(env, item) {
  if (!env.DB || !item) return false;
  await ensureInfoItemsTable(env);
  if (item.message_key) {
    const prev = await env.DB.prepare(`SELECT id FROM info_items WHERE message_key = ? LIMIT 1`).bind(item.message_key).first();
    if (prev?.id) return false;
  }
  await env.DB.prepare(`
    INSERT INTO info_items (
      source_message_id, message_key, room_id, room_title,
      category, person_tag, reporter, title, summary, implication, source_text,
      sender_id, sender_name, message_time, raw_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    item.source_message_id || "",
    item.message_key || "",
    item.room_id || "",
    item.room_title || "",
    item.category || "",
    item.person_tag || "",
    item.reporter || "",
    item.title || "",
    item.summary || "",
    item.implication || "",
    item.source_text || "",
    item.sender_id || "",
    item.sender_name || "",
    item.message_time || "",
    item.raw_text || ""
  ).run();
  return true;
}

async function maybeSaveInfoItem(env, message, text, messageKey) {
  try {
    if (!env.DB || !message || message.from?.is_bot) return false;
    const item = parseInfoItem(text);
    if (!item) return false;
    item.source_message_id = String(message.message_id || "");
    item.message_key = String(messageKey || `${message.chat?.id || ""}:${message.message_id || ""}`);
    item.room_id = String(message.chat?.id || "");
    item.room_title = getRoomTitleForMessage(message);
    item.sender_id = String(message.from?.id || "");
    item.sender_name = getSenderName(message.from);
    item.message_time = message.date ? new Date(message.date * 1000).toISOString() : "";
    return await saveInfoItem(env, item);
  } catch (e) {
    console.error("maybeSaveInfoItem:", e);
    return false;
  }
}

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

async function dbRegisterRoom(env, roomId, roomTitle, botName, roomType = "group") {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO rooms (room_id, room_title, room_type, bot_name, source, last_seen_at)
       VALUES (?, ?, ?, ?, 'telegram', CURRENT_TIMESTAMP)
       ON CONFLICT(room_id) DO UPDATE SET
         room_title = excluded.room_title,
         room_type = excluded.room_type,
         bot_name = excluded.bot_name,
         source = excluded.source,
         last_seen_at = CURRENT_TIMESTAMP`
    )
      .bind(String(roomId), roomTitle || "", roomType || "group", botName || "koh")
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
  return readBoolEnv(env, "EXTERNAL_SEARCH_ENABLED", false);
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
  return (results || []).map((r, idx) => {
    const title = r.title || "제목 없음";
    const snippet = r.snippet || r.content || "요약 없음";
    const url = r.url || "";
    const provider = r.provider || "외신";
    const date = r.published_date || r.date || "";
    return (
      `[외부자료 ${idx + 1}]\n` +
      `제목: ${title}\n` +
      `요약: ${snippet.slice(0, 300)}\n` +
      `출처: ${provider}${date ? " (" + date + ")" : ""}\n` +
      `링크: ${url}`
    );
  }).join("\n\n");
}

async function answerExternalSearchNotConfigured(env, text) {
  const internalKeyword = extractSearchKeyword(text);
  const internalRows = await searchMemory(env, internalKeyword, 20);
  const internalCorpus = buildSourceCorpus(internalRows);
  if (internalRows.length) {
    return `외부검색 미설정.\n\n핵심: 내부 D1 기록 기준으로만 확인함.\n확인: TAVILY_API_KEY, EXTERNAL_SEARCH_ENABLED 필요.\n\n${internalCorpus.slice(0, 1800)}`;
  }
  return "외부검색 미설정.\n핵심: 내부 D1 기록도 없음.\n확인: TAVILY_API_KEY, EXTERNAL_SEARCH_ENABLED 필요.";
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
    const corpus = buildExternalCorpus(externalResults) || "외부 검색 결과 없음";
    const query = TONE_RULE +
      `[사용자 질문]\n${text}\n\n` +
      (internalCorpus ? `[내부 기록]\n${internalCorpus}\n\n` : "") +
      `다음은 외부에서 수집된 뉴스/기사입니다. 아래 형식으로 정리해줘.\n\n` +
      `[뉴스 정리 형식]\n` +
      `📰 뉴스 제목 (핵심 내용 한 줄 요약)\n` +
      `· 주요 내용: 1~2줄\n` +
      `· 업무 참고: SK하이닉스·6R전략실 관점에서 챙겨야 할 점\n` +
      `· 링크: URL (있으면)\n\n` +
      `[규칙]\n` +
      `- 뉴스 하나에 여러 안건이 있으면 각각 별도로 정리\n` +
      `- <b> 볼드 금지, 사람 이름 <u>이름</u>\n` +
      `- 마크다운(*, #) 금지\n\n` +
      `[뉴스 데이터]\n` + corpus;
    const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
    const answer = result?.answer || "외부 검색 기반 답변을 생성하지 못했음.";
    const sourceLines = externalResults.slice(0, 3).map((r, idx) =>
      `${idx + 1}. 제목: ${r.title || "제목 없음"}\n요약: ${r.snippet || "요약 없음"}\nURL: ${r.url || ""}`
    ).join("\n\n");
    return sourceLines ? `${answer}\n\n참고자료\n${sourceLines}` : answer;
  } catch (error) {
    return `외부검색 실패.\n핵심: ${searchQuery} 검색 실패함.\n확인: /search_status, /web_test ${searchQuery} 필요.`;
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
    await sendMessage(env, chatId, `웹검색 비활성.\nEXTERNAL_SEARCH_ENABLED raw: ${String(env.EXTERNAL_SEARCH_ENABLED || "")}\nTAVILY_API_KEY: ${hasTavilyConfig(env) ? "있음" : "없음"}`);
    return;
  }
  if (!hasTavilyConfig(env)) {
    await sendMessage(env, chatId, `웹검색 설정 누락.\nEXTERNAL_SEARCH_ENABLED raw: ${String(env.EXTERNAL_SEARCH_ENABLED || "")}\nTAVILY_API_KEY: 없음`);
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
      `Tavily 검색 실패.\nEXTERNAL_SEARCH_ENABLED raw: ${String(env.EXTERNAL_SEARCH_ENABLED || "")}\nTAVILY_API_KEY: ${hasTavilyConfig(env) ? "있음" : "없음"}\nTavily 오류: ${String(error?.message || error).slice(0, 160)}`
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
    `EXTERNAL_SEARCH_ENABLED raw: ${String(env.EXTERNAL_SEARCH_ENABLED || "")}\n` +
    `EXTERNAL_SEARCH_ENABLED: ${enabled ? "true" : "false"}\n` +
    `TAVILY_API_KEY: ${hasKey ? "있음" : "없음"}\n`;
  if (!enabled || !hasKey) {
    msg +=
      `\n확인: Cloudflare Secret/Variable 설정 필요.`;
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

async function tableColumns(env, tableName) {
  if (!env.DB || !(await tableExists(env, tableName))) return new Set();
  const result = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set((result.results || []).map(r => r.name));
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
      `D1 상태 확인 실패.\n핵심: ${String(error?.message || error)}`
    );
  }
}

async function handleDbStatus(env, chatId) {
  if (!env.DB) {
    await sendMessage(env, chatId, "D1 binding env.DB가 없음. wrangler.toml의 [[d1_databases]] binding = \"DB\" 확인 필요.");
    return;
  }
  try {
    const tables = ["users", "rooms", "room_members", "messages", "files", "external_sources"];
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
      `D1 상태 확인 실패.\n핵심: ${String(error?.message || error)}\n확인: D1 binding/migration 필요.`
    );
  }
}

function isImageStatusCommand(text) {
  return false;
}

async function handleImageStatus(env, chatId) {
  await sendMessage(env, chatId,
    `이미지 분석 비활성화됨.\n핵심: 파일 저장만 수행함.\n확인: 텍스트/문서 요약은 Dify 사용.`
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
      let note = "";
      if (await tableExists(env, "messages")) {
        const groupCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM messages WHERE source_type = 'telegram_group'`).first();
        if (Number(groupCount?.count || 0) > 0) note = "\n확인: rooms 저장 실패 가능성.";
      }
      await sendMessage(env, chatId,
        `등록된 방 없음.\n핵심: rooms 저장 기록 없음.${note}`
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

async function handleDebugRooms(env, chatId) {
  try {
    if (!env.DB) {
      await sendMessage(env, chatId, "debug rooms 실패함. 오류: DB binding 없음");
      return;
    }
    const roomsCount = await tableExists(env, "rooms")
      ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM rooms`).first()
      : { count: 0 };
    const hasRoomExtra = await columnExists(env, "rooms", "last_seen_at");
    const roomSql = hasRoomExtra
      ? `SELECT room_id, room_title, room_type, last_seen_at FROM rooms ORDER BY last_seen_at DESC LIMIT 20`
      : `SELECT room_id, room_title FROM rooms LIMIT 20`;
    const rooms = await tableExists(env, "rooms")
      ? await env.DB.prepare(roomSql).all()
      : { results: [] };

    const hasSourceType = await columnExists(env, "messages", "source_type");
    const msgAggSql = hasSourceType
      ? `SELECT room_id, room_title, source_type, COUNT(*) AS count, MAX(created_at) AS last_at
         FROM messages
         GROUP BY room_id, room_title, source_type
         ORDER BY last_at DESC
         LIMIT 20`
      : `SELECT room_id, room_title, '' AS source_type, COUNT(*) AS count, MAX(created_at) AS last_at
         FROM messages
         GROUP BY room_id, room_title
         ORDER BY last_at DESC
         LIMIT 20`;
    const msgAgg = await tableExists(env, "messages")
      ? await env.DB.prepare(msgAggSql).all()
      : { results: [] };

    const positiveGroup = hasSourceType
      ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM messages WHERE CAST(room_id AS INTEGER) > 0 AND source_type = 'telegram_group'`).first()
      : { count: 0 };
    const negativePrivate = hasSourceType
      ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM messages WHERE CAST(room_id AS INTEGER) < 0 AND source_type = 'telegram_private'`).first()
      : { count: 0 };
    const multiTitle = await tableExists(env, "messages")
      ? await env.DB.prepare(`
          SELECT room_id, COUNT(DISTINCT room_title) AS title_count, GROUP_CONCAT(DISTINCT room_title) AS titles
          FROM messages
          GROUP BY room_id
          HAVING COUNT(DISTINCT room_title) >= 2
          LIMIT 20
        `).all()
      : { results: [] };
    const testRooms = await tableExists(env, "messages")
      ? await env.DB.prepare(`
          SELECT room_id, room_title, COUNT(*) AS count
          FROM messages
          WHERE room_id IN ('-5265055977', '-5156923133')
             OR room_title IN ('다시왔지롱', '장난치지마라')
          GROUP BY room_id, room_title
        `).all()
      : { results: [] };

    const roomLines = (rooms.results || []).map((r, idx) =>
      `${idx + 1}. ${r.room_title || "이름없음"} / ${r.room_id || ""}${hasRoomExtra ? ` / ${r.room_type || "?"} / ${(r.last_seen_at || "").slice(0, 16)}` : ""}`
    ).join("\n") || "없음";
    const msgLines = (msgAgg.results || []).map((r, idx) =>
      `${idx + 1}. ${r.room_id || ""} / ${r.room_title || ""} / ${r.source_type || ""} / ${r.count}`
    ).join("\n") || "없음";
    const multiLines = (multiTitle.results || []).map((r) =>
      `${r.room_id}: ${r.title_count}개 / ${r.titles || ""}`
    ).join("\n") || "없음";
    const testLines = (testRooms.results || []).map((r) =>
      `${r.room_id} / ${r.room_title} / ${r.count}`
    ).join("\n") || "없음";

    const output =
      `rooms count: ${roomsCount?.count || 0}\n\n` +
      `rooms 최근 20개\n${roomLines}\n\n` +
      `messages room 집계\n${msgLines}\n\n` +
      `양수 room_id + telegram_group: ${positiveGroup?.count || 0}\n` +
      `음수 room_id + telegram_private: ${negativePrivate?.count || 0}\n\n` +
      `room_title 2개 이상\n${multiLines}\n\n` +
      `테스트방 잔존\n${testLines}`;
    await sendMessage(env, chatId, output.slice(0, 3500));
  } catch (e) {
    await sendMessage(env, chatId, `debug rooms 실패함. 오류: ${String(e?.message || e).slice(0, 800)}`);
  }
}

function isAdminUser(env, from) {
  return String(from?.id || "") === String(env.ADMIN_TELEGRAM_ID || "");
}

async function handleSqlCommand(env, message, text, chatId) {
  return false;
}

async function handleDebugEnv(env, chatId) {
  let fallbackPrivateChatId = "";
  try {
    if (env.DB && await tableExists(env, "messages")) {
      const hasSourceType = await columnExists(env, "messages", "source_type");
      const row = hasSourceType
        ? await env.DB.prepare(`SELECT room_id FROM messages WHERE source_type = 'telegram_private' AND CAST(room_id AS INTEGER) > 0 ORDER BY created_at DESC LIMIT 1`).first()
        : await env.DB.prepare(`SELECT room_id FROM messages WHERE CAST(room_id AS INTEGER) > 0 ORDER BY created_at DESC LIMIT 1`).first();
      fallbackPrivateChatId = String(row?.room_id || "");
    }
  } catch (_) {}
  const flag = (key, def = false) => readBoolEnv(env, key, def) ? "ON" : "OFF";
  const { kstDate } = getKstDayRange();
  await sendMessage(
    env,
    chatId,
    `BUILD_VERSION: ${BUILD_VERSION}\n` +
    `DB binding: ${env.DB ? "있음" : "없음"}\n` +
    `DAILY_BRIEFING_CHAT_ID: ${env.DAILY_BRIEFING_CHAT_ID || "없음"}\n` +
    `ADMIN_CHAT_ID: ${env.ADMIN_CHAT_ID || "없음"}\n` +
    `ADMIN_TELEGRAM_ID: ${env.ADMIN_TELEGRAM_ID || "없음"}\n` +
    `fallback_private_chat_id: ${fallbackPrivateChatId || "없음"}\n` +
    `KST today: ${kstDate}\n` +
    `cron config: KST 08:00 = UTC 23:00\n\n` +
    `Feature flags:\n` +
    `  EXTERNAL_SEARCH_ENABLED: ${flag("EXTERNAL_SEARCH_ENABLED")}\n` +
    `  ENABLE_ADVANCED_PARSER: ${flag("ENABLE_ADVANCED_PARSER")}\n` +
    `  ENABLE_IMAGE_INGEST: ${flag("ENABLE_IMAGE_INGEST")}\n` +
    `  ENABLE_RAG_CHUNKING: ${flag("ENABLE_RAG_CHUNKING")}\n` +
    `  ENABLE_VECTOR_SEARCH: ${flag("ENABLE_VECTOR_SEARCH")}`
  );
}

async function handleDebugSave(env, message, chatId) {
  try {
    await dbInsert(env, {
      roomId: message.chat.id,
      roomTitle: getRoomTitleForMessage(message),
      senderId: message.from?.id || "",
      senderName: getSenderName(message.from),
      content: `[debug_save] ${BUILD_VERSION}`,
      savedBy: BOT_KEY,
      telegramMessageId: `debug_${Date.now()}`,
      sourceType: getSourceTypeForMessage(message),
    }, { throwOnError: true });
    await sendMessage(env, chatId, "debug save 성공");
  } catch (e) {
    await sendMessage(env, chatId, `debug save 실패\n${String(e?.stack || e?.message || e).slice(0, 1500)}`);
  }
}

function getHelpText() {
  return [
    "사용 가능 명령",
    "/db_status - D1 저장 상태 확인",
    "/rooms - 등록된 방 목록 확인",
    "/debug_rooms - 방 저장 상태 확인",
    "/files - 최근 저장 파일 확인",
    "/debug_file - 파일 저장 상태 확인",
    "/debug_save - messages 직접 저장 테스트",
    "/debug_env - Worker 버전 확인",
    "/users - 등록 사용자 목록 확인",
    "/search_status - 외부검색 설정 확인",
    "/web_test 검색어 - Tavily 검색 테스트",
    "/debug_briefing_tags - 브리핑 태그별 메시지 현황/중복 확인",
  ].join("\n");
}

async function routeSlashCommand(env, message, text, chatId) {
  const t = String(text || "").trim();
  if (!t.startsWith("/")) return false;
  if (/^\/등록\b/.test(t)) {
    await handleRegisterCommand(env, chatId, message.from);
    return true;
  }
  if (/^\/debug_env\b/.test(t)) {
    await handleDebugEnv(env, chatId);
    return true;
  }
  if (/^\/debug_save\b/.test(t)) {
    await handleDebugSave(env, message, chatId);
    return true;
  }
  if (isDbStatusCommand(t)) {
    await handleDbStatus(env, chatId);
    return true;
  }
  if (/^\/rooms\b/.test(t) || isRoomListQuery(t)) {
    await handleRoomList(env, chatId);
    return true;
  }
  if (/^\/debug_db\b/.test(t)) {
    try {
      const msgCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM messages`).first();
      const fileCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM files`).first();
      const userCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM users WHERE telegram_id NOT LIKE 'user%'`).first();
      const roomCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM rooms`).first();
      const recentMsg = await env.DB.prepare(`SELECT room_title, sender_name, created_at FROM messages ORDER BY created_at DESC LIMIT 1`).first();
      await sendMessage(env, chatId,
        `DB 현황\n\n` +
        `메시지: ${msgCount?.cnt || 0}건\n` +
        `파일: ${fileCount?.cnt || 0}건\n` +
        `사용자: ${userCount?.cnt || 0}명\n` +
        `방: ${roomCount?.cnt || 0}개\n\n` +
        `최근 메시지: ${recentMsg ? `[${recentMsg.room_title}] ${recentMsg.sender_name} (${(recentMsg.created_at||"").slice(0,16)})` : "없음"}`
      );
    } catch (e) {
      await sendMessage(env, chatId, `DB 조회 오류: ${e.message}`);
    }
    return true;
  }
  if (/^\/debug_briefing_tags\b/.test(t)) {
    try {
      const teamSince = new Date(Date.now() - 7 * 86400000)
        .toISOString().slice(0, 19).replace("T", " ");
      const tagCounts = {};
      for (const tag of ["#보고", "#Fup", "#공유", "#일정"]) {
        const row = await env.DB.prepare(`
          SELECT COUNT(*) as cnt FROM messages
          WHERE created_at >= ? AND content LIKE ?
        `).bind(teamSince, `%${tag}%`).first();
        tagCounts[tag] = row?.cnt || 0;
      }
      const infoRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM messages
        WHERE room_title LIKE '%💡정보방%'
      `).first();
      const dupRes = await env.DB.prepare(`
        SELECT content, room_title, COUNT(*) as cnt, MAX(created_at) as last_at
        FROM messages
        WHERE created_at >= ? AND content LIKE '%#보고%'
        GROUP BY content, room_title
        HAVING cnt > 1
        ORDER BY last_at DESC
        LIMIT 5
      `).bind(teamSince).all();
      const dupRows = dupRes.results || [];
      let out = `[브리핑 태그 현황 - 최근 7일]\n`;
      for (const tag of ["#보고", "#Fup", "#공유", "#일정"]) {
        out += `${tag}: ${tagCounts[tag]}건\n`;
      }
      out += `💡정보방 메시지(전체): ${infoRow?.cnt || 0}건\n\n`;
      if (dupRows.length) {
        out += `[#보고 중복 메시지]\n`;
        for (const r of dupRows) {
          out += `· (${r.cnt}회) [${r.room_title}] ${String(r.content).split("\n")[0].slice(0, 40)}\n`;
        }
      } else {
        out += `중복 메시지 없음`;
      }
      await sendMessage(env, chatId, out);
    } catch (e) {
      await sendMessage(env, chatId, `조회 오류: ${e.message}`);
    }
    return true;
  }
  if (/^\/debug_rooms\b/.test(t)) {
    await handleDebugRooms(env, chatId);
    return true;
  }
  if (/^\/files\b/.test(t)) {
    await handleFilesCommand(env, chatId);
    return true;
  }
  if (/^\/debug_files?\b/.test(t)) {
    await handleDebugFiles(env, chatId);
    return true;
  }
  if (/^\/debug_imports\b/.test(t)) {
    await handleDebugImports(env, chatId);
    return true;
  }
  if (/^\/debug_active_legacy\b/.test(t)) {
    await handleDebugActiveLegacy(env, chatId);
    return true;
  }
  if (/^\/debug_export_ingest\b/.test(t)) {
    await handleDebugExportIngest(env, chatId);
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
  if (/^\/(briefing_mock|briefing_test|morning_briefing_test)\b/.test(t)) {
    await sendDailyBriefing(env, { targetChatId: chatId, mock: true });
    await sendMessage(env, chatId, "브리핑 테스트 발송 완료");
    return true;
  }
  if (/^\/set_user_name\b/.test(t)) {
    await handleSetUserName(env, chatId, t);
    return true;
  }
  if (/^\/debug_users\b/.test(t)) {
    await handleDebugUsers(env, chatId);
    return true;
  }
  if (/^\/debug_aliases\b/.test(t)) {
    await handleDebugAliases(env, chatId);
    return true;
  }
  if (/^\/debug_people\b/.test(t)) {
    await handleDebugPeople(env, chatId);
    return true;
  }
  if (/^\/room_people\b/.test(t)) {
    await handleRoomPeople(env, message, chatId);
    return true;
  }
  if (/^\/register_person\b/.test(t)) {
    await handleRegisterPerson(env, message, chatId, t);
    return true;
  }
  if (/^\/link_person\b/.test(t)) {
    await handleLinkPerson(env, message, chatId, t);
    return true;
  }
  if (/^\/debug_search\b/.test(t)) {
    await handleDebugSearch(env, chatId, t);
    return true;
  }
  if (/^\/briefing_who\b/.test(t)) {
    const adminId = env.ADMIN_TELEGRAM_ID || "(미설정)";
    const dyleeId = env.DYLEE_CHAT_ID || "(미설정)";
    await sendMessage(env, chatId,
      `[브리핑 발송 대상]\n\n` +
      `개인 DM:\n` +
      `· 권오혁 (ID: ${adminId})\n` +
      `· 이동연 (ID: ${dyleeId})\n\n` +
      `단체방:\n` +
      `· AI 컴기획팀과 권 (-5287392652)\n` +
      `· 테스트방임 (-5156923133)\n\n` +
      `발송 시각: 매일 08:00 KST (UTC 23:00)`
    );
    return true;
  }
  if (/^\/debug_briefing\b/.test(t)) {
    await handleDebugBriefing(env, chatId);
    return true;
  }
  if (/^\/debug_plan\b/.test(t)) {
    const query = t.replace(/^\/debug_plan\s*/i, "").trim();
    if (!query) {
      await sendMessage(env, chatId, "사용법: /debug_plan <분석할 문장>");
      return true;
    }
    const plan = buildAnswerPlan(query);
    await sendMessage(env, chatId,
      `[debug_plan]\n` +
      `입력: ${query}\n\n` +
      `intent: ${plan.intent}\n` +
      `user_goal: ${plan.user_goal}\n` +
      `retrieval_needed: ${plan.retrieval_needed}\n` +
      `answer_mode: ${plan.answer_mode}\n` +
      `search_terms: [${plan.search_terms.join(", ") || "없음"}]\n` +
      `room_scope: ${plan.room_scope}\n` +
      `cross_room_allowed: ${plan.cross_room_allowed}\n` +
      `six_r_classification: [${plan.six_r_classification.join(", ") || "없음"}]\n` +
      `confidence: ${plan.confidence}\n` +
      `reason: ${plan.reason}`
    );
    return true;
  }
  if (/^\/debug_intent\b/.test(t)) {
    await handleDebugIntent(env, chatId, t);
    return true;
  }
  if (/^\/debug_today\b/.test(t)) {
    await handleDebugToday(env, chatId);
    return true;
  }
  if (/^\/debug_file_ids\b/.test(t)) {
    await handleDebugFileIds(env, chatId);
    return true;
  }
  if (/^\/debug_room_ingest\b/.test(t)) {
    await handleDebugRoomIngest(env, chatId, message);
    return true;
  }
  if (/^\/debug_export_ingest\b/.test(t)) {
    await handleDebugExportIngest(env, chatId);
    return true;
  }
  if (/^\/debug_active_legacy\b/.test(t)) {
    await handleDebugActiveLegacy(env, chatId);
    return true;
  }
  if (/^\/admin_migrate\b/.test(t)) {
    await handleAdminMigrateSchema(env, chatId, message.from?.id);
    return true;
  }
  if (/^\/help\b/.test(t)) {
    await sendMessage(env, chatId, getHelpText());
    return true;
  }
  return false;
}

async function handleAdminMigrateSchema(env, chatId, userId) {
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  const isAdmin = await checkIsAdmin(String(userId || ""), env);
  if (!isAdmin) { await sendMessage(env, chatId, "관리자만 실행 가능합니다."); return; }

  const EXPORT_SCHEMA = {
    files: [
      ["source_type",         "TEXT DEFAULT ''"],
      ["source_status",       "TEXT DEFAULT 'legacy'"],
      ["original_room",       "TEXT DEFAULT ''"],
      ["export_message_id",   "TEXT DEFAULT ''"],
      ["source_path",         "TEXT DEFAULT ''"],
      ["media_group_key",     "TEXT DEFAULT ''"],
      ["from_name",           "TEXT DEFAULT ''"],
      ["from_id",             "TEXT DEFAULT ''"],
      ["telegram_message_id", "TEXT DEFAULT ''"],
    ],
    messages: [
      ["source_type",          "TEXT DEFAULT ''"],
      ["source_status",        "TEXT DEFAULT 'legacy'"],
      ["original_room",        "TEXT DEFAULT ''"],
      ["export_message_id",    "TEXT DEFAULT ''"],
      ["from_name",            "TEXT DEFAULT ''"],
      ["from_id",              "TEXT DEFAULT ''"],
      ["reply_to_message_id",  "TEXT DEFAULT ''"],
      ["source_path",          "TEXT DEFAULT ''"],
      ["media_group_key",      "TEXT DEFAULT ''"],
      ["telegram_message_id",  "TEXT DEFAULT ''"],
    ],
  };

  const lines = ["[Schema Migration]", ""];
  let added = 0, skipped = 0, failed = 0;

  for (const [table, cols] of Object.entries(EXPORT_SCHEMA)) {
    let existing = new Set();
    try {
      const rows = (await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results || [];
      existing = new Set(rows.map(r => r.name));
    } catch (e) {
      lines.push(`❌ PRAGMA ${table}: ${String(e.message || e).slice(0, 100)}`);
      failed++;
      continue;
    }

    for (const [col, def] of cols) {
      if (existing.has(col)) {
        lines.push(`⏩ ${table}.${col}`);
        skipped++;
        continue;
      }
      try {
        await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
        lines.push(`✅ ${table}.${col} 추가`);
        added++;
      } catch (e) {
        const msg = String(e.message || e);
        if (/duplicate column|already exists/i.test(msg)) {
          lines.push(`⏩ ${table}.${col} (이미 존재)`);
          skipped++;
        } else {
          lines.push(`❌ ${table}.${col}: ${msg.slice(0, 80)}`);
          failed++;
        }
      }
    }
  }

  lines.push("", `추가: ${added}개 / skip: ${skipped}개 / 실패: ${failed}개`);
  if (!failed) lines.push("✅ 완료 — 이제 ingest_export.js 로 데이터를 적재하세요.");
  await sendMessage(env, chatId, lines.join("\n"));
}

async function handleDebugToday(env, chatId) {
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  try {
    const { kstDate, startIso, endIso } = getKstDayRange();
    const msgCount = (await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM messages WHERE created_at >= ? AND created_at <= ?`
    ).bind(startIso, endIso).first())?.c || 0;
    const fileCount = (await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM files WHERE created_at >= ? AND created_at <= ?`
    ).bind(startIso, endIso).first())?.c || 0;
    const fileWithId = (await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM files WHERE created_at >= ? AND created_at <= ? AND COALESCE(telegram_file_id,'') != ''`
    ).bind(startIso, endIso).first())?.c || 0;
    const photoCount = (await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM files WHERE created_at >= ? AND created_at <= ? AND file_type = 'photo'`
    ).bind(startIso, endIso).first())?.c || 0;
    const roomCount = (await env.DB.prepare(
      `SELECT COUNT(DISTINCT room_id) AS c FROM messages WHERE created_at >= ? AND created_at <= ?`
    ).bind(startIso, endIso).first())?.c || 0;
    const latestMsg = await env.DB.prepare(
      `SELECT sender_name, SUBSTR(content,1,60) AS content, created_at FROM messages ORDER BY created_at DESC LIMIT 1`
    ).first();
    const latestFile = await env.DB.prepare(
      `SELECT file_name, file_type, telegram_file_id, created_at FROM files ORDER BY created_at DESC LIMIT 1`
    ).first();
    const msgCols = await tableColumns(env, "messages");
    const fileCols = await tableColumns(env, "files");
    const exportLines = [];
    if (msgCols.has("source_type") && msgCols.has("source_status") && msgCols.has("original_room")) {
      const exportMsgCount = (await env.DB.prepare(
        `SELECT COUNT(*) AS c
         FROM messages
         WHERE source_type = 'telegram_export'
           AND source_status = 'active'
           AND (room_title LIKE '%6R%' OR original_room LIKE '%6R%')`
      ).first())?.c || 0;
      const latestExportMsg = await env.DB.prepare(
        `SELECT sender_name, sender_id, SUBSTR(content,1,60) AS content, created_at
         FROM messages
         WHERE source_type = 'telegram_export'
           AND source_status = 'active'
           AND (room_title LIKE '%6R%' OR original_room LIKE '%6R%')
         ORDER BY created_at DESC
         LIMIT 1`
      ).first();
      exportLines.push(`- export messages active(6R): ${exportMsgCount}`);
      if (latestExportMsg) {
        exportLines.push(`- latest export message: ${canonicalizeTeamMemberName(latestExportMsg.sender_name, latestExportMsg.sender_id)} / ${latestExportMsg.content || ""} / ${String(latestExportMsg.created_at || "").slice(0, 16)}`);
      }
    }
    if (fileCols.has("source_type") && fileCols.has("source_status") && fileCols.has("original_room")) {
      const exportFileCount = (await env.DB.prepare(
        `SELECT COUNT(*) AS c
         FROM files
         WHERE source_type = 'telegram_export'
           AND source_status = 'active'
           AND (room_title LIKE '%6R%' OR original_room LIKE '%6R%')`
      ).first())?.c || 0;
      const latestExportFile = await env.DB.prepare(
        `SELECT file_name, file_type, uploader_name, uploader_id, created_at
         FROM files
         WHERE source_type = 'telegram_export'
           AND source_status = 'active'
           AND (room_title LIKE '%6R%' OR original_room LIKE '%6R%')
         ORDER BY created_at DESC
         LIMIT 1`
      ).first();
      exportLines.push(`- export files active(6R): ${exportFileCount}`);
      if (latestExportFile) {
        exportLines.push(`- latest export file: ${latestExportFile.file_name || ""} / ${canonicalizeTeamMemberName(latestExportFile.uploader_name, latestExportFile.uploader_id)} / ${String(latestExportFile.created_at || "").slice(0, 16)}`);
      }
    }
    const exportDebug = exportLines.length ? `\n\n[6R export active]\n${exportLines.join("\n")}` : "";
    await sendMessage(env, chatId,
      `오늘 적재 현황 (${kstDate} KST)\n` +
      `UTC 기준: ${startIso} ~ ${endIso}\n\n` +
      `- messages: ${msgCount}건 (방 ${roomCount}개)\n` +
      `- files: ${fileCount}건 (사진 ${photoCount}건)\n` +
      `- files with telegram_file_id: ${fileWithId}건\n` +
      `- files missing telegram_file_id: ${fileCount - fileWithId}건\n\n` +
      `- latest message: ${latestMsg ? `${latestMsg.sender_name} / ${latestMsg.content} / ${String(latestMsg.created_at || "").slice(0, 16)}` : "없음"}\n` +
      `- latest file: ${latestFile ? `${latestFile.file_name} (${latestFile.file_type}) file_id=${latestFile.telegram_file_id ? "있음" : "없음"} / ${String(latestFile.created_at || "").slice(0, 16)}` : "없음"}`
    );
    if (exportDebug) await sendMessage(env, chatId, exportDebug);
  } catch (e) {
    await sendMessage(env, chatId, `debug_today 오류: ${String(e?.message || e).slice(0, 200)}`);
  }
}

async function handleDebugFileIds(env, chatId) {
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  try {
    const rows = (await env.DB.prepare(
      `SELECT id, file_name, file_type, telegram_file_id, telegram_file_unique_id, r2_key, room_title, uploader_name, created_at
       FROM files ORDER BY created_at DESC LIMIT 10`
    ).all()).results || [];
    if (!rows.length) { await sendMessage(env, chatId, "최근 파일 없음"); return; }
    const lines = rows.map(f =>
      `id=${f.id} ${f.file_name || "(없음)"} | ${f.file_type || "-"}\n` +
      `  file_id: ${f.telegram_file_id ? "있음" : "없음"} | uniq: ${f.telegram_file_unique_id ? "있음" : "없음"} | r2: ${f.r2_key ? "있음" : "없음"}\n` +
      `  방: ${f.room_title || "-"} / ${f.uploader_name || "-"} / ${String(f.created_at || "").slice(0, 10)}`
    );
    await sendMessage(env, chatId, `최근 파일 ${rows.length}건\n\n${lines.join("\n\n")}`);
  } catch (e) {
    await sendMessage(env, chatId, `debug_file_ids 오류: ${String(e?.message || e).slice(0, 200)}`);
  }
}

async function handleDebugRoomIngest(env, chatId, message) {
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  try {
    const { kstDate, startIso } = getKstDayRange();
    const fileRows = (await env.DB.prepare(
      `SELECT room_id, room_title, COUNT(*) AS cnt, MAX(created_at) AS last_at
       FROM files WHERE created_at >= ?
       GROUP BY room_id, room_title ORDER BY cnt DESC LIMIT 10`
    ).bind(startIso).all()).results || [];
    const msgRows = (await env.DB.prepare(
      `SELECT room_id, room_title, COUNT(*) AS cnt
       FROM messages WHERE created_at >= ?
       GROUP BY room_id, room_title ORDER BY cnt DESC LIMIT 10`
    ).bind(startIso).all()).results || [];

    const fileLines = fileRows.length
      ? fileRows.map(r => `· ${r.room_title || r.room_id}: 파일 ${r.cnt}건 (최근 ${String(r.last_at || "").slice(0, 16)})`)
      : ["· 오늘 파일 적재 없음"];
    const msgLines = msgRows.length
      ? msgRows.map(r => `· ${r.room_title || r.room_id}: 메시지 ${r.cnt}건`)
      : ["· 오늘 메시지 없음"];

    const currentRoom = message?.chat
      ? `현재방: ${message.chat.title || message.chat.id} (id: ${message.chat.id})`
      : "";

    await sendMessage(env, chatId,
      `[오늘 방별 적재 현황 — ${kstDate} KST]\n\n` +
      `[파일]\n${fileLines.join("\n")}\n\n` +
      `[메시지]\n${msgLines.join("\n")}\n\n` +
      (currentRoom ? `${currentRoom}\n\n` : "") +
      `⚠️ Privacy Mode ON이면 @멘션 없는 그룹 메시지는 수신 안 됨`
    );
  } catch (e) {
    await sendMessage(env, chatId, `debug_room_ingest 오류: ${String(e?.message || e).slice(0, 300)}`);
  }
}

async function legacyHandleDebugExportIngest(env, chatId) {
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  try {
    const requiredFileCols = ["source_type", "source_status", "original_room", "source_path", "media_group_key", "from_name", "from_id"];
    const requiredMsgCols  = ["source_type", "source_status", "original_room", "from_name", "from_id", "reply_to_message_id", "telegram_message_id"];

    const missingFile = [];
    const missingMsg  = [];
    for (const c of requiredFileCols) { if (!(await columnExists(env, "files", c))) missingFile.push(c); }
    for (const c of requiredMsgCols)  { if (!(await columnExists(env, "messages", c))) missingMsg.push(c); }

    if (missingFile.length || missingMsg.length) {
      const lines = ["[스키마 미반영 — ingest_export.js 실행 필요]", ""];
      if (missingFile.length) lines.push(`files 누락: ${missingFile.join(", ")}`);
      if (missingMsg.length)  lines.push(`messages 누락: ${missingMsg.join(", ")}`);
      lines.push("", "실행: node scripts/ingest_export.js \"<export-root>\"");
      await sendMessage(env, chatId, lines.join("\n"));
      return;
    }

    const fileRows = (await env.DB.prepare(
      `SELECT original_room, source_status, COUNT(*) AS cnt, MAX(created_at) AS last_at
       FROM files
       WHERE source_type = 'telegram_export'
       GROUP BY original_room, source_status
       ORDER BY original_room, source_status`
    ).all()).results || [];

    const msgRows = (await env.DB.prepare(
      `SELECT original_room, source_status, COUNT(*) AS cnt
       FROM messages
       WHERE source_type = 'telegram_export'
       GROUP BY original_room, source_status
       ORDER BY original_room`
    ).all()).results || [];

    const photoRow = (await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM files
       WHERE source_type = 'telegram_export' AND source_status = 'active'
         AND (file_type = 'photo' OR mime_type LIKE 'image/%')`
    ).first()) || {};

    if (!fileRows.length && !msgRows.length) {
      await sendMessage(env, chatId, "telegram_export 데이터 없음. 적재 필요:\nnode scripts/ingest_export.js \"<export-root>\"");
      return;
    }

    const fileLines = fileRows.map(r =>
      `· ${r.original_room || "(방 없음)"} [${r.source_status || "legacy"}]: 파일 ${r.cnt}건 (최근 ${String(r.last_at || "").slice(0, 10)})`
    );
    const msgLines = msgRows.map(r =>
      `· ${r.original_room || "(방 없음)"} [${r.source_status || "legacy"}]: 메시지 ${r.cnt}건`
    );

    await sendMessage(env, chatId,
      `[Export 적재 현황]\n\n` +
      `[파일]\n${fileLines.join("\n") || "없음"}\n` +
      `(active 사진: ${photoRow.cnt || 0}건)\n\n` +
      `[메시지]\n${msgLines.join("\n") || "없음"}`
    );
  } catch (e) {
    await sendMessage(env, chatId, `debug_export_ingest 오류: ${String(e?.message || e).slice(0, 300)}`);
  }
}

async function legacyHandleDebugActiveLegacy(env, chatId) {
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  try {
    const checkCols = ["source_type", "source_status", "original_room"];
    const missingFile = [];
    const missingMsg  = [];
    for (const c of checkCols) {
      if (!(await columnExists(env, "files", c)))    missingFile.push(c);
      if (!(await columnExists(env, "messages", c))) missingMsg.push(c);
    }

    if (missingFile.length || missingMsg.length) {
      const lines = ["[스키마 미반영]", ""];
      if (missingFile.length) lines.push(`files 누락 컬럼: ${missingFile.join(", ")}`);
      if (missingMsg.length)  lines.push(`messages 누락 컬럼: ${missingMsg.join(", ")}`);
      lines.push("", "✅ 해결: node scripts/ingest_export.js \"<export-root>\"",
        "   → ALTER TABLE 자동 실행 후 데이터 적재");
      await sendMessage(env, chatId, lines.join("\n"));
      return;
    }

    const fileActive  = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM files WHERE source_status = 'active'`).first())?.c || 0;
    const fileLegacy  = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM files WHERE COALESCE(source_status,'legacy') != 'active'`).first())?.c || 0;
    const photoActive = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM files WHERE source_status = 'active' AND (file_type = 'photo' OR mime_type LIKE 'image/%')`).first())?.c || 0;
    const msgActive   = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM messages WHERE source_status = 'active'`).first())?.c || 0;
    const msgLegacy   = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM messages WHERE COALESCE(source_status,'legacy') != 'active'`).first())?.c || 0;

    await sendMessage(env, chatId,
      `[source_status 현황]\n\n` +
      `[파일] 전체 ${fileActive + fileLegacy}건\n` +
      `· active:  ${fileActive}건 (사진 ${photoActive}건)\n` +
      `· legacy:  ${fileLegacy}건\n\n` +
      `[메시지] 전체 ${msgActive + msgLegacy}건\n` +
      `· active:  ${msgActive}건\n` +
      `· legacy:  ${msgLegacy}건`
    );
  } catch (e) {
    await sendMessage(env, chatId, `debug_active_legacy 오류: ${String(e?.message || e).slice(0, 300)}`);
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

async function dbSaveFile(env, data, options = {}) {
  if (!env.DB) return false;
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
      file_size: Number(data.file_size || data.fileSize || 0) || 0,
      source_type: data.source_type || data.sourceType || "",
      source_status: "active",
      extracted_text: String(data.extracted_text || "").slice(0, 50000),
      summary: String(data.summary || "").slice(0, 3000),
      tags_json: JSON.stringify(data.tags || []),
      saved_by: data.saved_by || data.savedBy || BOT_KEY,
    };
    const columns = Object.keys(values).filter((name) => existing.has(name));
    if (!columns.length) throw new Error("files table has no writable columns");
    const uniqueId = values.telegram_file_unique_id;
    if (uniqueId && existing.has("telegram_file_unique_id")) {
      const prev = await env.DB.prepare(`
        SELECT id FROM files
        WHERE telegram_file_unique_id = ?
          AND COALESCE(room_id, '') = ?
          AND COALESCE(uploader_id, sender_id, '') = ?
        ORDER BY id DESC
        LIMIT 1
      `)
        .bind(uniqueId, values.room_id, values.uploader_id || values.sender_id)
        .first();
      if (prev?.id) {
        const updateColumns = columns.filter((name) => name !== "telegram_file_unique_id" && name !== "telegram_file_id");
        if (updateColumns.length) {
          await env.DB.prepare(`UPDATE files SET ${updateColumns.map((name) => `${name} = ?`).join(", ")} WHERE id = ?`)
            .bind(...updateColumns.map((name) => values[name]), prev.id)
            .run();
        }
        return true;
      }
    }
    const placeholders = columns.map(() => "?").join(", ");
    await env.DB.prepare(`INSERT INTO files (${columns.join(", ")}) VALUES (${placeholders})`)
      .bind(...columns.map((name) => values[name]))
      .run();
    return true;
  } catch (e) {
    console.error("dbSaveFile failed:", e);
    if (options.throwOnError) throw e;
    return false;
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
    if (!isExternalSearchEnabled(env) || !hasTavilyConfig(env)) return "(외부검색 미설정)";
    const results = await searchTavily(env, `${keyword || "AI 산업"} 뉴스`, { maxResults: 5, searchDepth: "basic" });
    await saveExternalSearchResults(env, keyword || "AI 산업", results);
    return results.length ? buildExternalCorpus(results) : "(뉴스 없음)";
  } catch (e) {
    return "(뉴스 조회 실패)";
  }
}

function normalizeRoomTitle(row, titleKey = "room_title", joinedKey = "joined_room_title") {
  const roomId = Number(row?.room_id);
  const joined = String(row?.[joinedKey] || "").trim();
  const own = String(row?.[titleKey] || "").trim();
  if (Number.isFinite(roomId) && roomId > 0) {
    const name = String(row?.actor || row?._resolvedName || row?.uploader_name || row?.sender_name || "").trim();
    return name ? `1:1(${name})` : "1:1";
  }
  if (Number.isFinite(roomId) && roomId < 0) {
    return joined || (own && own !== "1:1" ? own : "unknown_group");
  }
  return joined || own || "미상";
}

function hasGeneratedSummary(summary) {
  const s = String(summary || "").trim();
  return !!s && !/요약 미생성/.test(s);
}

function fileDedupeKey(row) {
  const unique = String(row.telegram_file_unique_id || "").trim();
  if (unique) return `${unique}|${row.room_id || ""}|${row.uploader_id || row.sender_id || ""}`;
  return `${row.file_name || ""}|${row.room_id || ""}|${row.uploader_id || row.sender_id || ""}`;
}

function preferFileRow(next, prev) {
  if (!prev) return next;
  const nextHasSummary = hasGeneratedSummary(next.summary);
  const prevHasSummary = hasGeneratedSummary(prev.summary);
  if (nextHasSummary && !prevHasSummary) return next;
  if (!nextHasSummary && prevHasSummary) return prev;
  return String(next.created_at || "").localeCompare(String(prev.created_at || "")) >= 0 ? next : prev;
}

async function handleFilesCommandOld_DISABLED(env, chatId) {
  if (!env.DB || !(await tableExists(env, "files"))) {
    await sendMessage(env, chatId, "최근 저장 파일 0건임.");
    return;
  }
  try {
    const orderColumn = await columnExists(env, "files", "created_at") ? "created_at" : "id";
    const hasRooms = await tableExists(env, "rooms");
    const result = hasRooms
      ? await env.DB.prepare(`
        SELECT f.*, r.room_title AS joined_room_title
        FROM files f
        LEFT JOIN rooms r ON r.room_id = f.room_id
        ORDER BY f.${orderColumn} DESC
        LIMIT 50
      `).all()
      : await env.DB.prepare(`SELECT * FROM files ORDER BY ${orderColumn} DESC LIMIT 50`).all();
    const rawRows = result.results || [];
    const byKey = new Map();
    for (const row of rawRows) {
      const key = fileDedupeKey(row);
      byKey.set(key, preferFileRow(row, byKey.get(key)));
    }
    const rows = [...byKey.values()]
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 10);
    if (!rows.length) {
      await sendMessage(env, chatId, "최근 저장 파일 0건임.");
      return;
    }
    const lines = rows.map((f, idx) => {
      const fileName = f.file_name || "파일명 없음";
      f.room_title = normalizeRoomTitle(f);
      const roomTitle = f.room_title || "미상";
      const summary = hasGeneratedSummary(f.summary)
        ? String(f.summary || "").replace(/\s+/g, " ").slice(0, 140)
        : "미생성임.";
      return `${idx + 1}. ${fileName}\n` +
        `* 일자: ${formatShortDate(f.created_at)}\n` +
        `* 공유자: ${f.uploader_name || f.sender_name || "미상"}\n` +
        `* 방: ${roomTitle}\n` +
        `* 위치: [${roomTitle}] / ${fileName}\n` +
        `* 요약: ${summary}`;
    });
    await sendMessage(env, chatId, `최근 저장 자료 ${rows.length}건임.\n\n${lines.join("\n\n")}`);
  } catch (e) {
    console.error("handleFilesCommand:", e);
    await sendMessage(env, chatId, `파일 목록 조회 실패함.\n${String(e?.message || e).slice(0, 500)}`);
  }
}

async function handleFilesCommand(env, chatId) {
  if (!env.DB || !(await tableExists(env, "files"))) {
    await sendMessage(env, chatId, "최근 저장 자료 0건임.");
    return;
  }
  try {
    const orderColumn = await columnExists(env, "files", "created_at") ? "created_at" : "id";
    const hasRooms = await tableExists(env, "rooms");
    const result = hasRooms
      ? await env.DB.prepare(`
        SELECT f.*, r.room_title AS joined_room_title
        FROM files f
        LEFT JOIN rooms r ON r.room_id = f.room_id
        ORDER BY f.${orderColumn} DESC
        LIMIT 50
      `).all()
      : await env.DB.prepare(`SELECT * FROM files ORDER BY ${orderColumn} DESC LIMIT 50`).all();
    const byKey = new Map();
    for (const row of result.results || []) {
      const key = fileDedupeKey(row);
      byKey.set(key, preferFileRow(row, byKey.get(key)));
    }
    const rows = [...byKey.values()]
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 10);
    if (!rows.length) {
      await sendMessage(env, chatId, "최근 저장 자료 0건임.");
      return;
    }
    const lines = rows.map((f) => {
      f.room_title = normalizeRoomTitle(f);
      const cleanedSummary = cleanSourceTextForSummary(f.summary || f.extracted_text || f.content || "");
      const summaryText = cleanedSummary.length >= 20
        ? cleanOneLine(cleanedSummary).slice(0, 160)
        : summarizeByRule(cleanedSummary || f.file_name || "");
      return formatIssueCard({
        issue_title: f.file_name ? cleanTitle(f.file_name) : "파일명 없음",
        agenda_category: typeof classifyAgenda === "function" ? classifyAgenda(cleanedSummary || f.file_name || "") : "",
        summary: summaryText || "본문에서 확인 가능한 업무 내용이 제한적임.",
        six_r: [inferSixRByRule(cleanedSummary || f.file_name || "")].filter(Boolean),
        action_items: [],
        source_room: f.room_title || f.joined_room_title || "알 수 없는 방",
        source_file: f.file_name || "",
        actor: f.uploader_name || f.sender_name || "공유자 미상",
        date: formatShortDate(f.created_at),
      });
    });
    await kohSendHtml(env, chatId, lines.join("\n\n"));
  } catch (e) {
    console.error("handleFilesCommand:", e);
    await sendMessage(env, chatId, `파일 목록 조회 실패함.\n${String(e?.message || e).slice(0, 300)}`);
  }
}

async function handleSetUserName(env, chatId, text) {
  const match = String(text || "").match(/^\/set_user_name\s+(\S+)\s+(.+)$/);
  if (!match) {
    await sendMessage(env, chatId, "사용법: /set_user_name <user_id> <이름>\n예: /set_user_name 5965410906 동연 이");
    return;
  }
  const userId = match[1].trim();
  const name = match[2].trim();
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  const { hasCanonical } = await getUserNameColumnInfo(env);
  if (!hasCanonical) {
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN canonical_name TEXT DEFAULT ''`).run();
    } catch (_) {}
  }
  try {
    const prev = await env.DB.prepare(`SELECT name, canonical_name FROM users WHERE telegram_id = ? LIMIT 1`).bind(userId).first().catch(() => null);
    await env.DB.prepare(`
      INSERT INTO users (telegram_id, canonical_name, name, last_seen_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_id) DO UPDATE SET
        canonical_name = excluded.canonical_name,
        name = COALESCE(NULLIF(name, ''), excluded.name),
        last_seen_at = CURRENT_TIMESTAMP
    `).bind(userId, name, name).run();
    await saveUserAlias(env, userId, prev?.name || name, { source: "set_user_name", sourceTable: "users", sourceId: userId });
    await saveUserAlias(env, userId, prev?.canonical_name || name, { source: "set_user_name", sourceTable: "users", sourceId: userId });
    await sendMessage(env, chatId, `사용자명 정규화 완료: ${userId} → ${name}`);
  } catch (e) {
    await sendMessage(env, chatId, `set_user_name 실패: ${String(e?.message || e).slice(0, 300)}`);
  }
}

async function handleDebugUsers(env, chatId) {
  if (!env.DB || !(await tableExists(env, "users"))) {
    await sendMessage(env, chatId, "users 테이블 없음.");
    return;
  }
  try {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users`).first();
    const { hasCanonical } = await getUserNameColumnInfo(env);
    const cols = `telegram_id, name, ${hasCanonical ? "canonical_name," : ""} username, last_seen_at`;
    const recent = await env.DB.prepare(`SELECT ${cols} FROM users ORDER BY last_seen_at DESC LIMIT 10`).all();
    const lines = (await Promise.all((recent.results || []).map(async u =>
      `id: ${u.telegram_id}\n  name: ${u.name || ""}\n  canonical: ${u.canonical_name || "없음"}\n  username: @${u.username || ""}\n  seen: ${String(u.last_seen_at || "").slice(0, 10)}\n  aliases: ${await aliasesForUser(env, u.telegram_id) || "없음"}`
    ))).join("\n\n");
    await sendMessage(env, chatId, `users count: ${count?.count || 0}\n\n${lines || "없음"}`);
  } catch (e) {
    await sendMessage(env, chatId, `debug_users 실패: ${String(e?.message || e).slice(0, 300)}`);
  }
}

async function aliasesForUser(env, telegramId) {
  if (!env.DB || !telegramId || !(await tableExists(env, "user_aliases"))) return "";
  const rows = await env.DB.prepare(`
    SELECT alias_name FROM user_aliases
    WHERE telegram_id = ?
    ORDER BY count DESC, last_seen_at DESC
    LIMIT 8
  `).bind(String(telegramId)).all();
  return (rows.results || []).map(r => r.alias_name).filter(Boolean).join(", ");
}

async function handleDebugAliases(env, chatId) {
  if (!env.DB || !(await tableExists(env, "user_aliases"))) {
    await sendMessage(env, chatId, "user_aliases 테이블 없음.");
    return;
  }
  try {
    const rows = await env.DB.prepare(`
      SELECT a.telegram_id, COALESCE(NULLIF(u.canonical_name,''), NULLIF(u.name,''), '') AS canonical_name,
             a.alias_name, a.source, a.source_room_title, a.count, a.last_seen_at
      FROM user_aliases a
      LEFT JOIN users u ON CAST(u.telegram_id AS TEXT) = CAST(a.telegram_id AS TEXT)
      ORDER BY a.last_seen_at DESC
      LIMIT 50
    `).all();
    const lines = (rows.results || []).map(a =>
      `${a.telegram_id} / canonical=${a.canonical_name || "없음"}\n  alias=${a.alias_name} / source=${a.source || ""} / room=${a.source_room_title || ""} / count=${a.count || 0} / seen=${String(a.last_seen_at || "").slice(0, 10)}`
    ).join("\n\n");
    await sendMessage(env, chatId, `최근 aliases ${(rows.results || []).length}개\n\n${lines || "없음"}`);
  } catch (e) {
    await sendMessage(env, chatId, `debug_aliases 실패: ${String(e?.message || e).slice(0, 300)}`);
  }
}

async function handleDebugPeople(env, chatId) {
  if (!env.DB || !(await tableExists(env, "room_people"))) {
    await sendMessage(env, chatId, "room_people 테이블 없음.");
    return;
  }
  try {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM room_people`).first();
    const rows = await env.DB.prepare(`
      SELECT room_title, telegram_id, person_name, canonical_name, team, role, source, confidence, owner_name, last_seen_at
      FROM room_people
      ORDER BY last_seen_at DESC
      LIMIT 30
    `).all();
    const lines = (rows.results || []).map(p =>
      `${p.room_title || "알 수 없는 방"}\n  id=${p.telegram_id || "없음"} / ${p.canonical_name || p.person_name} / raw=${p.person_name}\n  team=${p.team || ""} / role=${p.role || ""} / ${p.source || ""}/${p.confidence || ""} / owner=${p.owner_name || ""} / seen=${String(p.last_seen_at || "").slice(0, 10)}`
    ).join("\n\n");
    await sendMessage(env, chatId, `room_people count: ${count?.count || 0}\n\n${lines || "없음"}`);
  } catch (e) {
    await sendMessage(env, chatId, `debug_people 실패: ${String(e?.message || e).slice(0, 300)}`);
  }
}

async function handleRoomPeople(env, message, chatId) {
  if (!env.DB || !(await tableExists(env, "room_people"))) {
    await sendMessage(env, chatId, "현재 저장된 인물 기록이 없습니다.");
    return;
  }
  try {
    const rows = await env.DB.prepare(`
      SELECT telegram_id, person_name, canonical_name, team, role, source, confidence, last_seen_at
      FROM room_people
      WHERE CAST(room_id AS TEXT) = ?
      ORDER BY confidence ASC, last_seen_at DESC
      LIMIT 50
    `).bind(String(message.chat.id)).all();
    const lines = await Promise.all((rows.results || []).map(async p => {
      const name = p.telegram_id ? await resolveUserName(env, p.telegram_id, p.canonical_name || p.person_name) : (p.canonical_name || p.person_name);
      const status = p.confidence === "confirmed" ? "확정" : "추정";
      const teamRole = [p.team, p.role].filter(Boolean).join(" / ");
      return `- ${name}${teamRole ? ` / ${teamRole}` : ""} / ${status}`;
    }));
    await sendMessage(env, chatId,
      `현재 저장 기록 기준으로 확인된 인물입니다.\n\n${lines.join("\n") || "저장된 인물 기록이 없습니다."}\n\nTelegram 전체 멤버 목록을 직접 조회한 것은 아니며, 저장 자료/export/수동 등록 기준입니다.`
    );
  } catch (e) {
    await sendMessage(env, chatId, `room_people 실패: ${String(e?.message || e).slice(0, 300)}`);
  }
}

async function handleRegisterPerson(env, message, chatId, text) {
  const raw = String(text || "").replace(/^\/register_person\s*/i, "").trim();
  const match = raw.match(/^(.+?)\s*\/\s*(.+)$/);
  if (!match) {
    await sendMessage(env, chatId, "사용법: /register_person <이름> / <소속 또는 역할>");
    return;
  }
  const personName = compactPersonName(match[1]);
  const teamRole = compactPersonName(match[2]);
  const ownerName = await resolveUserName(env, message.from?.id, getSenderName(message.from));
  await upsertRoomPerson(env, {
    roomId: String(message.chat.id),
    roomTitle: getRoomTitleForMessage(message),
    personName,
    canonicalName: personName,
    team: teamRole,
    source: "manual_register",
    confidence: "inferred",
    ownerUserId: String(message.from?.id || ""),
    ownerName,
  });
  await sendMessage(env, chatId, `인물 등록 완료: ${personName} / ${teamRole}`);
}

async function handleLinkPerson(env, message, chatId, text) {
  const raw = String(text || "").replace(/^\/link_person\s*/i, "").trim();
  const match = raw.match(/^(.+?)\s+(\S+)$/);
  if (!match) {
    await sendMessage(env, chatId, "사용법: /link_person <이름> <telegram_id>");
    return;
  }
  const personName = compactPersonName(match[1]);
  const telegramId = match[2].trim();
  const resolved = await resolveUserName(env, telegramId, personName);
  await env.DB.prepare(`
    UPDATE room_people
    SET telegram_id = ?, canonical_name = ?, confidence = 'confirmed', updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
    WHERE room_id = ? AND person_name = ?
  `).bind(telegramId, resolved, String(message.chat.id), personName).run();
  await saveUserAlias(env, telegramId, personName, { source: "link_person", roomId: String(message.chat.id), roomTitle: getRoomTitleForMessage(message), sourceTable: "room_people" });
  await sendMessage(env, chatId, `인물 연결 완료: ${personName} -> ${telegramId}`);
}

async function handleDebugIntent(env, chatId, text) {
  const query = String(text || "").replace(/^\/debug_intent\s*/i, "").trim();
  if (!query) {
    await sendMessage(env, chatId, "사용법: /debug_intent <분석할 문장>");
    return;
  }
  const intent = kohDetectIntent(query);
  const terms  = kohExtractSearchTerms(query);
  const currentRoomOnly = kohIsCurrentRoomOnly(query);
  const groupPreferred  = kohIsGroupRoomPreferred(query);
  const isInternal = kohIsInternalKnowledgeRequest(query);
  const six_r = detect6R(query);
  const out =
    `[debug_intent]\n` +
    `입력: ${query}\n\n` +
    `intent: ${kohIntentLabel(intent)}\n` +
    `terms: [${terms.join(", ") || "(없음)"}]\n` +
    `retrieval_needed: ${buildAnswerPlan(query).retrieval_needed}\n` +
    `six_r_classification: [${six_r.join(", ") || "없음"}]\n` +
    `currentRoomOnly: ${currentRoomOnly}\n` +
    `groupPreferred: ${groupPreferred}\n` +
    `isInternalKnowledge: ${isInternal}\n` +
    `confidence: ${buildAnswerPlan(query).confidence}`;
  await sendMessage(env, chatId, out);
}

async function handleDebugSearch(env, chatId, text) {
  const query = String(text || "").replace(/^\/debug_search\s*/i, "").trim();
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  try {
    const terms = query ? kohExtractSearchTerms(query) : [];
    const MIN_SCORE = terms.length ? 5 : 0;
    const intent = kohDetectIntent(query);
    const roomAliasTitle = kohResolveRoomAliasFromText(query);
    const { files: rawFiles, messages, debug } = await kohFetchRecentFilesAndMessages(env, "", false, 30, roomAliasTitle);
    const deduped = kohDedupFiles(rawFiles);
    const resolved = await kohResolveItems(env, deduped, "uploader_id", "uploader_name");
    const exportFiles = rawFiles.filter(f => f.source_type === "telegram_export" || f.saved_by === "telegram_export_importer" || String(f.tags_json || "").includes("telegram_export"));
    const telegramFileIdFiles = rawFiles.filter(f => f.telegram_file_id);
    const requestFilteredMessages = messages.filter(m => !kohIsRequestLikeForBriefing(m.content));

    const scoredFiles = resolved
      .map(f => ({ ...f, _score: kohScoreRecord(f, terms) + (roomAliasTitle && kohRoomAliasMatches(f, roomAliasTitle) ? 25 : 0) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const scoredMsgs = messages
      .map(m => ({ ...m, _score: kohScoreRecord(m, terms), _filtered: kohIsRequestLikeForBriefing(m.content) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    let out = `[debug_search: "${query || "(전체)"}"]\n`;
    out += `intent: ${kohIntentLabel(intent)}\n`;
    out += `terms: [${terms.join(", ") || "없음"}] MIN_SCORE=${MIN_SCORE}\n`;
    out += `room_alias_matched: ${roomAliasTitle || "없음"}\n`;
    out += `raw_files: ${debug?.rawFiles ?? rawFiles.length}\n`;
    out += `export_files: ${exportFiles.length}\n`;
    out += `after_telegram_file_id_filter: ${telegramFileIdFiles.length}\n`;
    out += `after_room_filter: ${rawFiles.length}\n`;
    out += `after_dedup: ${deduped.length}\n`;
    out += `messages_raw: ${debug?.rawMessages ?? messages.length}\n`;
    out += `messages_after_request_filter: ${requestFilteredMessages.length}\n`;
    out += `excluded_room_count: ${debug?.excludedRoomCount || 0}\n\n`;
    out += `files (deduped, top 5 by score):\n`;
    for (const f of scoredFiles) {
      out += `  score=${f._score} selected_representative_id=${f._representativeId || f.id} duplicate_ids=[${(f._duplicateIds || []).join(",") || "없음"}]\n`;
      out += `    resolved_room_title=${f._resolvedRoom} file=${f.file_name || ""}\n`;
      out += `    raw_uploader=${f.uploader_name || "?"} resolved_uploader=${f._resolvedName} telegram_file_id=${f.telegram_file_id ? "있음" : "없음"} send_row=${f._sendFileRowId || f.id} export=${exportFiles.some(x => x.id === f.id) ? "Y" : "N"} ${String(f.created_at || "").slice(0, 10)}\n`;
    }
    out += `\nmessages (total ${messages.length}건, top 5 before filter):\n`;
    for (const m of scoredMsgs) {
      out += `  score=${m._score} filtered=${m._filtered} room=${m.room_title || "?"} sender=${m.sender_name || ""} ${String(m.created_at || "").slice(0, 10)}\n  ${String(m.content || "").slice(0, 80)}\n`;
    }
    await sendMessage(env, chatId, out.slice(0, 3500));
  } catch (e) {
    await sendMessage(env, chatId, `debug_search 실패: ${String(e?.message || e).slice(0, 500)}`);
  }
}

async function handleDebugFilesOld(env, chatId) {
  try {
    if (!env.DB || !(await tableExists(env, "files"))) {
      await sendMessage(env, chatId, "files 테이블 없음.");
      return;
    }
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM files`).first();
    const total = count?.count || 0;

    // Fetch all (up to 50) for dedup display
    const { files: rawFiles } = await kohFetchRecentFilesAndMessages(env, "", false, null);
    const rawSlice = rawFiles.slice(0, 50);
    const deduped = kohDedupFiles(rawSlice);

    // Resolve names for deduped representatives
    const resolved = await kohResolveItems(env, deduped, "uploader_id", "uploader_name");

    const lines = resolved.slice(0, 10).map(f => {
      const rawName = f.uploader_name || f.uploader_id || "?";
      const resolvedName = f._resolvedName;
      let tags = {};
      try { tags = JSON.parse(f.tags_json || "{}"); } catch (_) {}
      const roomDisplay = Number(f.room_id || 0) > 0
        ? `1:1(${resolvedName}) / room_id=${f.room_id}`
        : `${f._resolvedRoom} / room_id=${f.room_id}`;
      return (
        `id=${f.id}${f._isDuplicate ? ` [rep, dups: ${f._duplicateIds.join(",")}]` : " [unique]"} [${String(f.created_at || "").slice(0, 10)}]\n` +
        `  room: ${roomDisplay}\n` +
        `  file: ${f.file_name || "(없음)"}\n` +
        `  raw_uploader: ${rawName}\n` +
        `  resolved_uploader: ${resolvedName}\n` +
        `  telegram_file_id: ${f.telegram_file_id ? "✓" : "✗"}  telegram_file_unique_id: ${f.telegram_file_unique_id ? "✓" : "✗"}\n` +
        `  summary: ${f.summary ? "✓" : "✗"}  extracted_text: ${f.extracted_text ? "✓" : "✗"}  content: ${f.content ? "✓" : "✗"}`
      );
    }).join("\n\n") || "(없음)";

    await sendMessage(env, chatId,
      `files total: ${total}건  raw_fetched: ${rawSlice.length}건  deduped: ${deduped.length}건\n\n${lines}`
    );
  } catch (e) {
    await sendMessage(env, chatId, `debug_files 실패\n${String(e?.stack || e?.message || e).slice(0, 1200)}`);
  }
}

async function handleDebugFiles(env, chatId) {
  try {
    if (!env.DB || !(await tableExists(env, "files"))) {
      await sendMessage(env, chatId, "files 테이블 없음.");
      return;
    }
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM files`).first();
    const total = count?.count || 0;
    const { files: rawFiles } = await kohFetchRecentFilesAndMessages(env, "", false, null);
    const deduped = kohDedupFiles(rawFiles);
    const resolved = await kohResolveItems(env, deduped, "uploader_id", "uploader_name");

    const lines = resolved.slice(0, 15).map(f => {
      const duplicateIds = (f._duplicateIds || []).filter(id => id !== f.id);
      const roomDisplay = Number(f.room_id || 0) > 0
        ? `${f._resolvedRoom} / room_id=${f.room_id}`
        : `${f._resolvedRoom || f.room_title || "알 수 없는 방"} / room_id=${f.room_id || ""}`;
      return [
        `id=${f.id} representative=${f._representativeId || f.id}`,
        `duplicate_group: ${f._dedupKey || f.file_name || f.id}`,
        `duplicate_ids: ${duplicateIds.length ? duplicateIds.join(",") : "없음"}`,
        `room: ${roomDisplay}`,
        `file_name: ${f.file_name || "파일명 없음"}`,
        `raw_uploader: ${f.uploader_name || f.sender_name || "없음"}`,
        `resolved_uploader: ${f._resolvedName || "공유자 확인 필요"}`,
        `telegram_file_id: ${f.telegram_file_id ? "있음" : "없음"} send_row=${f._sendFileRowId || f.id}`,
        `telegram_file_unique_id: ${f.telegram_file_unique_id ? "있음" : "없음"}`,
        `summary: ${f.summary ? "있음" : "없음"} extracted_text: ${f.extracted_text ? "있음" : "없음"} content: ${f.content ? "있음" : "없음"}`,
        `created_at: ${String(f.created_at || "").slice(0, 19)}`,
      ].join("\n  ");
    }).join("\n\n") || "없음";

    await sendMessage(env, chatId, `files total count: ${total}\ndeduped files count: ${deduped.length}\nraw fetched count: ${rawFiles.length}\n\n${lines}`.slice(0, 3900));
  } catch (e) {
    await sendMessage(env, chatId, `debug_files 실패\n${String(e?.stack || e?.message || e).slice(0, 1200)}`);
  }
}

function compactPersonName(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAliasName(value = "") {
  return compactPersonName(value).replace(/^@+/, "").trim();
}

async function saveUserAlias(env, telegramId, aliasName, meta = {}) {
  const alias = normalizeAliasName(aliasName);
  if (!env.DB || !telegramId || !alias || !(await tableExists(env, "user_aliases"))) return;
  try {
    await env.DB.prepare(`
      INSERT INTO user_aliases (
        telegram_id, alias_name, source, source_room_id, source_room_title, source_table, source_id,
        first_seen_at, last_seen_at, count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
      ON CONFLICT(telegram_id, alias_name) DO UPDATE SET
        source = COALESCE(NULLIF(excluded.source, ''), source),
        source_room_id = COALESCE(NULLIF(excluded.source_room_id, ''), source_room_id),
        source_room_title = COALESCE(NULLIF(excluded.source_room_title, ''), source_room_title),
        source_table = COALESCE(NULLIF(excluded.source_table, ''), source_table),
        source_id = COALESCE(NULLIF(excluded.source_id, ''), source_id),
        last_seen_at = CURRENT_TIMESTAMP,
        count = COALESCE(count, 0) + 1
    `).bind(
      String(telegramId),
      alias,
      meta.source || "",
      meta.roomId || "",
      meta.roomTitle || "",
      meta.sourceTable || "",
      meta.sourceId || ""
    ).run();
  } catch (e) {
    console.error("saveUserAlias:", e);
  }
}

async function upsertRoomPerson(env, data = {}) {
  if (!env.DB || !data.roomId || !data.personName || !(await tableExists(env, "room_people"))) return;
  try {
    await env.DB.prepare(`
      INSERT INTO room_people (
        room_id, room_title, telegram_id, person_name, canonical_name, username, team, role,
        source, confidence, owner_user_id, owner_name, first_seen_at, last_seen_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT DO UPDATE SET
        room_title = excluded.room_title,
        canonical_name = COALESCE(NULLIF(excluded.canonical_name, ''), canonical_name),
        username = COALESCE(NULLIF(excluded.username, ''), username),
        team = COALESCE(NULLIF(excluded.team, ''), team),
        role = COALESCE(NULLIF(excluded.role, ''), role),
        source = excluded.source,
        confidence = excluded.confidence,
        owner_user_id = COALESCE(NULLIF(excluded.owner_user_id, ''), owner_user_id),
        owner_name = COALESCE(NULLIF(excluded.owner_name, ''), owner_name),
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      String(data.roomId),
      data.roomTitle || "",
      data.telegramId ? String(data.telegramId) : "",
      data.personName,
      data.canonicalName || data.personName,
      data.username || "",
      data.team || "",
      data.role || "",
      data.source || "auto",
      data.confidence || "confirmed",
      data.ownerUserId || "",
      data.ownerName || ""
    ).run();
  } catch (e) {
    console.error("upsertRoomPerson:", e);
  }
}

function extractMentionedPeople(text = "") {
  const source = String(text || "").replace(/\s+/g, " ");
  const found = [];
  const patterns = [
    /([A-Za-z0-9가-힣 .&]+?(?:팀|담당|구성원|기획|전략|Comm\.?|커뮤니케이션)[A-Za-z0-9가-힣 .&]*)\s*\/\s*([가-힣]{2,5})/g,
    /([가-힣]{2,5})\s*(?:님)?\s*\(([^)]*?)\s*\/\s*([가-힣]{2,5})\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source))) {
      if (m.length === 3) {
        found.push({ team: compactPersonName(m[1]), personName: compactPersonName(m[2]) });
      } else if (m.length === 4) {
        found.push({ personName: compactPersonName(m[1]), team: compactPersonName(m[2]), role: compactPersonName(m[3]) });
      }
    }
  }
  const seen = new Set();
  return found.filter(p => {
    if (!p.personName || p.personName.length < 2) return false;
    const key = `${p.personName}|${p.team || ""}|${p.role || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function isPeopleMemoryQuery(text = "") {
  return /(누가|누구|사람|인물|구성원|멤버|이름|등록).*(등록|기억|확인|알려|보여|있어)|방\s*구성원|저장된\s*(사람|인물|이름)|다른\s*사람.*등록/i.test(String(text || ""));
}

async function kohBuildBriefingCandidates(env, days = 1) {
  const { files, messages, debug } = await kohFetchRecentFilesAndMessages(env, "", false, days || 1, "");
  const excludedRequestMessages = messages.filter(m => kohIsRequestLikeForBriefing(m.content));
  const excludedBotMessages = messages.filter(m => /@KOH_AI_bot|^\/\w+/.test(String(m.content || "")));
  const candidateMessages = messages
    .filter(m => !kohIsRequestLikeForBriefing(m.content))
    .filter(m => kohHasWorkSignal(m.content) || String(m.content || "").length >= 20)
    .slice(0, 80);
  const candidateFiles = files.slice(0, 50);
  const exportFiles = files.filter(f => f.source_type === "telegram_export" || f.saved_by === "telegram_export_importer" || String(f.tags_json || "").includes("telegram_export"));
  return {
    candidateMessages,
    candidateFiles,
    exportFiles,
    excludedRequestMessages,
    excludedBotMessages,
    excludedRoomCount: debug?.excludedRoomCount || 0,
  };
}

function kohBuildBriefingCorpusFromCandidates(data) {
  const fileLines = (data.candidateFiles || []).slice(0, 30).map(f => {
    const room = f.room_title || "알 수 없는 방";
    const who = f.uploader_name || f.sender_name || "공유자 미상";
    const text = kohShortText(f.summary || f.extracted_text || f.content || f.file_name || "", 250);
    return `[FILE] ${String(f.created_at || "").slice(0, 10)} / ${room} / ${who} / ${f.file_name || "파일명 없음"} / ${text}`;
  });
  const msgLines = (data.candidateMessages || []).slice(0, 80).map(m => {
    const room = m.room_title || "알 수 없는 방";
    const who = m.sender_name || "공유자 미상";
    return `[MSG] ${String(m.created_at || "").slice(0, 10)} / ${room} / ${who} / ${kohShortText(m.content || "", 250)}`;
  });
  return [...fileLines, ...msgLines].join("\n");
}

async function handleDebugBriefing(env, chatId) {
  if (!env.DB) { await sendMessage(env, chatId, "DB 없음"); return; }
  try {
    const data = await kohBuildBriefingCandidates(env, 7);
    const selectedFiles = data.candidateFiles.slice(0, 5).map(f => `file: ${f.file_name || ""} / ${f.room_title || ""} / ${String(f.created_at || "").slice(0, 10)}`);
    const selectedMessages = data.candidateMessages.slice(0, 5).map(m => `msg: ${m.room_title || ""} / ${m.sender_name || ""} / ${kohShortText(m.content || "", 80)}`);
    const adminId = env.ADMIN_TELEGRAM_ID || "(미설정)";
    const dyleeId = env.DYLEE_CHAT_ID || "(미설정)";
    const allowedRooms = [
      { id: "-5287392652", name: "AI 컴기획팀과 권" },
      { id: "-5156923133", name: "테스트방임" },
    ];
    const roomLines = allowedRooms.map(r => `  ${r.name} (${r.id})`).join("\n");

    const out =
      `[debug_briefing]\n` +
      `candidate_messages: ${data.candidateMessages.length}\n` +
      `excluded_request_like: ${data.excludedRequestMessages.length}\n` +
      `excluded_bot_messages: ${data.excludedBotMessages.length}\n` +
      `candidate_files: ${data.candidateFiles.length}\n` +
      `export_files: ${data.exportFiles.length}\n` +
      `excluded_room_count: ${data.excludedRoomCount}\n\n` +
      `selected_items:\n${[...selectedFiles, ...selectedMessages].join("\n") || "없음"}\n\n` +
      `[브리핑 발송 대상]\n` +
      `개인 DM: 권오혁 (${adminId})\n` +
      `개인 DM: 이동연 (${dyleeId})\n` +
      `단체방:\n${roomLines}`;
    await sendMessage(env, chatId, out.slice(0, 3500));
  } catch (e) {
    await sendMessage(env, chatId, `debug_briefing 실패: ${String(e?.message || e).slice(0, 500)}`);
  }
}

async function handleDebugImports(env, chatId) {
  if (!env.DB) {
    await sendMessage(env, chatId, "DB 없음");
    return;
  }
  try {
    const roomsHasSource = await columnExists(env, "rooms", "source");
    const roomsHasType = await columnExists(env, "rooms", "room_type");
    const roomsWhere = roomsHasSource && roomsHasType
      ? "WHERE room_type = 'telegram_export' OR source = 'telegram_export'"
      : roomsHasType
      ? "WHERE room_type = 'telegram_export'"
      : roomsHasSource
      ? "WHERE source = 'telegram_export'"
      : "";
    const rooms = (await tableExists(env, "rooms"))
      ? await env.DB.prepare(`
        SELECT COUNT(*) AS count, MAX(room_title) AS latest_room
        FROM rooms
        ${roomsWhere}
      `).first()
      : { count: 0, latest_room: "" };
    const messages = (await tableExists(env, "messages"))
      ? await env.DB.prepare(`
        SELECT COUNT(*) AS count, MIN(created_at) AS min_at, MAX(created_at) AS max_at
        FROM messages
        WHERE source_type = 'telegram_export'
      `).first()
      : { count: 0, min_at: "", max_at: "" };
    const filesHasSource = await columnExists(env, "files", "source_type");
    const filesHasSavedBy = await columnExists(env, "files", "saved_by");
    const filesWhere = filesHasSource && filesHasSavedBy
      ? "WHERE source_type = 'telegram_export' OR saved_by = 'telegram_export_importer'"
      : filesHasSource
      ? "WHERE source_type = 'telegram_export'"
      : filesHasSavedBy
      ? "WHERE saved_by = 'telegram_export_importer'"
      : "";
    const files = (await tableExists(env, "files"))
      ? await env.DB.prepare(`
        SELECT COUNT(*) AS count, MAX(room_title) AS latest_room
        FROM files
        ${filesWhere}
      `).first()
      : { count: 0, latest_room: "" };
    await sendMessage(
      env,
      chatId,
      `imported rooms count: ${rooms?.count || 0}\n` +
      `imported messages count: ${messages?.count || 0}\n` +
      `imported files count: ${files?.count || 0}\n` +
      `latest import room: ${files?.latest_room || rooms?.latest_room || "없음"}\n` +
      `latest import date range: ${messages?.min_at || "없음"} ~ ${messages?.max_at || "없음"}`
    );
  } catch (e) {
    await sendMessage(env, chatId, `debug_imports 실패: ${String(e?.message || e).slice(0, 500)}`);
  }
}

async function handleDebugActiveLegacy(env, chatId) {
  if (!env.DB) {
    await sendMessage(env, chatId, "DB 없음");
    return;
  }
  try {
    const requiredMessages = ["source_type", "source_status", "original_room", "export_message_id", "from_name", "from_id", "reply_to_message_id", "source_path", "media_group_key"];
    const requiredFiles = ["source_type", "source_status", "original_room", "export_message_id", "from_name", "from_id", "source_path", "media_group_key"];
    const msgCols = await tableColumns(env, "messages");
    const fileCols = await tableColumns(env, "files");
    const missingMessages = requiredMessages.filter(c => !msgCols.has(c));
    const missingFiles = requiredFiles.filter(c => !fileCols.has(c));
    let out = "[debug_active_legacy]\n";
    out += `messages missing: ${missingMessages.join(", ") || "없음"}\n`;
    out += `files missing: ${missingFiles.join(", ") || "없음"}\n`;
    if (msgCols.has("source_status")) {
      const rows = await env.DB.prepare(`SELECT source_status, COUNT(*) AS count FROM messages GROUP BY source_status ORDER BY source_status`).all();
      out += "\nmessages\n" + ((rows.results || []).map(r => `${r.source_status || "(blank)"}: ${r.count}`).join("\n") || "없음") + "\n";
    }
    if (fileCols.has("source_status")) {
      const rows = await env.DB.prepare(`SELECT source_status, COUNT(*) AS count FROM files GROUP BY source_status ORDER BY source_status`).all();
      out += "\nfiles\n" + ((rows.results || []).map(r => `${r.source_status || "(blank)"}: ${r.count}`).join("\n") || "없음");
    }
    await sendMessage(env, chatId, out.slice(0, 3500));
  } catch (e) {
    await sendMessage(env, chatId, `debug_active_legacy 실패: ${String(e?.message || e).slice(0, 500)}`);
  }
}

async function handleDebugExportIngest(env, chatId) {
  if (!env.DB) {
    await sendMessage(env, chatId, "DB 없음");
    return;
  }
  try {
    const msgCols = await tableColumns(env, "messages");
    const fileCols = await tableColumns(env, "files");
    const activeMessages = msgCols.has("source_status")
      ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM messages WHERE source_status = 'active'`).first()
      : { count: 0 };
    const activeFiles = fileCols.has("source_status")
      ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM files WHERE source_status = 'active'`).first()
      : { count: 0 };
    let out = "[debug_export_ingest]\n";
    if (await tableExists(env, "export_ingest_runs")) {
      const run = await env.DB.prepare(`
        SELECT *
        FROM export_ingest_runs
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).first();
      if (run) {
        out += `path: ${run.source_path || ""}\n`;
        out += `original_room: ${run.original_room || ""}\n`;
        out += `scanned: ${run.scanned_messages || 0}\n`;
        out += `messages imported/skipped/failed: ${run.imported_messages || 0}/${run.skipped_messages || 0}/${run.failed_messages || 0}\n`;
        out += `files imported/skipped/failed: ${run.imported_files || 0}/${run.skipped_files || 0}/${run.failed_files || 0}\n`;
        out += `run active messages/files: ${run.active_messages || 0}/${run.active_files || 0}\n`;
        out += `created_at: ${run.created_at || ""}\n`;
      } else {
        out += "last run: 없음\n";
      }
    } else {
      out += "export_ingest_runs 테이블 없음\n";
    }
    out += `current active messages/files: ${activeMessages?.count || 0}/${activeFiles?.count || 0}`;
    await sendMessage(env, chatId, out.slice(0, 3500));
  } catch (e) {
    await sendMessage(env, chatId, `debug_export_ingest 실패: ${String(e?.message || e).slice(0, 500)}`);
  }
}

function isFileSearchQuery(text) {
  return /(자료|파일).{0,20}(어디|찾아|요약|정리|있지|있어)|지난번.{0,20}(자료|파일)|단체방.{0,20}(자료|파일).{0,20}(정리|요약)|그\s*자료\s*어디/i.test(String(text || ""));
}

function isFileResendQuery(text) {
  // file resend intent: must be handled before external search.
  const t = String(text || "").trim();
  return /(자료|파일|첨부파일|문서).{0,30}(보내줘|보내|공유해줘|공유|전송|다시\s*줘|줘)|방금\s*요약한\s*자료|공유된\s*자료.{0,20}(보내|공유)/i.test(t);
}

function extractFileKeyword(text) {
  const cleaned = String(text || "")
    .replace(/(자료|파일|첨부파일|문서|공유된|관련|보내줘|보내|공유해줘|공유|전송|다시|줘|찾아줘|찾아|요약한|방금)/gi, " ")
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/(에|에서|된거|된|것|거|좀|관련)$/g, ""))
    .filter((t) => t && !/^(에|에서|된거|된|것|거|좀|요청)$/i.test(t));
  if (tokens.length <= 2) return tokens.join(" ");
  return tokens[0] || cleaned;
}

function parseDateFilter(text) {
  const t = String(text || "");
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  if (/어제/.test(t)) {
    const d = new Date(kstNow);
    d.setUTCDate(d.getUTCDate() - 1);
    const date = d.toISOString().slice(0, 10);
    return { label: "어제", start: `${date} 00:00:00`, end: `${date} 23:59:59` };
  }
  if (/지난\s*주|지난주/.test(t)) {
    const d = new Date(kstNow);
    d.setUTCDate(d.getUTCDate() - 7);
    return { label: "지난주", start: `${d.toISOString().slice(0, 10)} 00:00:00`, end: `${kstNow.toISOString().slice(0, 10)} 23:59:59` };
  }
  const m = t.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return null;
  const year = kstNow.getUTCFullYear();
  const mm = String(Number(m[1])).padStart(2, "0");
  const dd = String(Number(m[2])).padStart(2, "0");
  const date = `${year}-${mm}-${dd}`;
  return { label: `${Number(m[1])}/${Number(m[2])}`, start: `${date} 00:00:00`, end: `${date} 23:59:59` };
}

function fileLocation(row) {
  const room = normalizeRoomTitle(row) || "알 수 없는 방";
  const file = row.file_name || "파일명 없음";
  return `${room} > ${file}`;
}

function fileCaption(row) {
  const file = row.file_name || "파일명 없음";
  const room = row.joined_room_title || normalizeRoomTitle(row) || "알 수 없는 방";
  const actor = row.actor || row.uploader_name || row.sender_name || "공유자 미상";
  const date = formatShortDate(row.created_at);
  return kohFormatThreeLineItem({
    title: file,
    content: row.summary || row.extracted_text || "첨부 파일",
    location: `${room} > ${file}`,
    person: actor,
    date,
  });
}

async function searchFilesForResend(env, text) {
  if (!env.DB || !(await tableExists(env, "files"))) return { files: [], messages: [], exactDateMiss: false, keyword: "" };
  const keyword = extractFileKeyword(text);
  const like = `%${keyword || ""}%`;
  const date = parseDateFilter(text);
  const hasRooms = await tableExists(env, "rooms");
  const hasUsers = await tableExists(env, "users");
  const { hasCanonical } = await getUserNameColumnInfo(env);
  const joins = `${hasRooms ? "LEFT JOIN rooms r ON CAST(r.room_id AS TEXT) = CAST(f.room_id AS TEXT)" : ""} ${hasUsers ? "LEFT JOIN users u ON CAST(u.telegram_id AS TEXT) = CAST(f.uploader_id AS TEXT)" : ""}`;
  const sourceExpr = hasRooms
    ? `COALESCE(CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' END, CASE WHEN CAST(f.room_id AS INTEGER) < 0 THEN COALESCE(r.room_title, NULLIF(f.room_title, '1:1'), '알 수 없는 방') END, f.room_title, '알 수 없는 방')`
    : `COALESCE(CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' END, NULLIF(f.room_title, ''), '알 수 없는 방')`;
  const actorExpr = hasUsers
    ? (hasCanonical ? "COALESCE(NULLIF(u.canonical_name, ''), NULLIF(u.name, ''), f.uploader_name, '공유자 미상')" : "COALESCE(NULLIF(u.name, ''), f.uploader_name, '공유자 미상')")
    : "COALESCE(f.uploader_name, '공유자 미상')";
  const baseSelect = `
    SELECT f.*, ${sourceExpr} AS joined_room_title, ${actorExpr} AS actor
    FROM files f
    ${joins}
    WHERE (f.file_name LIKE ? OR f.summary LIKE ? OR f.content LIKE ? OR f.room_title LIKE ?)
  `;
  const params = [like, like, like, like];
  let files = [];
  let exactDateMiss = false;
  if (date) {
    files = (await env.DB.prepare(`${baseSelect} AND datetime(f.created_at) BETWEEN datetime(?) AND datetime(?) ORDER BY f.created_at DESC LIMIT 6`)
      .bind(...params, date.start, date.end).all()).results || [];
    exactDateMiss = files.length === 0;
  }
  if (!files.length) {
    files = (await env.DB.prepare(`${baseSelect} AND datetime(f.created_at) >= datetime('now', '-30 days') ORDER BY f.created_at DESC LIMIT 6`)
      .bind(...params).all()).results || [];
  }
  // 키워드 없으면 최근 파일 전체 기준
  if (!files.length && !keyword) {
    files = (await env.DB.prepare(`${baseSelect} ORDER BY f.created_at DESC LIMIT 6`)
      .bind(...params).all()).results || [];
  }
  files = kohDedupFiles(files);
  let messages = [];
  if (!files.length && await tableExists(env, "messages")) {
    const hasRoomsMsg = await tableExists(env, "rooms");
    const msgRoomJoin = hasRoomsMsg ? "LEFT JOIN rooms r ON CAST(r.room_id AS TEXT) = CAST(m.room_id AS TEXT)" : "";
    const msgRoomExpr = hasRoomsMsg
      ? `COALESCE(CASE WHEN CAST(m.room_id AS INTEGER)<0 THEN NULLIF(r.room_title,'') END, CASE WHEN CAST(m.room_id AS INTEGER)>0 THEN '1:1' END, m.room_title, '알 수 없는 방')`
      : `COALESCE(m.room_title, '알 수 없는 방')`;
    messages = (await env.DB.prepare(`
      SELECT m.content, ${msgRoomExpr} AS room_title, m.sender_name, m.created_at
      FROM messages m ${msgRoomJoin}
      WHERE m.content LIKE ? AND datetime(m.created_at) >= datetime('now', '-14 days')
        AND m.content NOT LIKE '/%'
        AND m.content NOT LIKE '%@KOH_AI_bot%'
      ORDER BY m.created_at DESC
      LIMIT 5
    `).bind(like).all()).results || [];
  }
  return { files, messages, exactDateMiss, keyword, date };
}

async function sendFileRow(env, chatId, row) {
  const fileId = row._sendTelegramFileId || row.telegram_file_id || "";
  const room = row.joined_room_title || normalizeRoomTitle(row) || "알 수 없는 방";
  const actor = row.actor || row.uploader_name || row.sender_name || "공유자 미상";
  const displayName = sanitizeDisplayFileName(row.file_name) || "";

  if (!fileId) {
    const loc = displayName
      ? `[${room}] &gt; ${escapeHtml(displayName)}`
      : `[${room}]`;
    const sourcePath = row.source_path || "";
    const isExport = row.source_status === "active" || sourcePath;
    const extraMsg = isExport
      ? `\n· <b>원본 경로</b>: export 자료 (telegram_file_id 없음, R2 전송 미구현)\n` +
        (sourcePath ? `· <b>로컬 경로</b>: <code>${escapeHtml(sourcePath)}</code>\n` : "")
      : `원본은 재업로드 후부터 전송 가능합니다.\n`;
    await kohSendHtml(env, chatId,
      `원본 전송용 file_id가 저장되어 있지 않아 바로 전송할 수 없습니다.\n` +
      extraMsg +
      `\n· <b>위치</b>: ${loc}\n` +
      `· <b>공유/전달</b>: <u>${escapeHtml(actor)}</u> / ${formatShortDate(row.created_at)}`
    );
    return;
  }

  const caption = fileCaption(row);
  const isPhoto = /^image\/|^photo$/i.test(row.file_type || row.mime_type || "") ||
    /\.(jpg|jpeg|png|gif|webp)$/i.test(row.file_name || "");
  try {
    if (isPhoto) {
      await sendPhoto(env, chatId, fileId, caption);
    } else {
      await sendDocument(env, chatId, fileId, caption);
    }
  } catch (e) {
    // If Telegram rejects the file_id (e.g. expired), fall back to info card
    console.error("sendFileRow Telegram error:", e.message);
    await kohSendHtml(env, chatId,
      `파일 전송 중 오류가 발생했습니다. Telegram file_id가 만료되었을 수 있습니다.\n` +
      `· <b>위치</b>: [${escapeHtml(room)}] &gt; ${escapeHtml(displayName || "파일")}\n` +
      `· <b>공유/전달</b>: <u>${escapeHtml(actor)}</u> / ${formatShortDate(row.created_at)}`
    );
  }
}

async function handleFileResendSelection(env, message, text) {
  if (!env.CONVERSATIONS || !message?.from?.id) return false;
  const n = Number(String(text || "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 3) return false;
  const key = `file_resend_${message.from.id}`;
  const raw = await env.CONVERSATIONS.get(key);
  if (!raw) return false;
  const state = JSON.parse(raw);
  const row = state.files?.[n - 1];
  if (!row) return false;
  await env.CONVERSATIONS.delete(key);
  await sendFileRow(env, message.chat.id, row);
  return true;
}

async function handleFileResendRequest(env, message, text, chatId) {
  const result = await searchFilesForResend(env, text);
  const prefix = result.exactDateMiss && result.date
    ? `${result.date.label} 자료는 직접 확인되지 않아 최근 관련 자료 기준으로 찾았습니다.\n\n`
    : "";
  if (result.files.length === 1) {
    if (prefix) await sendMessage(env, chatId, prefix.trim());
    await sendFileRow(env, chatId, result.files[0]);
    return true;
  }
  if (result.files.length > 1) {
    const candidates = result.files.slice(0, 3);
    if (env.CONVERSATIONS && message.from?.id) {
      await env.CONVERSATIONS.put(`file_resend_${message.from.id}`, JSON.stringify({ files: candidates, createdAt: new Date().toISOString() }), { expirationTtl: 600 });
    }
    const lines = candidates.map((f, idx) => formatResendCandidateLine(f, idx + 1));
    await kohSendHtml(env, chatId, `${prefix}관련 원본 후보 ${candidates.length}건입니다. 보낼 번호를 선택해주세요.\n\n${lines.join("\n")}`);
    return true;
  }
  if (result.messages.length) {
    const body = result.messages.slice(0, 3).map((m, idx) => {
      const room = normalizeRoomTitle(m) || "알 수 없는 방";
      return kohFormatThreeLineItem({
        title: `${idx + 1}. ${room}`,
        content: String(m.content || "관련 메시지 확인됨").slice(0, 180),
        location: `${room} > 관련 메시지`,
        person: m.sender_name || "공유자 미상",
        date: formatShortDate(m.created_at),
      });
    }).join("\n\n");
    await kohSendHtml(env, chatId, `<b>파일 원본은 없음. 관련 메시지 기준 확인한 내용입니다.</b>\n\n${body}`);
    return true;
  }
  const dateLabel = result.date?.label ? `${result.date.label}에 저장된 ` : "";
  await sendMessage(env, chatId, `${dateLabel}${result.keyword || "요청"} 관련 자료는 확인되지 않음.\n최근 14일 기준 관련 파일/메시지도 없음.`);
  return true;
}

async function answerFileSearch(env, text) {
  if (!env.DB) return "찾은 자료 0건임.";
  const keyword = extractSearchKeyword(text);
  const like = `%${keyword}%`;
  try {
    const hasRooms = await tableExists(env, "rooms");
    const fRoomJoin = hasRooms ? "LEFT JOIN rooms r ON CAST(r.room_id AS TEXT) = CAST(f.room_id AS TEXT)" : "";
    const fRoomTitle = hasRooms
      ? `COALESCE(CASE WHEN CAST(f.room_id AS INTEGER)<0 THEN NULLIF(r.room_title,'') END, CASE WHEN CAST(f.room_id AS INTEGER)>0 THEN '1:1' END, f.room_title, '알 수 없는 방')`
      : `COALESCE(f.room_title, '알 수 없는 방')`;
    const files = (await env.DB.prepare(`
      SELECT 'file' AS type, f.file_name AS title, f.summary AS summary, ${fRoomTitle} AS room_title,
        COALESCE(f.uploader_name, '') AS actor, f.created_at, f.file_name AS location
      FROM files f ${fRoomJoin}
      WHERE f.file_name LIKE ? OR f.summary LIKE ?
      ORDER BY f.created_at DESC
      LIMIT 10
    `).bind(like, like).all()).results || [];
    const mRoomJoin = hasRooms ? "LEFT JOIN rooms r ON CAST(r.room_id AS TEXT) = CAST(m.room_id AS TEXT)" : "";
    const mRoomTitle = hasRooms
      ? `COALESCE(CASE WHEN CAST(m.room_id AS INTEGER)<0 THEN NULLIF(r.room_title,'') END, CASE WHEN CAST(m.room_id AS INTEGER)>0 THEN '1:1' END, m.room_title, '알 수 없는 방')`
      : `COALESCE(m.room_title, '알 수 없는 방')`;
    const messages = (await env.DB.prepare(`
      SELECT 'message' AS type, m.content AS title, m.content AS summary, ${mRoomTitle} AS room_title,
        m.sender_name AS actor, m.created_at, '' AS location
      FROM messages m ${mRoomJoin}
      WHERE m.content LIKE ? AND m.content NOT LIKE '/%' AND m.content NOT LIKE '%@KOH_AI_bot%'
      ORDER BY m.created_at DESC
      LIMIT 10
    `).bind(like).all()).results || [];
    let external = [];
    if (await tableExists(env, "external_sources")) {
      external = (await env.DB.prepare(`
        SELECT 'url' AS type, title, snippet AS summary, '' AS room_title, provider AS actor, fetched_at AS created_at, url AS location
        FROM external_sources
        WHERE title LIKE ? OR snippet LIKE ?
        ORDER BY fetched_at DESC
        LIMIT 10
      `).bind(like, like).all()).results || [];
    }
    const rows = [...files, ...messages, ...external]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 5);
    if (!rows.length) return "<b>찾은 자료 0건임.</b>\n직접 매칭된 기록은 없음. 최근 14일 기록 기준으로 다시 확인함.";
    const lines = rows.map((r, idx) => {
      const room = r.room_title || "외부자료";
      const srcFile = r.location || String(r.title || "").slice(0, 40);
      const rawTitle = String(r.title || "자료").slice(0, 60);
      const safeTitle = looksLikeBadRawTitle(rawTitle)
        ? makeSafeIssueTitleFromText(r.summary || r.title || "", "자료 확인 필요")
        : rawTitle;
      return formatIssueCard({
        issue_title: `${idx + 1}. ${safeTitle}`,
        summary: String(r.summary || "요약 미생성임.").slice(0, 180),
        source_room: room,
        source_file: srcFile,
        display_file_name: srcFile,
        shared_by: r.actor || "미상",
        date: formatShortDate(r.created_at),
        six_r: [],
        agenda_category: "",
        action_items: [],
      });
    });
    return `찾은 자료 ${rows.length}건입니다.\n\n${lines.join("\n\n")}`;
  } catch (e) {
    console.error("answerFileSearch:", e);
    return "자료 검색 실패함.";
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

async function getSchedulesForDate(env, isoDate) {
  const key = String(isoDate || getTodayKST()).replace(/-/g, "");
  const raw = await env.SCHEDULES.get(`schedules_${key}`);
  return raw ? JSON.parse(raw) : [];
}

async function getSchedulesForRange(env, startISO, days = 1) {
  const result = [];
  const start = new Date(`${startISO}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const items = await getSchedulesForDate(env, iso);
    for (const item of items) result.push({ ...item, date: item.date || iso });
  }
  return result;
}

function getKstDayOfWeek() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
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
    return [
      ...(messages.results || []),
      ...(files.results || []),
      ...(meetings.results || []),
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
room_id: ${r.room_id || ""}
source_type: ${r.source_type || ""}
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
  return "";
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
  const hasDigestObject = /(확인해야\s*할\s*안건|확인해야할\s*안건|봐야\s*할\s*것|주요\s*안건|주요\s*내용|프로젝트별|프로젝트\s*안건|보고내용|올라온\s*내용|내가\s*포함된\s*방|단체방|단톡방|각종\s*방|각\s*방|방들|대화\s*내용|공유된\s*내용|공유자료|공유\s*자료|오늘\s*내용|이번주\s*내용|지난주\s*내용|최근\s*내용|회의체\s*이슈|자료\s*요약)/.test(t);
  const directPatterns =
    /^(내용|자료)\s*(요약|정리)해줘?$/.test(t) ||
    /회의체\s*이슈.{0,20}(알려줘|정리|요약)/.test(t) ||
    /(오늘|어제오늘|이번주|지난주|최근).{0,30}(요약|정리|브리핑|공유|알려줘|뽑아줘|추려줘)/.test(t) ||
    /(내가\s*포함된\s*방|방들|단체방).{0,40}(공유|내용|자료|프로젝트|안건).{0,30}(요약|정리)/.test(t) ||
    /(프로젝트별|프로젝트\s*별).{0,30}(요약|정리)/.test(t) ||
    /(확인해야\s*할\s*안건|확인해야할\s*안건).{0,20}(공유|알려줘|정리|요약)/.test(t) ||
    /(단체방|단톡방|각종\s*방|방들).{0,30}(올라온|나온|공유된).{0,20}(내용|안건|자료|보고)/.test(t);
  return directPatterns || (hasDigestVerb && hasDigestObject);
}

function parseDigestRange(text) {
  const t = String(text || "");
  if (/어제오늘|어제\s*오늘/.test(t)) return { label: "어제오늘", days: 2 };
  if (/오늘|금일/.test(t)) return { label: "오늘", days: 1 };
  if (/이번\s*주|이번주|주간/.test(t)) return { label: "이번주", days: 7 };
  if (/지난\s*주|지난주/.test(t)) return { label: "지난주", days: 14 };
  if (/최근|요즘/.test(t)) return { label: "최근 14일", days: 14 };
  return { label: "최근 14일", days: 14 };
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
    const messageLimit = Math.min(limit, 80);
    const fileLimit = 30;
    const fileDays = Math.max(Number(days) || 14, 30);
    const hasRooms = await tableExists(env, "rooms");
    const hasUsers = await tableExists(env, "users");
    const { hasCanonical } = await getUserNameColumnInfo(env);
    const roomJoin = hasRooms ? "LEFT JOIN rooms r ON r.room_id = m.room_id" : "";
    const fileRoomJoin = hasRooms ? "LEFT JOIN rooms r ON r.room_id = f.room_id" : "";
    const userJoin = hasUsers ? "LEFT JOIN users u ON u.telegram_id = m.sender_id" : "";
    const fileUserJoin = hasUsers ? "LEFT JOIN users u ON u.telegram_id = f.uploader_id" : "";
    const actorExpr = hasUsers
      ? (hasCanonical ? "COALESCE(NULLIF(u.canonical_name, ''), NULLIF(u.name, ''), m.sender_name, 'unknown')" : "COALESCE(NULLIF(u.name, ''), m.sender_name, 'unknown')")
      : "COALESCE(m.sender_name, 'unknown')";
    const fileActorExpr = hasUsers
      ? (hasCanonical ? "COALESCE(NULLIF(u.canonical_name, ''), NULLIF(u.name, ''), f.uploader_name, 'unknown')" : "COALESCE(NULLIF(u.name, ''), f.uploader_name, 'unknown')")
      : "COALESCE(f.uploader_name, 'unknown')";
    const messageSourceExpr = hasRooms
      ? `COALESCE(
          CASE WHEN CAST(m.room_id AS INTEGER) > 0 THEN '1:1' END,
          CASE WHEN CAST(m.room_id AS INTEGER) < 0 THEN COALESCE(r.room_title, NULLIF(m.room_title, '1:1'), 'unknown_group') END,
          r.room_title,
          m.room_title,
          'unknown_group'
        )`
      : `COALESCE(
          CASE WHEN CAST(m.room_id AS INTEGER) > 0 THEN '1:1' END,
          CASE WHEN CAST(m.room_id AS INTEGER) < 0 THEN NULLIF(m.room_title, '1:1') END,
          m.room_title,
          'unknown_group'
        )`;
    const fileSourceExpr = hasRooms
      ? `COALESCE(
          CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' END,
          CASE WHEN CAST(f.room_id AS INTEGER) < 0 THEN COALESCE(r.room_title, NULLIF(f.room_title, '1:1'), 'unknown_group') END,
          r.room_title,
          f.room_title,
          'unknown_group'
        )`
      : `COALESCE(
          CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' END,
          CASE WHEN CAST(f.room_id AS INTEGER) < 0 THEN NULLIF(f.room_title, '1:1') END,
          f.room_title,
          'unknown_group'
        )`;
    const messages = await env.DB.prepare(`
      SELECT
        'message' AS type,
        m.room_id,
        '' AS source_type,
        ${messageSourceExpr} AS source,
        ${actorExpr} AS actor,
        m.content AS text,
        m.created_at,
        NULL AS file_name,
        NULL AS title
      FROM messages m
      ${roomJoin}
      ${userJoin}
      WHERE datetime(m.created_at) >= datetime('now', ?)
      ORDER BY m.created_at DESC
      LIMIT ?
    `).bind(`-${days} days`, messageLimit).all();
    const files = (await tableExists(env, "files")) ? await env.DB.prepare(`
      SELECT
        'file' AS type,
        f.room_id,
        'telegram_file' AS source_type,
        ${fileSourceExpr} AS source,
        ${fileActorExpr} AS actor,
        COALESCE(f.summary, f.content, f.file_name) AS text,
        f.created_at,
        f.file_name,
        NULL AS title
      FROM files f
      ${fileRoomJoin}
      ${fileUserJoin}
      WHERE datetime(f.created_at) >= datetime('now', ?)
      ORDER BY f.created_at DESC
      LIMIT ?
    `).bind(`-${fileDays} days`, fileLimit).all() : { results: [] };
    let rows = [
      ...(messages.results || []),
      ...(files.results || []),
    ];
    if (!rows.length && days < 14) return await fetchDigestRows(env, 14, limit);
    if (!rows.length) {
      const recentMessages = await env.DB.prepare(`
        SELECT
          'message' AS type,
          m.room_id,
          '' AS source_type,
          ${messageSourceExpr} AS source,
          ${actorExpr} AS actor,
          m.content AS text,
          m.created_at,
          NULL AS file_name,
          NULL AS title
        FROM messages m
        ${roomJoin}
        ${userJoin}
        ORDER BY m.created_at DESC
        LIMIT ?
      `).bind(messageLimit).all();
      const recentFiles = (await tableExists(env, "files")) ? await env.DB.prepare(`
        SELECT
          'file' AS type,
          f.room_id,
          'telegram_file' AS source_type,
          ${fileSourceExpr} AS source,
          ${fileActorExpr} AS actor,
          COALESCE(f.summary, f.content, f.file_name) AS text,
          f.created_at,
          f.file_name,
          NULL AS title
        FROM files f
        ${fileRoomJoin}
        ${fileUserJoin}
        ORDER BY f.created_at DESC
        LIMIT ?
      `).bind(fileLimit).all() : { results: [] };
      rows = [...(recentMessages.results || []), ...(recentFiles.results || [])];
    }
    return [
      ...rows,
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  } catch (e) {
    console.error("fetchDigestRows:", e);
    return [];
  }
}

function buildDigestCorpus(rows) {
  if (!rows?.length) return "";
  return rows.map((r, idx) => {
    const typeLabel = r.type === "message" ? "대화" : r.type === "file" ? "파일" : "자료";

    // 전달(forward) 메시지에서 원래 공유자 추출
    const rawText = String(r.text || "");
    const forwardMatch = rawText.match(/^\[Forwarded from ([^\]]+)\]/);
    const originalAuthor = forwardMatch ? forwardMatch[1].trim() : null;

    // 공유자 우선순위: 원래 공유자 > users 테이블 이름 > sender_name
    const actor = originalAuthor
      || (r.actor && r.actor !== "unknown" ? r.actor : null)
      || r.uploader_name || r.sender_name || "공유자 미확인";

    // 전달자와 원래 공유자 다를 때만 "(전달자 전달)" 표시
    const forwarder = (originalAuthor && r.actor && r.actor !== "unknown" && r.actor !== originalAuthor)
      ? r.actor : null;

    const roomLabel = r.source && r.source !== "1:1" ? r.source : `1:1(${actor})`;
    const extra = r.file_name ? ` / 파일: ${r.file_name}` : "";
    const actorLabel = forwarder ? `${actor} (${forwarder} 전달)` : actor;

    const msgLink = r.telegram_message_id && r.room_id && String(r.room_id).startsWith("-")
      ? ` / 링크: https://t.me/c/${String(r.room_id).replace("-100", "")}/${r.telegram_message_id}`
      : "";

    // [Forwarded from ...] 텍스트 제거 후 본문만
    const cleanText = rawText
      .replace(/^\[Forwarded from [^\]]+\]\n?/, "")
      .replace(/Telegram export file[^\n]*/g, "")
      .trim().slice(0, 700);

    return `[${idx + 1}] ${typeLabel}
출처: [${roomLabel}] ${actorLabel} (${(r.created_at || "").slice(0, 16)})${extra}${msgLink}
내용:
${cleanText}`;
  }).join("\n\n");
}

function isPriorityIntent(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return /(이번주|오늘|보고\s*전|임원|사장님|우선순위|제일\s*먼저|먼저\s*(볼|확인|챙)|챙겨야\s*할|확인해야\s*할|보고해야\s*할|제일\s*급한|주요\s*리스크|확인\s*필요\s*과제)/i.test(t)
    && /(안건|일|것|과제|리스크|우선순위|보고|확인|챙)/i.test(t);
}

function priorityProjectName(text) {
  const t = String(text || "");

  if (/New Vision|비전선포식|선포식|서울랜드|이든|앨리스/i.test(t))
    return "SK하이닉스 New Vision 선포식";

  if (/M15|청주\s*화재|청주\s*캠퍼스|화재\s*대응|화재\s*커뮤니케이션|고객사\s*Letter|Letter\s*검토|낸드\s*화재/i.test(t))
    return "M15 화재 대응 커뮤니케이션";

  if (/AI\s*Agent\s*Builder|1인\s*1\s*AI|AI\s*비서|비서봇|텔레그램\s*봇|Comm\.?\s*총괄\s*AI|AIX/i.test(t))
    return "Comm. 총괄 AI Agent 도입";

  if (/솔리다임|Solidigm|EPIC\s*Semi|사우디\s*팹리스|낸드\s*MOU|MOU\s*체결/i.test(t))
    return "솔리다임/EPIC Semi MOU 커뮤니케이션";

  if (/ADR|상장|SEC|IPO|해외\s*투자자/i.test(t))
    return "ADR 상장 커뮤니케이션";

  if (/KPI|공과기술서|실적\s*보고|5월\s*실적|사장님\s*KPI/i.test(t))
    return "사장님 KPI 실적 보고";

  if (/지방선거|선거\s*결과|지자체장|당선/i.test(t))
    return "6.3 지방선거 결과 동향";

  if (/니케이|포럼|TM\s*말씀|아젠다/i.test(t))
    return "니케이 포럼 아젠다";

  if (/The소통|더소통|성과급|임금|복리후생/i.test(t))
    return "The소통 Q&A 대응";

  if (/엔비디아|젠슨\s*황|NVIDIA|Vera\s*Rubin|HBM\s*탑재/i.test(t))
    return "엔비디아 CEO 발언 대응";

  const firstLine = t.split(/[\n.!?/]/)[0]
    .replace(/(담당님|사장님|네\s*알겠습니다|그리하겠습니다|확인\s*중|검토\s*중)/g, "")
    .replace(/Telegram export file[^\n]*/g, "")
    .trim();
  if (firstLine.length >= 6 && firstLine.length <= 40)
    return `${firstLine} 관련`;

  return "업무 안건";
}

function priorityScore(record) {
  const t = `${record.title || ""} ${record.text || ""} ${record.file_name || ""}`;
  let score = 0;
  if (/(오늘|내일|이번주|금주|일정|마감)/i.test(t)) score += 30;
  if (/(보고|사장님|임원|CEO|컴총괄|PMO|회의|발표)/i.test(t)) score += 25;
  if (/(확인\s*필요|챙겨야|검토|회신|완료|마감|일정\s*확정|block)/i.test(t)) score += 20;
  if (record.type === "file") score += 15;
  const created = Date.parse(String(record.created_at || "").replace(" ", "T"));
  if (Number.isFinite(created) && Date.now() - created < 3 * 86400000) score += 15;
  if (/(리스크|화재|고객사|대외|IR|PR|CR|Letter|언론)/i.test(t)) score += 10;
  if (/(뉴스|기사|동향)/i.test(t)) score -= 10;
  return score;
}

async function fetchPriorityContext(env, text) {
  if (!env.DB) return [];
  const since = new Date(Date.now() - 14 * 86400000).toISOString().replace("T", " ").slice(0, 19);
  const fileSince = new Date(Date.now() - 30 * 86400000).toISOString().replace("T", " ").slice(0, 19);
  const records = [];
  const hasRooms = await tableExists(env, "rooms");
  const roomJoinM = hasRooms ? "LEFT JOIN rooms r ON r.room_id = m.room_id" : "";
  const roomJoinF = hasRooms ? "LEFT JOIN rooms r ON r.room_id = f.room_id" : "";
  const roomExprM = hasRooms
    ? "COALESCE(CASE WHEN CAST(m.room_id AS INTEGER) > 0 THEN '1:1' END, CASE WHEN CAST(m.room_id AS INTEGER) < 0 THEN COALESCE(r.room_title, NULLIF(m.room_title, '1:1'), '알 수 없는 방') END, m.room_title, '알 수 없는 방')"
    : "COALESCE(m.room_title, '알 수 없는 방')";
  const roomExprF = hasRooms
    ? "COALESCE(CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' END, CASE WHEN CAST(f.room_id AS INTEGER) < 0 THEN COALESCE(r.room_title, NULLIF(f.room_title, '1:1'), '알 수 없는 방') END, f.room_title, '알 수 없는 방')"
    : "COALESCE(f.room_title, '알 수 없는 방')";
  try {
    const messages = await env.DB.prepare(`
      SELECT 'message' AS type, m.id, m.room_id, ${roomExprM} AS room_title,
             m.sender_id AS actor_id, m.sender_name AS actor, m.content AS text,
             m.created_at, NULL AS file_name
      FROM messages m
      ${roomJoinM}
      WHERE datetime(m.created_at) >= datetime(?)
      ORDER BY m.created_at DESC
      LIMIT 200
    `).bind(since).all();
    records.push(...(messages.results || []));
  } catch (error) {
    console.error("fetchPriorityContext messages:", error);
  }
  if (await tableExists(env, "files")) {
    try {
      const files = await env.DB.prepare(`
        SELECT 'file' AS type, f.id, f.room_id, ${roomExprF} AS room_title,
               f.uploader_id AS actor_id, COALESCE(f.uploader_name, '') AS actor,
               COALESCE(f.summary, f.content, f.file_name) AS text,
               f.created_at, f.file_name
        FROM files f
        ${roomJoinF}
        WHERE datetime(f.created_at) >= datetime(?)
        ORDER BY f.created_at DESC
        LIMIT 80
      `).bind(fileSince).all();
      records.push(...(files.results || []));
    } catch (error) {
      console.error("fetchPriorityContext files:", error);
    }
  }
  if (await tableExists(env, "meetings")) {
    try {
      const meetings = await env.DB.prepare(`
        SELECT 'meeting' AS type, id, '' AS room_id, COALESCE(source, title, '회의록') AS room_title,
               '' AS actor_id, created_by AS actor,
               COALESCE(summary, raw_text, decisions, action_items, title) AS text,
               created_at, title AS file_name
        FROM meetings
        WHERE datetime(created_at) >= datetime(?)
        ORDER BY created_at DESC
        LIMIT 50
      `).bind(since).all();
      records.push(...(meetings.results || []));
    } catch (error) {
      console.error("fetchPriorityContext meetings:", error);
    }
  }
  return records;
}

function rankIssueCandidates(records) {
  const grouped = new Map();
  for (const record of records || []) {
    const text = `${record.text || ""} ${record.file_name || ""}`;
    const name = priorityProjectName(text);
    const item = grouped.get(name) || { name, score: 0, records: [], rooms: new Set(), actors: new Set(), files: new Set(), latest: "" };
    item.score += priorityScore(record);
    item.records.push(record);
    if (record.room_title) item.rooms.add(record.room_title);
    if (record.actor) item.actors.add(record.actor);
    if (record.file_name) item.files.add(record.file_name);
    if (String(record.created_at || "") > item.latest) item.latest = String(record.created_at || "");
    grouped.set(name, item);
  }
  for (const item of grouped.values()) {
    if (item.records.length > 1) item.score += Math.min(15, item.records.length * 5);
    if (item.rooms.size > 1) item.score += 15;
  }
  return [...grouped.values()].sort((a, b) => b.score - a.score).slice(0, 3);
}

function summarizePriorityText(item) {
  const text = item.records.map((r) => `${r.text || ""} ${r.file_name || ""}`).join(" ").replace(/\s+/g, " ");
  if (/New Vision|비전선포식|선포식|서울랜드|이든|앨리스/i.test(text)) {
    return {
      judgment: "행사 일정·대행사·PMO·보고 준비가 함께 언급되어 실행 관리 이슈가 가장 큼.",
      action: "행사일 확정 여부와 서울랜드 일정 block 협의 상태부터 확인 필요.",
    };
  }
  if (/M15|화재|고객사|Letter|대외/i.test(text)) {
    return {
      judgment: "고객사 Letter와 대외컴 리스크가 연결되어 우선 확인 필요성이 큼.",
      action: "Letter 검토 현황과 유관부서 협의 상태를 먼저 확인 필요.",
    };
  }
  if (/AI Agent|1인\s*1\s*AI|Comm\.?\s*총괄|6R/i.test(text)) {
    return {
      judgment: "AI Agent 도입과 보고 준비 맥락이 반복되어 추진 현황 정리가 필요함.",
      action: "보고용 진행 현황과 다음 의사결정 포인트를 정리 필요.",
    };
  }
  if (/솔리다임|Solidigm|EPIC|MOU|낸드/i.test(text)) {
    return {
      judgment: "MOU와 커뮤니케이션 관련 자료가 연결되어 대외 메시지 점검 필요성이 있음.",
      action: "공유 자료와 메시지 기준으로 커뮤니케이션 쟁점을 먼저 확인 필요.",
    };
  }
  return {
    judgment: "최근 저장 기록 기준 확인되어 이번주 우선 확인 후보로 보임.",
    action: "담당자·마감·보고 필요 여부를 먼저 확인 필요.",
  };
}

function formatPriorityAnswer(candidates) {
  if (!candidates.length) return "최근 저장된 업무 기록이 없어 우선순위를 판단할 수 없음.";
  const top = candidates.slice(0, 3);
  const items = top.map((item, idx) => {
    const s = summarizePriorityText(item);
    const date = formatShortDate(item.latest);
    const room = [...item.rooms][0] || "알 수 없는 방";
    const actor = [...item.actors][0] || "공유자 미상";
    const file = [...item.files][0] || "";
    const loc = file ? `${room} > ${file}` : `${room} > 관련 메시지`;
    const content = `${s.judgment} / ${s.action}`;
    return formatReportCard({
      issue_title: `${idx + 1}. ${item.name}`,
      summary: content,
      source_room: room,
      source_file: file,
      display_file_name: file,
      shared_by: actor,
      uploader: actor,
      date,
      six_r: [],
      agenda_category: "보고",
      action_items: [],
    });
  }).join("\n\n");
  return `우선 확인 안건 ${top.length}건입니다.\n\n${items}`;
}

async function handlePriorityQuestion(env, chatId, text) {
  const records = await fetchPriorityContext(env, text);
  if (!records.length) {
    await sendMessage(env, chatId, "최근 저장된 업무 기록이 없어 우선순위를 판단할 수 없음.");
    return;
  }
  const candidates = rankIssueCandidates(records);
  await sendMessage(env, chatId, formatPriorityAnswer(candidates), { parseMode: "HTML" });
}

async function answerDigest(env, userText, userId) {
  const range = parseDigestRange(userText);
  const rows = await fetchDigestRows(env, range.days, 140);
  if (!rows.length) {
    return `최근 기록 기준 주요 안건 0건임.\n확인: /db_status 필요.`;
  }
  const query =
    SUMMARY_TONE_RULE +
    `[요청]\n${userText}\n\n` +
    `[요약 범위]\n${range.label}\n\n` +
    `[내부 기록]\n${buildDigestCorpus(rows)}\n\n` +
    `아래는 사용자가 포함된 Telegram 방과 1:1에서 수집된 최근 업무 기록이다. 프로젝트/안건 단위로 묶어 요약하라. 단순 나열하지 말고 유사 주제를 병합하라. 없는 내용은 추정하지 말라.\n\n` +
    `[작성 지침]\n` +
    `- 최대 5개 안건까지만 선정한다.\n` +
    `- 잡담, 웃음, 단순 리액션은 제외한다.\n` +
    `- 업무적으로 중요한 내용만 선정한다.\n` +
    `- 같은 파일, 같은 행사, 같은 TF, 같은 회의는 하나로 병합한다.\n` +
    `- source_type은 출력하지 마라.\n` +
    `- HTML 태그는 <b>만 사용하라.\n` +
    `- 전체 1500자 이내.\n\n` +
    `[출력 형식 - 이 형식 외 절대 다른 형식 사용 금지]\n` +
    `📌 [6R코드] [카테고리] 안건명 (명사형 10~25자)\n` +
    `· 내용: 1~2줄 요약 (사실 기반, 추정 금지)\n` +
    `· 위치: [방이름] &gt; 파일명\n` +
    `· 공유/전달: 공유자이름 / MM/DD\n\n` +
    `6R코드: GR/PR/IR/CR/BR/ER 중 선택. 카테고리: 정부·정책/노사·인사/사내 보고/대외컴/위기·이슈/사업·전략 중 선택.\n` +
    `위 형식을 안건마다 반복. photo[_]xxx/파일명을 안건명으로 쓰지 말 것.\n`;
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
    return `최근 기록 기준 주요 일정 0건임.\n확인: /db_status 필요.`;
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
    if (!isExternalSearchEnabled(env) || !hasTavilyConfig(env)) {
      await sendMessage(env, chatId, "외부검색 미설정.\n핵심: 뉴스 조회는 Tavily 설정 필요.\n확인: /search_status 필요.");
      return;
    }
    const results = await searchTavily(env, "주요 뉴스", { maxResults: 5, searchDepth: "basic" });
    await saveExternalSearchResults(env, "주요 뉴스", results);
    const lines = results.map((r, i) => `${i + 1}. 제목: ${r.title || "제목 없음"}\n요약: ${r.snippet || "요약 없음"}\nURL: ${r.url || ""}`);
    await sendMessage(env, chatId, lines.length ? lines.join("\n\n") : "뉴스 결과 없음.");
  } catch (e) {
    console.error("handleNewsQuery error:", e);
    await sendMessage(env, chatId, "뉴스 조회 실패.\n확인: /search_status 필요.");
  }
}

async function handleSelfInfo(user, userId, chatId, env) {
  const name = user?.name || "(미등록)";
  await sendMessage(env, chatId, `${name}\nID: ${userId}`);
}

async function handleIntro(chatId, env) {
  await sendMessage(env, chatId, "권오혁 담당의 비서입니다.");
}

async function handleUserList(chatId, env) {
  if (env.DB) {
    try {
      const result = await env.DB.prepare(`
        SELECT telegram_id, name, source
        FROM users
        WHERE telegram_id NOT LIKE 'user%'
          AND name IS NOT NULL
          AND name != ''
        ORDER BY name ASC
      `).all();
      const rows = result.results || [];
      if (rows.length) {
        const lines = rows.map((u) => `${u.name} (${u.telegram_id})`);
        await sendMessage(env, chatId,
          `등록된 팀원 ${rows.length}명:\n\n${lines.join("\n")}`
        );
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
      users.push(`${cleanName(u.name) || u.name} (${u.id})`);
    }
  }
  await sendMessage(env, chatId,
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
  const senderName = await getCanonicalUserName(env, message.from);
  for (const person of extractMentionedPeople(text)) {
    await upsertRoomPerson(env, {
      roomId: String(message.chat.id),
      roomTitle: getRoomTitleForMessage(message),
      telegramId: "",
      personName: person.personName,
      canonicalName: person.personName,
      team: person.team || "",
      role: person.role || "",
      source: "mentioned_in_message",
      confidence: "inferred",
      ownerUserId: String(message.from?.id || ""),
      ownerName: senderName,
    });
  }
  const saved = await dbInsert(env, {
    roomId: message.chat.id,
    roomTitle: getRoomTitleForMessage(message),
    senderId: message.from?.id || "",
    senderName,
    content: getMessageTextForStorage(message),
    savedBy: BOT_KEY,
    telegramMessageId: message.message_id || "",
    sourceType: getSourceTypeForMessage(message),
  });
  message._persisted = saved;
  if (!saved) {
    console.error("persistIncomingMessage failed", {
      room_title: getRoomTitleForMessage(message),
      sender_name: senderName,
      source_type: getSourceTypeForMessage(message),
      message_id: message.message_id || "",
    });
  }

  // 보고성 메시지(긴 텍스트)는 구조화 분석
  const msgContent = message.caption || message.text || "";
  const isReportLike = msgContent.length >= 100 &&
    /(보고|검토|확인|담당님|사장님|마감|일정|액션|방안|대응|협의|결정|진행)/i.test(msgContent);

  if (isReportLike) {
    const savedMsg = await env.DB.prepare(`
      SELECT id FROM messages
      WHERE sender_id = ? AND created_at >= datetime('now', '-5 seconds')
      ORDER BY id DESC LIMIT 1
    `).bind(String(message.from?.id || "")).first().catch(() => null);

    if (savedMsg?.id) {
      analyzeAndStructureFile(env, null, msgContent).then(async (structured) => {
        if (!structured) return;
        const structuredSummary =
          `[요약] ${structured.summary}\n` +
          (structured.actionPlan ? `[액션] ${structured.actionPlan}\n` : "") +
          (structured.deadline ? `[마감] ${structured.deadline}` : "");
        if (structuredSummary.trim().length > 10) {
          await env.DB.prepare(`
            UPDATE messages SET content = ? WHERE id = ?
          `).bind(
            msgContent + "\n\n---\n" + structuredSummary,
            savedMsg.id
          ).run().catch(() => {});
        }
      }).catch(() => {});
    }
  }
}

function getDocumentFileType(fileName, mimeType) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".txt") || String(mimeType).includes("text/plain")) return "txt";
  if (lower.endsWith(".html") || lower.endsWith(".htm") || String(mimeType).includes("text/html")) return "html";
  if (lower.endsWith(".pdf") || String(mimeType).includes("pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  return String(mimeType || "document");
}

function isSupportedDocument(message) {
  if (!message?.document) return false;
  const type = getDocumentFileType(message.document.file_name || "", message.document.mime_type || "");
  return ["txt", "html", "pdf", "docx", "pptx"].includes(type);
}

async function analyzeAndStructureFile(env, fileId, content) {
  if (!content || content.length < 50) return null;
  if (!env.DIFY_API_KEY) return null;

  const query = TONE_RULE +
    `다음 문서/대화를 분석해서 포함된 모든 업무 안건을 각각 추출해줘.\n\n` +
    `[카테고리 분류]\n` +
    `내용을 읽고 아래 중 하나로 분류:\n` +
    `정부·정책 / 노사·인사 / 사내 보고 / 대외컴\n` +
    `위기·이슈 / 사업·전략 / 글로벌·외신 / 행사·이벤트\n\n` +
    `[추출 규칙]\n` +
    `- 여러 안건이 있으면 반드시 각각 분리 (합치지 말 것)\n` +
    `- "확인하겠습니다", "반영하겠습니다" 같은 응답 문장은 안건 아님\n` +
    `- 실질적 업무 내용(보고·결정·요청·이슈)만 추출\n` +
    `- 제목은 내용 읽고 직접 작성 (본문 문장 그대로 붙여넣기 금지)\n\n` +
    `[추출 형식]\n` +
    `안건1:\n` +
    `  카테고리: (위 목록 중 하나)\n` +
    `  제목: [카테고리] 안건명 (10~25자)\n` +
    `  배경: 왜 이 안건이 나왔는지 1~2줄\n` +
    `  액션: 다음에 해야 할 일\n` +
    `  마감: 날짜·기한 (없으면 생략)\n` +
    `  담당자: 이름 언급된 사람\n\n` +
    `안건2:\n` +
    `  ...\n\n` +
    `(안건 없으면 "안건없음")\n\n` +
    `문서 내용:\n${content.slice(0, 7000)}`;

  try {
    const result = await difyChat(env, { query, user: "file_analysis", conversationId: "" });
    const answer = result.answer || "";

    if (!answer || answer.includes("안건없음")) return null;

    // 다중 안건 파싱
    const agendaBlocks = answer.split(/안건\d+[:：]/i).filter(b => b.trim().length > 10);

    if (agendaBlocks.length === 0) return null;

    const extractField = (block, label) => {
      const m = block.match(new RegExp(`${label}[:\\s]+([\\s\\S]*?)(?=\\n\\s*(제목|배경|액션|마감|담당자|안건):|$)`, "i"));
      return m ? m[1].trim().replace(/^없음$/, "") : "";
    };

    // 다중 안건이면 JSON 배열로 반환
    const agendas = agendaBlocks.map(block => ({
      title: extractField(block, "제목"),
      background: extractField(block, "배경"),
      actionPlan: extractField(block, "액션"),
      deadline: extractField(block, "마감"),
      keyPersons: extractField(block, "담당자"),
    })).filter(a => a.title && a.title.length >= 4);

    if (agendas.length === 0) return null;

    // 첫 번째 안건은 기존 방식으로, 나머지는 별도 저장
    const first = agendas[0];
    const allSummary = agendas.map((a, i) =>
      `[안건${i+1}] ${a.title}\n` +
      (a.background ? `배경: ${a.background}\n` : "") +
      (a.actionPlan ? `액션: ${a.actionPlan}\n` : "") +
      (a.deadline ? `마감: ${a.deadline}\n` : "") +
      (a.keyPersons ? `담당자: ${a.keyPersons}` : "")
    ).join("\n\n");

    return {
      summary: allSummary,
      background: first.background,
      actionPlan: first.actionPlan,
      deadline: first.deadline,
      keyPersons: first.keyPersons,
      agendaCount: agendas.length,
      agendas: agendas,
    };
  } catch (e) {
    console.error("analyzeAndStructureFile:", e);
    return null;
  }
}

async function updateFileStructure(env, fileId, structured) {
  if (!env.DB || !fileId || !structured) return;
  try {
    const summaryText =
      `[요약] ${structured.summary}\n` +
      (structured.background ? `[배경] ${structured.background}\n` : "") +
      (structured.actionPlan ? `[액션플랜] ${structured.actionPlan}\n` : "") +
      (structured.deadline ? `[마감] ${structured.deadline}\n` : "") +
      (structured.keyPersons ? `[담당자] ${structured.keyPersons}` : "");

    await env.DB.prepare(`
      UPDATE files SET
        summary = ?,
        action_plan = ?,
        deadline = ?,
        background = ?,
        key_persons = ?,
        structured_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      summaryText.trim(),
      structured.actionPlan || "",
      structured.deadline || "",
      structured.background || "",
      structured.keyPersons || "",
      fileId
    ).run();
  } catch (e) {
    console.error("updateFileStructure:", e);
  }
}

function extractTelegramFileMeta(message) {
  if (!message) return null;
  if (message.document) {
    return {
      kind: "document",
      telegram_file_id: message.document.file_id || null,
      telegram_file_unique_id: message.document.file_unique_id || null,
      file_name: message.document.file_name || "document",
      mime_type: message.document.mime_type || "application/octet-stream",
      file_size: message.document.file_size || 0,
    };
  }
  if (Array.isArray(message.photo) && message.photo.length) {
    const p = message.photo[message.photo.length - 1]; // largest resolution
    return {
      kind: "photo",
      telegram_file_id: p.file_id || null,
      telegram_file_unique_id: p.file_unique_id || null,
      file_name: `image_${message.chat?.id || "x"}_${message.message_id || Date.now()}.jpg`,
      mime_type: "image/jpeg",
      file_size: p.file_size || 0,
    };
  }
  if (message.video) {
    return {
      kind: "video",
      telegram_file_id: message.video.file_id || null,
      telegram_file_unique_id: message.video.file_unique_id || null,
      file_name: message.video.file_name || `video_${message.message_id || Date.now()}.mp4`,
      mime_type: message.video.mime_type || "video/mp4",
      file_size: message.video.file_size || 0,
    };
  }
  return null;
}

async function persistIncomingFile(env, message) {
  if (!env.DB || message.from?.is_bot || message._filePersisted) return;
  const meta = extractTelegramFileMeta(message);
  if (!meta) return;
  // Documents: require isSupportedDocument check; photos/videos: always persist
  if (meta.kind === "document" && !isSupportedDocument(message)) return;
  try {
    const room = resolveFileRoomInfo(message);
    if (room.sourceType === "telegram_group") {
      await dbRegisterRoom(env, room.roomId, room.roomTitle, BOT_KEY, room.roomType);
    }
    const canonicalName = await getCanonicalUserName(env, message.from);

    await dbSaveFile(env, {
      telegram_file_id: meta.telegram_file_id || "",
      telegram_file_unique_id: meta.telegram_file_unique_id || "",
      roomId: room.roomId,
      roomTitle: room.roomTitle,
      senderId: message.from?.id || "",
      senderName: canonicalName,
      uploaderId: message.from?.id || "",
      uploaderName: canonicalName,
      fileName: meta.file_name,
      fileType: meta.kind,
      mimeType: meta.mime_type,
      fileSize: meta.file_size,
      sourceType: room.sourceType,
      extracted_text: "",
      summary: meta.kind === "photo" ? "" : "분석 중...",
      tags: [meta.kind, ...room.tags],
    }, { throwOnError: true });
    message._filePersisted = true;

    // 캡션이 있으면 비동기로 내용 분석
    const caption = message.caption || "";
    if (caption.length >= 20 && meta.kind === "document") {
      const saved = await env.DB.prepare(`
        SELECT id FROM files
        WHERE telegram_file_unique_id = ?
        ORDER BY id DESC LIMIT 1
      `).bind(meta.telegram_file_unique_id || "").first();

      if (saved?.id) {
        analyzeAndStructureFile(env, saved.id, caption).then((structured) => {
          if (structured) updateFileStructure(env, saved.id, structured);
        }).catch((e) => console.error("async file analysis:", e));
      }
    }

    if (env.CONVERSATIONS) {
      await env.CONVERSATIONS.put("debug_files_last", "파일 메타 저장 성공", { expirationTtl: 86400 });
    }
  } catch (e) {
    console.error("persistIncomingFile:", e);
    if (env.CONVERSATIONS) {
      await env.CONVERSATIONS.put(
        "debug_files_last",
        String(e?.stack || e?.message || e).slice(0, 1500),
        { expirationTtl: 86400 }
      );
    }
  }
}

// Direct-INSERT ingestion — always saves telegram_file_id (fixes dbSaveFile UPDATE exclusion bug)
async function saveIncomingFileIfAny(message, env) {
  if (!message || !env.DB || message.from?.is_bot || message._filePersisted) return;
  const meta = extractTelegramFileMeta(message);
  if (!meta) return;
  if (meta.kind === "document" && !isSupportedDocument(message)) return;
  try {
    const room = resolveFileRoomInfo(message);
    if (room.sourceType === "telegram_group") {
      await dbRegisterRoom(env, room.roomId, room.roomTitle, BOT_KEY, room.roomType);
    }
    const canonicalName = await getCanonicalUserName(env, message.from);
    const fileId = meta.telegram_file_id || "";
    const uniqueId = meta.telegram_file_unique_id || "";

    if (uniqueId) {
      const prev = await env.DB.prepare(
        `SELECT id, telegram_file_id FROM files WHERE telegram_file_unique_id = ? ORDER BY id DESC LIMIT 1`
      ).bind(uniqueId).first();
      if (prev?.id) {
        // Update telegram_file_id even if previously missing (fixes import-then-live scenario)
        const hasSourceStatusUpd = await columnExists(env, "files", "source_status");
        await env.DB.prepare(
          `UPDATE files SET telegram_file_id = ?, uploader_name = ?, room_id = ?, room_title = ?${hasSourceStatusUpd ? ", source_status = 'active'" : ""} WHERE id = ?`
        ).bind(fileId, canonicalName, String(room.roomId), room.roomTitle, prev.id).run();
        message._filePersisted = true;
        return;
      }
    }

    const hasSourceStatus = await columnExists(env, "files", "source_status");
    await env.DB.prepare(`
      INSERT INTO files (
        telegram_file_id, telegram_file_unique_id,
        room_id, room_title,
        uploader_id, uploader_name,
        sender_id, sender_name,
        file_name, file_type, mime_type, file_size,
        source_type, extracted_text, summary, tags_json, saved_by${hasSourceStatus ? ", source_status" : ""}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?${hasSourceStatus ? ", ?" : ""})
    `).bind(
      fileId,
      uniqueId,
      String(room.roomId),
      room.roomTitle,
      String(message.from?.id || ""),
      canonicalName,
      String(message.from?.id || ""),
      canonicalName,
      meta.file_name,
      meta.kind,
      meta.mime_type,
      meta.file_size || 0,
      room.sourceType,
      meta.kind === "photo" ? "" : "분석 중...",
      JSON.stringify([meta.kind, ...(room.tags || [])]),
      BOT_KEY,
      ...(hasSourceStatus ? ["active"] : [])
    ).run();

    message._filePersisted = true;

    const caption = message.caption || "";
    if (caption.length >= 20 && meta.kind === "document") {
      const saved = await env.DB.prepare(
        `SELECT id FROM files WHERE telegram_file_unique_id = ? ORDER BY id DESC LIMIT 1`
      ).bind(uniqueId || "").first();
      if (saved?.id) {
        analyzeAndStructureFile(env, saved.id, caption).then((structured) => {
          if (structured) updateFileStructure(env, saved.id, structured);
        }).catch((e) => console.error("async file analysis (saveIncomingFileIfAny):", e));
      }
    }

    if (env.CONVERSATIONS) {
      await env.CONVERSATIONS.put("debug_files_last", "파일 메타 저장 성공 (v2)", { expirationTtl: 86400 });
    }
  } catch (e) {
    console.error("saveIncomingFileIfAny:", e);
    if (env.CONVERSATIONS) {
      await env.CONVERSATIONS.put(
        "debug_files_last",
        String(e?.stack || e?.message || e).slice(0, 1500),
        { expirationTtl: 86400 }
      );
    }
  }
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

  if (
    !message.from?.is_bot &&
    chatType !== "private" &&
    !hasFile &&
    isWorkReportRoom(env, chatId) &&
    !kohIsWorkReportValidationExempt(text)
  ) {
    if (await handleWorkReportValidation(env, message, text)) return;
  }

  await handleNewChatMembers(env, message);
  await persistIncomingMessage(env, message);
  await maybeSaveInfoItem(env, message, text, `${chatId}:${message.message_id || ""}`);
  await saveIncomingFileIfAny(message, env);
  if (!message._persisted) {
    await upsertUser(env, message.from, chatType === "private" ? chatId : message.from.id, chatType === "private" ? "private_dm" : "group_message");
  }
  if (!message._persisted && (chatType === "private" || hasFile) && text.trim()) {
    await dbInsert(env, {
      roomId: chatId,
      roomTitle: getRoomTitleForMessage(message),
      senderId: userId,
      senderName: getSenderName(message.from),
      content: getMessageTextForStorage(message),
      savedBy: BOT_KEY,
      telegramMessageId: message.message_id || "",
      sourceType: getSourceTypeForMessage(message),
    });
  }
  if (chatType !== "private") {
    await upsertRoom(env, message.chat);
  }
  if (!message._persisted && chatType !== "private") {
    await upsertRoomMember(env, message.chat, message.from, "message");
    await maybeUpdateUserDisplayNameFromBareName(env, message);
  }
  if (await routeSlashCommand(env, message, text, chatId)) {
    return;
  }

  if (message.new_chat_members?.some((m) => m.is_bot)) {
    await saveRoom(chatId, message.chat.title, env);
    await dbRegisterRoom(env, chatId, message.chat.title, "koh");
    await upsertRoom(env, message.chat);
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

  if (await handleCanonicalNameChoice(env, message, text)) {
    return;
  }

  if (await handleFileResendSelection(env, message, text)) {
    return;
  }

  // 이름 입력 대기 중 → 등록 처리 (Dify 호출 없음) [기존 호환]
  if (isDiagnosticCommand(text)) {
    await handleDiagnosticCommand(env, chatId, text);
    return;
  }

  // 첫 접촉: 텔레그램 이름·ID 자동 저장 (릴레이는 임시 사용자로 처리)
  if (!user) {
    if (isRelay) {
      user = { id: userId, name: message.from?.first_name || "사용자", chat_id: chatId };
    } else {
      const rawName =
        [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim() ||
        `user_${userId}`;
      const tgName = cleanName(rawName) || rawName;
      await saveUser(userId, { id: userId, name: tgName, chat_id: chatId }, env);
      user = { id: userId, name: tgName, chat_id: chatId };
    }
  }

  // 이름 변경 요청
  const nameChangeMatch =
    text.match(/(?:이름|성함|저를?)\s*([가-힣]{2,5})\s*(?:으?로|이라고)?\s*(?:저장|등록|불러|바꿔|변경)/) ||
    text.match(/([가-힣]{2,5})\s*(?:으?로|로)\s*(?:저장해줘|불러줘|바꿔줘)/);
  if (nameChangeMatch) {
    const newName = cleanName(nameChangeMatch[1]);
    if (newName && newName.length >= 2) {
      await saveUser(userId, { ...(user || {}), id: userId, name: newName, chat_id: chatId }, env);
      await sendMessage(env, chatId, `${newName}님으로 저장했습니다.`);
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
    await handleUserList(chatId, env);
    return;
  }

  // 봇이 들어간 방 목록
  if (isRoomListQuery(text) && !isDigestQuery(text)) {
    const rooms = await dbGetAllRooms(env);
    if (rooms.length === 0) {
      await sendMessage(
        env,
        chatId,
        "등록된 방 없음."
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

  if (isPeopleMemoryQuery(text)) {
    await handleRoomPeople(env, message, chatId);
    return;
  }

  // pending candidate selection (1/2/3 after file list)
  if (/^[1-3][번]?$/.test(String(text || "").trim())) {
    const uid = String(message.from?.id || "");
    const handled = await kohHandlePendingSelection(env, chatId, uid, text);
    if (handled) return;
    // No active pending state
    await kohSendHtml(env, chatId, "선택 가능한 후보가 없습니다.");
    return;
  }

  // GENERAL_CHAT hard guard in DM handler
  if (isGeneralChatQuery(text)) {
    await sendMessage(env, chatId, makeGeneralChatReply(text));
    return;
  }

  // CURRENT_CONTENT: 답장/전달 메시지 요약 우선 처리
  if (hasCurrentContentForSummary(message, text)) {
    const summaryTriggers = /요약|정리|안건|이슈|이거|이것|이 내용|이게|뭐야|뭔가|어떤|핵심|간단히|설명/;
    if (summaryTriggers.test(text) || text.length < 15) {
      await handleCurrentContentSummary(env, message, text, chatId, userId);
      return;
    }
  }

  // internal knowledge: digest/file/priority 앞에서 먼저 처리
  if (kohIsInternalKnowledgeRequest(text)) {
    const handled = await kohHandleInternalKnowledgeRequest(env, chatId, text, "", userId);
    if (handled) return;
  }

  if (isFileResendQuery(text)) {
    await handleFileResendRequest(env, message, text, chatId);
    return;
  }

  if (isPriorityIntent(text)) {
    await handlePriorityQuestion(env, chatId, text);
    return;
  }

  if (isFileSearchQuery(text)) {
    const answer = await answerFileSearch(env, text);
    await sendMessage(env, chatId, answer, { parseMode: "HTML" });
    return;
  }

  if (isScheduleDigestQuery(text)) {
    const answer = await answerScheduleDigest(env, text, userId);
    await sendMessage(env, chatId, answer);
    return;
  }

  if (isDigestQuery(text)) {
    const answer = await answerDigest(env, text, userId);
    await sendMessage(env, chatId, answer, { parseMode: "HTML" });
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
      `당신은 업무 비서입니다. 다음은 최근 ${days}일간 팀에서 공유된 자료와 대화입니다.\n` +
      `아래 형식으로 업무 보고서 형태로 정리해줘.\n\n` +
      `[정리 형식]\n` +
      `📌 안건명 (5~20자, 업무 맥락 기반으로 직접 작성)\n` +
      `· 핵심 내용 1~2줄\n` +
      `· 출처: [방이름] 공유자 (날짜 시간)\n\n` +
      `[규칙]\n` +
      `- 파일명(photo[_]xxx 등)을 제목으로 쓰지 말 것\n` +
      `- 내용 기반으로 안건명 직접 작성 (예: KPI 공과기술서 보고 건, MOU 커뮤니케이션 방안 등)\n` +
      `- 안건별로 한 줄 띄어쓰기\n` +
      `- 마크다운(*,#,**) 사용 금지\n` +
      `- 이모티콘(📌) 포함\n\n` +
      corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "정리 중 오류가 발생했습니다.", { parseMode: "HTML" });
    return;
  }

  // 팀방 검색·요약 (공유 D1에서 전체 검색)
  if (isRoomSearchQuery(text)) {
    const q = parseSearch(text);
    const rows = await dbSearch(env, q);
    if (rows.length === 0) {
      await sendMessage(env, chatId, `해당 조건 기록 없음.\n핵심: D1 messages 검색 결과 없음.\n확인: /db_status 필요.`);
      return;
    }
    const corpus = rows
      .reverse()
      .map((r) => `[${r.room_title}] ${r.sender_name}: ${r.content}`)
      .join("\n")
      .slice(0, 8000);
    const query = TONE_RULE + "다음 팀 대화 기록의 핵심 논의를 항목별로 요약해줘.\n\n" + corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.", { parseMode: "HTML" });
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
      `당신은 업무 비서입니다. 다음은 최근 ${days}일간 팀 대화 기록입니다.\n` +
      `${typeLabel} 형태로 업무 보고서처럼 정리해줘.\n\n` +
      `[정리 형식]\n` +
      `📌 안건명 (파일명 아닌 업무 내용 기반)\n` +
      `· 핵심 내용 1~2줄\n` +
      `· 출처: [방이름] 공유자 (날짜 시간)\n\n` +
      `[규칙]\n` +
      `- 파일명(photo[_]xxx 등)을 제목으로 쓰지 말 것\n` +
      `- 안건별로 한 줄 띄어쓰기\n` +
      `- 마크다운(*,#,**) 사용 금지\n` +
      `- 이모티콘(📌) 포함\n\n` +
      corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.", { parseMode: "HTML" });
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

  // 자유 질문 — DB 자료 참고해서 SUMMARY_RULE 형식으로 답변
  if (text.length > 2 && !isGeneralChatQuery(text)) {
    try {
      const rows = await fetchDigestRows(env, 7, 100);
      if (rows.length > 0) {
        const corpus = rows.map((r) => {
          const room = r.source || "알 수 없는 방";
          const time = (r.created_at || "").slice(0, 16);
          const fname = r.file_name ? ` [파일: ${r.file_name}]` : "";
          const txt = String(r.text || "").replace(/Telegram export file[^\n]*/g, "").trim().slice(0, 200);
          return `[${room}] (${time}) ${r.actor || ""}${fname}: ${txt}`;
        }).join("\n");

        const q =
          TONE_RULE + SUMMARY_RULE +
          `당신은 권오혁 담당의 AI 비서입니다.\n\n` +
          `[팀 자료]\n${corpus.slice(0, 6000)}\n\n` +
          `[질문]\n${text}\n\n` +
          `SUMMARY_RULE 형식으로 답해줘. 모든 방 자료 포함 필수.`;

        const result = await difyChat(env, { query: q, user: String(userId), conversationId: "" });
        if (result.answer) {
          await sendMessage(env, chatId, result.answer, { parseMode: "HTML" });
          return;
        }
      }
    } catch (e) { console.error("DM fallback:", e); }
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
      const msg = String(e?.message || "");
      const isProviderError = msg.includes("provider_not_initialize") || msg.includes("credentials is not initialized");
      await sendMessage(env, chatId, isProviderError
        ? "현재 AI 요약 모델 연결이 불안정합니다. 잠시 후 다시 시도해주세요."
        : "응답 생성 중 오류가 발생했습니다. 다시 시도해주세요."
      );
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

  // GENERAL_CHAT hard guard — skip all retrieval
  if (isGeneralChatQuery(cleanText)) {
    await sendMessage(env, chatId, makeGeneralChatReply(cleanText));
    return;
  }

  // CURRENT_CONTENT: 답장/전달 메시지 요약 우선 처리
  if (hasCurrentContentForSummary(message, cleanText)) {
    const summaryTriggers = /요약|정리|안건|이슈|이거|이것|이 내용|이게|뭐야|뭔가|어떤|핵심|간단히|설명/;
    if (summaryTriggers.test(cleanText) || cleanText.length < 15) {
      await handleCurrentContentSummary(env, message, cleanText, chatId, userId);
      return;
    }
  }

  if (await handleFileResendSelection(env, message, cleanText)) {
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

  if (isPeopleMemoryQuery(cleanText)) {
    await handleRoomPeople(env, message, chatId);
    return;
  }

  // pending candidate selection (1/2/3 after file list)
  if (/^[1-3][번]?$/.test(String(cleanText || "").trim())) {
    const uid = String(message.from?.id || "");
    const handled = await kohHandlePendingSelection(env, chatId, uid, cleanText);
    if (handled) return;
    await kohSendHtml(env, chatId, "선택 가능한 후보가 없습니다.");
    return;
  }

  // internal knowledge: digest/file/priority 앞에서 먼저 처리
  if (kohIsInternalKnowledgeRequest(cleanText)) {
    const handled = await kohHandleInternalKnowledgeRequest(env, chatId, cleanText, String(chatId), userId);
    if (handled) return;
  }

  if (isFileResendQuery(cleanText)) {
    await handleFileResendRequest(env, message, cleanText, chatId);
    return;
  }

  if (isPriorityIntent(cleanText)) {
    await handlePriorityQuestion(env, chatId, cleanText);
    return;
  }

  if (isFileSearchQuery(cleanText)) {
    const answer = await answerFileSearch(env, cleanText);
    await sendMessage(env, chatId, answer, { parseMode: "HTML" });
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
    await sendMessage(env, chatId, answer, { parseMode: "HTML" });
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
      `당신은 업무 비서입니다. 다음은 최근 ${days}일간 팀 대화 기록입니다.\n` +
      `${typeLabel} 형태로 업무 보고서처럼 정리해줘.\n\n` +
      `[정리 형식]\n` +
      `📌 안건명 (파일명 아닌 업무 내용 기반)\n` +
      `· 핵심 내용 1~2줄\n` +
      `· 출처: [방이름] 공유자 (날짜 시간)\n\n` +
      `[규칙]\n` +
      `- 파일명(photo[_]xxx 등)을 제목으로 쓰지 말 것\n` +
      `- 안건별로 한 줄 띄어쓰기\n` +
      `- 마크다운(*,#,**) 사용 금지\n` +
      `- 이모티콘(📌) 포함\n\n` +
      corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.", { parseMode: "HTML" });
    return;
  }

  // 특정 방/키워드 검색
  if (isRoomSearchQuery(cleanText)) {
    const q = parseSearch(cleanText);
    const rows = await dbSearch(env, q);
    if (rows.length === 0) {
      await sendMessage(env, chatId, `해당 조건 기록 없음.\n핵심: D1 messages 검색 결과 없음.\n확인: /db_status 필요.`);
      return;
    }
    const corpus = rows
      .reverse()
      .map((r) => `[${r.room_title}] ${r.sender_name}: ${r.content}`)
      .join("\n")
      .slice(0, 6000);
    const query = TONE_RULE + "다음 팀 대화 기록의 핵심 논의를 항목별로 요약해줘.\n\n" + corpus;
    const result = await difyChat(env, { query, user: userId, conversationId: "" });
    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했습니다.", { parseMode: "HTML" });
    return;
  }

  // GENERAL_CHAT final gate — before digest fetch
  if (isGeneralChatQuery(cleanText)) {
    await sendMessage(env, chatId, makeGeneralChatReply(cleanText));
    return;
  }

  // 짧거나 모호한 쿼리 — LLM 호출 없이 안내
  const _isAmbiguous = cleanText.length < 12 || /^(오늘|내일|이번주|최근)\s*(뭐|어때|있어|확인하면|뭘|해야)\b/.test(cleanText);
  if (_isAmbiguous) {
    await sendMessage(env, chatId, "좀 더 구체적으로 알려주시면 도와드릴게요.");
    return;
  }

  // 일반 응답 — DB 자료 참고해서 SUMMARY_RULE 형식으로 답변 (3일/30행 경량 코퍼스)
  try {
    const rows = await fetchDigestRows(env, 3, 30);
    const corpus = rows.map((r) => {
      const room = r.source || "알 수 없는 방";
      const time = (r.created_at || "").slice(0, 16);
      const fname = r.file_name ? ` [파일: ${r.file_name}]` : "";
      const txt = String(r.text || "").replace(/Telegram export file[^\n]*/g, "").trim().slice(0, 200);
      return `[${room}] (${time}) ${r.actor || ""}${fname}: ${txt}`;
    }).join("\n");

    const contextMsg =
      TONE_RULE + SUMMARY_RULE +
      `당신은 권오혁 담당의 AI 비서입니다.\n` +
      `[단체방: ${message.chat?.title || ""}] [발신자: ${user?.name || ""}]\n\n` +
      `[팀 자료]\n${corpus.slice(0, 6000)}\n\n` +
      `[질문]\n${cleanText}\n\n` +
      `SUMMARY_RULE 형식으로 답해줘. 모든 방 포함 필수. "메뉴 선택" 금지.`;

    const result = await difyChat(env, { query: contextMsg, user: userId, conversationId: "" });
    if (result.answer) await sendMessage(env, chatId, result.answer, { parseMode: "HTML" });
  } catch (e) {
    console.error("group fallback:", e);
    await sendMessage(env, chatId, "자료를 불러오는 중 오류가 발생했습니다.");
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

    const room = resolveFileRoomInfo(message);
    const roomId = room.roomId;
    const roomTitle = room.roomTitle;
    const senderName = await getCanonicalUserName(env, message.from);
    const fileType = getDocumentFileType(fileName, mimeType);

    if (message.document) {
      console.log("DOCUMENT_RECEIVED", { roomId, roomTitle, fileName, fileId, fileType });
    }

    // 이미지는 Gemini Vision으로 처리
    if (mimeType.startsWith("image/")) {
      const buffer = await downloadTelegramFile(env, fileId);
      const answer = await analyzeImageWithClaude(env, buffer, mimeType, message.caption || "");
      console.log("PHOTO_EXTRACTED", { roomId, fileId, extractedLength: answer?.length || 0 });
      await dbSaveFile(env, {
        telegram_file_id: fileId,
        telegram_file_unique_id: message.document?.file_unique_id || message.photo?.[message.photo.length - 1]?.file_unique_id || "",
        roomId,
        roomTitle,
        senderId: userId,
        senderName,
        uploaderId: userId,
        uploaderName: senderName,
        fileName,
        fileType: getDocumentFileType(fileName, mimeType),
        mimeType,
        fileSize: message.document?.file_size || 0,
        sourceType: room.sourceType,
        extracted_text: answer,
        summary: answer,
        tags: ["image", "analysis", ...room.tags],
      });
      await sendMessage(env, chatId, answer);
      return;
    }

    const fileBuffer = await downloadTelegramFile(env, fileId);
    console.log("DOCUMENT_DOWNLOADED", { fileName, bytes: fileBuffer.byteLength });

    const fileBlob = new Blob([fileBuffer]);
    let extractedText = "";

    // 텍스트 추출
    if (fileType === "txt") {
      extractedText = (await fileBlob.text()).slice(0, 8000);
    } else if (fileType === "html") {
      extractedText = htmlToPlainText(await fileBlob.text()).slice(0, 8000);
    } else if (["pdf", "pptx", "docx"].includes(fileType)) {
      try { extractedText = await extractTextFromFile(fileType, fileBuffer); } catch (e) { console.error("extract:", e); }
    }

    console.log("DOCUMENT_EXTRACTED", { fileName, extractedLength: extractedText?.length || 0 });
    console.log("FILE_EXTRACT_RESULT", {
      roomId,
      roomTitle,
      fileName,
      fileType,
      extractedLength: extractedText?.length || 0,
    });

    const hasExtractedText = (extractedText || "").trim().length >= 30;

    // 본문이 추출된 경우에만 Dify로 3줄 요약 생성
    let summary = "";
    if (hasExtractedText) {
      try {
        const query = TONE_RULE +
          `다음은 "${fileName}" 파일에서 추출된 본문입니다. 이 본문 내용만 바탕으로 핵심 내용을 3개의 불릿으로 요약해줘.\n\n` +
          `[형식]\n- 핵심 내용 1\n- 핵심 내용 2\n- 핵심 내용 3\n\n` +
          `마크다운(*, #) 금지. 다른 자료나 지식 베이스 참고 금지. 오직 아래 본문 내용만 사용.\n\n` +
          `[본문]\n${extractedText.slice(0, 6000)}`;
        const result = await difyChat(env, { query, user: String(userId), conversationId: "" });
        summary = (result?.answer || "").trim();
      } catch (e) {
        console.error("handleFile summary:", e);
      }
    }

    await dbSaveFile(env, {
      telegram_file_id: fileId,
      telegram_file_unique_id: message.document?.file_unique_id || "",
      roomId,
      roomTitle,
      senderId: userId,
      senderName,
      uploaderId: userId,
      uploaderName: senderName,
      fileName,
      fileType,
      mimeType,
      fileSize: message.document?.file_size || 0,
      sourceType: room.sourceType,
      extracted_text: extractedText,
      summary,
      tags: ["document", ...room.tags],
    });

    console.log("DOCUMENT_SAVED", {
      roomId,
      fileName,
      hasText: hasExtractedText,
      textLength: extractedText?.length || 0,
    });

    // Advanced Parser: cache parsed result for this file (non-blocking, best-effort)
    try {
      const fileUniqueId = message.document?.file_unique_id || "";
      const parsedDoc = buildParsedDocumentFromExistingFields({
        file_name: fileName,
        mime_type: mimeType,
        source_type: room.sourceType,
        extracted_text: extractedText,
        summary,
        caption: message.caption || "",
      });
      await saveParsedDocument(
        { telegram_file_unique_id: fileUniqueId, file_name: fileName, source_type: room.sourceType },
        parsedDoc,
        env
      );
    } catch (_) {}

    // 업로드 직후 응답: 본문 추출 성공 여부만 간단히 안내
    let response;
    if (hasExtractedText) {
      response = `[${fileName}] 저장 완료\n본문 추출: 성공\n추출 글자 수: ${extractedText.length}자`;
    } else {
      response = `[${fileName}] 저장 완료\n본문 추출: 실패\n사유: 현재 파일 파서가 이 형식을 지원하지 않음`;
    }
    await sendMessage(env, chatId, response);
  } catch (e) {
    console.error("handleFile error:", e);
    await sendMessage(env, chatId, `파일 처리 오류.\n핵심: ${e.message}\n확인: /db_status 필요.`);
  }
}

// PDF 텍스트 추출 (Cloudflare Workers 환경)
// DEFLATE/zlib 압축 해제 (Workers 내장 DecompressionStream 사용)
async function inflateBytes(data, format = "deflate") {
  try {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(data);
    writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    return null;
  }
}

// ZIP(PPTX/DOCX) 내부 엔트리 추출 (Central Directory 기반)
async function unzipEntries(arrayBuffer, namePredicate) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) return [];
  const cdEntries = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const results = [];
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const compMethod = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder("utf-8").decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    if (namePredicate(name)) {
      const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
      const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const compData = bytes.subarray(dataStart, dataStart + compSize);
      let data;
      if (compMethod === 0) data = compData;
      else if (compMethod === 8) data = (await inflateBytes(compData, "deflate-raw")) || new Uint8Array(0);
      else data = new Uint8Array(0);
      results.push({ name, data });
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return results;
}

// PDF 텍스트 추출 (압축 스트림 포함)
async function extractTextFromPdf(env, arrayBuffer) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder("latin1");
    const raw = decoder.decode(bytes);

    const extractFromText = (text) => {
      const blocks = [];
      const btEtRegex = /BT([\s\S]*?)ET/g;
      let m;
      while ((m = btEtRegex.exec(text)) !== null) {
        const block = m[1];
        const tjRegex = /\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g;
        let tjMatch;
        while ((tjMatch = tjRegex.exec(block)) !== null) {
          const t = (tjMatch[1] || tjMatch[2] || "")
            .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
            .replace(/\\\\/g, "\\")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "")
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")")
            .trim();
          if (t.length > 1) blocks.push(t);
        }
      }
      return blocks.join(" ").replace(/\s+/g, " ").trim();
    };

    // 스트림 객체 순회: /FlateDecode면 압축 해제 후, 아니면 원본 그대로 텍스트 추출
    const allTexts = [];
    const streamRegex = /stream\r?\n/g;
    let match;
    while ((match = streamRegex.exec(raw)) !== null) {
      const streamStart = match.index + match[0].length;
      const endIdx = raw.indexOf("endstream", streamStart);
      if (endIdx < 0) break;
      let dataEnd = endIdx;
      if (raw[dataEnd - 1] === "\n") dataEnd--;
      if (raw[dataEnd - 1] === "\r") dataEnd--;

      const dictStart = Math.max(0, match.index - 1000);
      const dict = raw.slice(dictStart, match.index);

      const streamBytes = bytes.subarray(streamStart, dataEnd);
      if (/\/Filter\s*\/FlateDecode/.test(dict)) {
        const inflated = await inflateBytes(streamBytes, "deflate");
        if (inflated) {
          const text = new TextDecoder("latin1").decode(inflated);
          const extracted = extractFromText(text);
          if (extracted) allTexts.push(extracted);
        }
      } else if (!/\/Filter/.test(dict)) {
        const text = new TextDecoder("latin1").decode(streamBytes);
        const extracted = extractFromText(text);
        if (extracted) allTexts.push(extracted);
      }

      streamRegex.lastIndex = endIdx + "endstream".length;
    }

    let extracted = allTexts.join(" ").replace(/\s+/g, " ").trim();
    if (extracted.length > 30) return extracted.slice(0, 8000);

    // 최종 폴백: 압축되지 않은 본문 전체에서 직접 추출
    extracted = extractFromText(raw);
    return extracted.slice(0, 8000) || "";
  } catch (e) {
    console.error("extractTextFromPdf:", e);
    return "";
  }
}

// PPTX 텍스트 추출 (ZIP 구조 파싱, 슬라이드 순서대로)
async function extractTextFromPptx(arrayBuffer) {
  try {
    const entries = await unzipEntries(arrayBuffer, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    entries.sort((a, b) => {
      const na = parseInt(a.name.match(/slide(\d+)\.xml$/)[1], 10);
      const nb = parseInt(b.name.match(/slide(\d+)\.xml$/)[1], 10);
      return na - nb;
    });

    const slideTexts = [];
    const decoder = new TextDecoder("utf-8", { fatal: false });
    for (const entry of entries) {
      const xml = decoder.decode(entry.data);
      const texts = [];
      const tagRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
      let m;
      while ((m = tagRegex.exec(xml)) !== null) {
        const t = m[1].trim();
        if (t.length > 0) texts.push(t);
      }
      if (texts.length > 0) slideTexts.push(texts.join(" "));
    }

    return slideTexts.join("\n").slice(0, 8000);
  } catch (e) {
    console.error("extractTextFromPptx:", e);
    return "";
  }
}

// DOCX 텍스트 추출 (ZIP 구조 파싱, 단락 구분 유지)
async function extractTextFromDocx(arrayBuffer) {
  try {
    const entries = await unzipEntries(arrayBuffer, (name) => name === "word/document.xml");
    if (!entries.length) return "";

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const xml = decoder.decode(entries[0].data);
    const normalized = xml.replace(/<\/w:p>/g, "\n");

    const texts = [];
    const regex = /<w:t[^>]*>([^<]*)<\/w:t>|(\n)/g;
    let m;
    while ((m = regex.exec(normalized)) !== null) {
      if (m[1] !== undefined) texts.push(m[1]);
      else texts.push("\n");
    }

    return texts.join("").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000);
  } catch (e) {
    console.error("extractTextFromDocx:", e);
    return "";
  }
}

// 파일 타입별 텍스트 추출 통합
async function extractTextFromFile(fileType, arrayBuffer) {
  if (fileType === "pdf")  return extractTextFromPdf(null, arrayBuffer);
  if (fileType === "pptx") return extractTextFromPptx(arrayBuffer);
  if (fileType === "docx") return extractTextFromDocx(arrayBuffer);
  return "";
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
  // Gemini Vision으로 이미지 분석
  try {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 없음");
    const base64Data = arrayBufferToBase64(buffer);
    const body = {
      contents: [{
        parts: [
          {
            text: userPrompt ||
              "이 이미지를 업무 문서 관점에서 분석해줘.\n" +
              "구성: 핵심 내용 / 주요 안건 / 일정·마감 / 확인할 일.\n" +
              "보고 메모체로 작성. 문장 끝은 ~임, ~필요, ~확인 필요 형식."
          },
          { inline_data: { mime_type: mimeType, data: base64Data } },
        ],
      }],
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text
      || "이미지 분석 결과를 가져오지 못했습니다.";
  } catch (e) {
    console.error("analyzeImageWithClaude(Gemini):", e);
    return "이미지 분석 오류: " + e.message;
  }
}

async function sendDailyBriefingOld_DISABLED(env) {
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

async function resolveDailyBriefingTargetChatId(env, targetChatId = "") {
  if (targetChatId) return String(targetChatId);
  if (env.DAILY_BRIEFING_CHAT_ID) return String(env.DAILY_BRIEFING_CHAT_ID);
  if (env.ADMIN_CHAT_ID) return String(env.ADMIN_CHAT_ID);
  if (env.ADMIN_TELEGRAM_ID) return String(env.ADMIN_TELEGRAM_ID);
  try {
    if (env.DB && await tableExists(env, "users")) {
      const row = await env.DB.prepare(`
        SELECT chat_id, telegram_id FROM users
        WHERE COALESCE(chat_id, '') != ''
        ORDER BY last_seen_at DESC LIMIT 1
      `).first();
      if (row?.chat_id || row?.telegram_id) return String(row.chat_id || row.telegram_id);
    }
    if (env.DB && await tableExists(env, "messages")) {
      const hasSourceType = await columnExists(env, "messages", "source_type");
      const row = hasSourceType
        ? await env.DB.prepare(`SELECT room_id FROM messages WHERE source_type = 'telegram_private' AND CAST(room_id AS INTEGER) > 0 ORDER BY created_at DESC LIMIT 1`).first()
        : await env.DB.prepare(`SELECT room_id FROM messages WHERE CAST(room_id AS INTEGER) > 0 ORDER BY created_at DESC LIMIT 1`).first();
      if (row?.room_id) return String(row.room_id);
    }
  } catch (error) {
    console.error("resolveDailyBriefingTargetChatId:", error);
  }
  console.log("브리핑 대상 chat_id 없음");
  return "";
}

async function sendDailyBriefingCurrent_DISABLED(env, { targetChatId = "", mock = false } = {}) {
  const today = getTodayKST();
  const day = getKstDayOfWeek();
  const isMonday = day === 1;
  const digestDays = isMonday ? 7 : 1;
  const title = isMonday ? "지난주 주요 안건 공유드립니다." : "전일 주요 안건 및 오늘 일정 공유드립니다.";
  const section1 = isMonday ? "지난주 주요 안건" : "전일 주요 안건";
  const section2 = isMonday ? "이번주 일정" : "오늘 일정";
  const section3 = isMonday ? "이번주 확인 과제" : "오늘 확인 과제";
  const schedules = isMonday ? await getSchedulesForRange(env, today, 7) : await getSchedulesForDate(env, today);
  const scheduleLines = schedules.length
    ? schedules
        .sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`))
        .slice(0, 10)
        .map((s) => `- ${formatShortDate(s.date || today)} ${s.time || ""} ${s.title || s.text || "일정"}`.replace(/\s+/g, " ").trim())
        .join("\n")
    : "- 오늘 일정 데이터가 없습니다.";
  const rows = await fetchDigestRows(env, digestDays, 140);
  if (!rows.length && !schedules.length) {
    if (mock && targetChatId) await sendMessage(env, targetChatId, "최근 자료를 찾지 못했습니다.");
    return;
  }
  let msg = "";
  try {
    const adminUser = await findAdminUser(env);
    const query =
      TONE_RULE +
      `[브리핑 제목]\n${title}\n\n` +
      `[수집 기록]\n${buildDigestCorpus(rows)}\n\n` +
      `[일정]\n${scheduleLines}\n\n` +
      `[출력 형식]\n` +
      `${title}\n\n` +
      `1) ${section1}\n` +
      `[프로젝트] 프로젝트/안건명\n` +
      `- 핵심 내용: 1~2문장 이내.\n` +
      `- 확인 필요: 다음 액션 1문장.\n\n` +
      `2) ${section2}\n` +
      `- MM/DD HH:MM 일정명\n\n` +
      `3) ${section3}\n` +
      `- 확인할 일\n\n` +
      `[작성 규칙]\n` +
      `- 프로젝트별로 병합하고 시간순 나열은 금지.\n` +
      `- source_type은 출력하지 말 것.\n` +
      `- 전체 1200자 이내. 짧고 보고형.\n` +
      `- 없는 내용은 추정하지 말 것.`;
    const result = await difyChat(env, {
      query,
      user: String(adminUser?.id || "admin"),
      conversationId: "",
    });
    msg = result.answer || "";
  } catch (e) {
    console.error("sendDailyBriefing:", e);
  }
  if (!msg) {
    msg = `${title}\n\n1) ${section1}\n- 최근 자료를 찾지 못했습니다.\n\n2) ${section2}\n${scheduleLines}\n\n3) ${section3}\n- 확인 과제 데이터가 없습니다.`;
  }
  const target = await resolveDailyBriefingTargetChatId(env, targetChatId);
  if (target) {
    await sendMessage(env, target, msg, { parseMode: "HTML" });
  } else {
    console.error("daily briefing target chat id missing");
  }
}

async function sendDailyBriefing(env, { targetChatId = "", mock = false } = {}) {
  const { kstDate } = getKstDayRange();

  // ── 데이터 수집 ──────────────────────────────────────────
  // 팀방: 7일 내
  const teamSince = new Date(Date.now() - 7 * 86400000)
    .toISOString().slice(0, 19).replace("T", " ");

  // 정보방: 어제
  const { startIso: infoStart, endIso: infoEnd } = (() => {
    const kstOffset = 9 * 60 * 60 * 1000;
    const yesterday = new Date(Date.now() + kstOffset - 86400000);
    const d = yesterday.toISOString().slice(0, 10);
    const startMs = Date.parse(d + "T00:00:00Z") - kstOffset;
    const endMs   = Date.parse(d + "T23:59:59Z") - kstOffset;
    return {
      startIso: new Date(startMs).toISOString().replace("T", " ").slice(0, 19),
      endIso:   new Date(endMs).toISOString().replace("T", " ").slice(0, 19),
    };
  })();

  let teamRows = [], infoRows = [];
  if (env.DB) {
    try {
      // 팀방 메시지 (상태태그 포함된 것만)
      const teamRes = await env.DB.prepare(`
        SELECT content, sender_name, room_title, created_at
        FROM messages
        WHERE created_at >= ?
          AND content NOT LIKE '/%'
          AND content NOT LIKE '%@KOH_AI_bot%'
          AND (
            content LIKE '%#보고%' OR content LIKE '%#Fup%'
            OR content LIKE '%#공유%' OR content LIKE '%#일정%'
          )
        ORDER BY created_at DESC
        LIMIT 100
      `).bind(teamSince).all();
      teamRows = teamRes.results || [];
    } catch (e) { console.error("briefing teamRows:", e); }

    try {
      // 정보방 메시지 (어제 날짜)
      const infoRes = await env.DB.prepare(`
        SELECT content, sender_name, room_title, created_at
        FROM messages
        WHERE created_at >= ? AND created_at <= ?
          AND (room_title LIKE '%💡정보방%')
        ORDER BY created_at DESC
        LIMIT 100
      `).bind(infoStart, infoEnd).all();
      infoRows = infoRes.results || [];
    } catch (e) { console.error("briefing infoRows:", e); }
  }

  // ── 섹션 생성 ──────────────────────────────────────────

  // [일정] #일정 태그 - 이번주 일정
  const scheduleItems = teamRows
    .filter(r => r.content.includes("#일정"))
    .slice(0, 5)
    .map(r => {
      const { taskName, milestone } = parseWorkReportFields(r.content);
      const name = taskName || r.content.split("\n")[0].replace(/#\S+/g, "").trim().slice(0, 30);
      return `· ${name}${milestone ? " → " + milestone : ""} (${r.sender_name || "미확인"})`;
    });

  // [보고] #보고 태그 - D-7 이내 마감
  const reportItems = teamRows
    .filter(r => r.content.includes("#보고"))
    .map(r => {
      const { taskName, milestone, progress } = parseWorkReportFields(r.content);
      const daysLeft = calcDaysLeft(milestone);
      return { taskName, milestone, progress, daysLeft, sender: r.sender_name };
    })
    .filter(r => r.daysLeft !== null && r.daysLeft <= 7)
    .sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99))
    .slice(0, 5)
    .map(r => {
      const d = r.daysLeft === 0 ? "오늘" : r.daysLeft < 0 ? `D+${Math.abs(r.daysLeft)}` : `D-${r.daysLeft}`;
      return `· [${d}] ${r.taskName || "업무명 확인"}${r.milestone ? " (" + r.milestone + ")" : ""} (${r.sender || "미확인"})`;
    });

  // [공유] #공유 태그 - 최근 2일
  const shareSince = new Date(Date.now() - 2 * 86400000)
    .toISOString().slice(0, 19).replace("T", " ");
  const shareItems = teamRows
    .filter(r => r.content.includes("#공유") && r.created_at >= shareSince)
    .slice(0, 5)
    .map(r => {
      const { taskName, progress } = parseWorkReportFields(r.content);
      const name = taskName || r.content.split("\n")[0].replace(/#\S+/g, "").trim().slice(0, 30);
      return `· ${name}${progress ? " — " + progress.slice(0, 40) : ""} (${r.sender_name || "미확인"})`;
    });

  // [Fup] #Fup 태그 - 최근 2일
  const fupItems = teamRows
    .filter(r => r.content.includes("#Fup") && r.created_at >= shareSince)
    .slice(0, 5)
    .map(r => {
      const { taskName, progress } = parseWorkReportFields(r.content);
      const name = taskName || r.content.split("\n")[0].replace(/#\S+/g, "").trim().slice(0, 30);
      return `· ${name}${progress ? " — " + progress.slice(0, 40) : ""} (${r.sender_name || "미확인"})`;
    });

  // [정보방] 어제 내용 - 태그별
  const infoByTag = {};
  for (const tag of INFO_ROOM_TAGS) {
    const items = infoRows
      .filter(r => r.content.includes(tag))
      .slice(0, 3)
      .map(r => `· ${r.content.split("\n")[0].replace(/#\S+/g, "").trim().slice(0, 50)}`);
    if (items.length) infoByTag[tag] = items;
  }

  // ── 브리핑 조립 ──────────────────────────────────────────
  const lines = [`📅 ${kstDate} 아침 브리핑\n`];

  // 정보방
  if (Object.keys(infoByTag).length) {
    lines.push("💡 정보방 (어제 요약)");
    for (const [tag, items] of Object.entries(infoByTag)) {
      lines.push(`${tag}`);
      lines.push(...items);
    }
    lines.push("");
  }

  // 일정
  if (scheduleItems.length) {
    lines.push("📆 이번주 일정");
    lines.push(...scheduleItems);
    lines.push("");
  }

  // 보고 임박
  if (reportItems.length) {
    lines.push("📣 보고 임박");
    lines.push(...reportItems);
    lines.push("");
  }

  // 공유
  if (shareItems.length) {
    lines.push("🔄 최근 공유");
    lines.push(...shareItems);
    lines.push("");
  }

  // Fup
  if (fupItems.length) {
    lines.push("⏩ Fup 현황");
    lines.push(...fupItems);
    lines.push("");
  }

  if (lines.length <= 1) {
    lines.push("최근 7일 내 업무 기록이 없습니다.");
  }

  const briefing = lines.join("\n").trim();

  // ── 발송 ──────────────────────────────────────────────
  if (targetChatId) {
    await sendMessage(env, targetChatId, briefing);
    return;
  }

  // 권오혁 개인 DM
  if (env.ADMIN_TELEGRAM_ID) {
    await sendMessage(env, env.ADMIN_TELEGRAM_ID, briefing);
  }

  // 이동연 DM
  if (env.DYLEE_CHAT_ID) {
    await sendMessage(env, env.DYLEE_CHAT_ID, briefing);
  }

  // 봇이 들어가 있는 단체방 (rooms 테이블에서 자동 조회)
  let allowedRoomIds = [];
  if (env.DB) {
    try {
      const roomsRes = await env.DB.prepare(`
        SELECT room_id, room_title FROM rooms
        WHERE room_type IN ('group', 'supergroup')
      `).all();
      allowedRoomIds = (roomsRes.results || [])
        .filter(r => !kohIsExcludedRoomTitle(r.room_title || ""))
        .map(r => r.room_id);
    } catch (e) { console.error("briefing rooms 조회:", e); }
  }
  for (const roomId of allowedRoomIds) {
    try {
      await sendMessage(env, roomId, `[아침 브리핑]\n\n${briefing}`);
    } catch (e) {
      console.error(`브리핑 발송 실패 ${roomId}:`, e.message);
    }
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

// Telegram getFile API로 실제 다운로드 URL 생성
async function getTelegramFileUrl(env, fileId) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const data = await res.json();
  if (!data.ok || !data.result?.file_path) throw new Error("Telegram getFile failed");
  return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

// Telegram 파일을 ArrayBuffer로 다운로드
async function downloadTelegramFile(env, fileId) {
  const url = await getTelegramFileUrl(env, fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  return await res.arrayBuffer();
}

function sanitizeTelegramHtml(value) {
  return escapeHtml(value)
    .replace(/&lt;b&gt;/g, "<b>")
    .replace(/&lt;\/b&gt;/g, "</b>")
    .replace(/&lt;u&gt;/g, "<u>")
    .replace(/&lt;\/u&gt;/g, "</u>");
}

async function sendMessage(env, chatId, text, opts = {}) {
  const parseMode = opts.parseMode || "";
  let body;
  if (parseMode === "HTML") {
    body = JSON.stringify({
      chat_id: chatId,
      text: String(text),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } else {
    const clean = String(text)
      .replace(/\*\*(.+?)\*\*/gs, "$1")
      .replace(/\*(.+?)\*/gs, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/__(.+?)__/gs, "$1")
      .replace(/`{1,3}([^`]*)`{1,3}/g, "$1");
    body = JSON.stringify({ chat_id: chatId, text: clean });
  }
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

async function sendDocument(env, chatId, document, caption = "") {
  const body = {
    chat_id: chatId,
    document,
    caption: String(caption || "").slice(0, 1000),
    parse_mode: "HTML",
  };
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.description || `sendDocument failed: ${res.status}`);
  return data;
}

async function sendPhoto(env, chatId, photo, caption = "") {
  const body = {
    chat_id: chatId,
    photo,
    caption: String(caption || "").slice(0, 1000),
    parse_mode: "HTML",
  };
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.description || `sendPhoto failed: ${res.status}`);
  return data;
}

async function safeDifyCall(env, params) {
  try {
    return await difyChat(env, params);
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (
      msg.includes("provider_not_initialize") ||
      msg.includes("credentials is not initialized") ||
      msg.includes("Model") && msg.includes("not initialized")
    ) {
      console.warn("LLM_PROVIDER_NOT_INITIALIZED:", msg.slice(0, 200));
      return null;
    }
    console.warn("LLM_CALL_FAILED:", msg.slice(0, 200));
    return null;
  }
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
