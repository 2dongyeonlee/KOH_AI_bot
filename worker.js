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
const BOT_OWNER_NAME = "권오혁";
const BOT_OWNER_ROLE = "6R전략담당";
const BOT_PERSONA = "권오혁 담당님의 개인 업무 비서 AI OS";
const BOT_DB_NAME = "6r-ai-db";
const BOT_KEY = "koh";
const BOT_USERNAME = "KOH_AI_bot";
const BUILD_VERSION = "koh-routing-format-fix-20260608-1500";
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
  if (!env.DB || !telegramId) return fallback || "";
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
    `).bind(fallback || "", String(telegramId)).first();
    return String(row?.name || fallback || "").trim();
  } catch (e) {
    console.error("getCanonicalNameByTelegramId:", e);
    return fallback || "";
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
  const displayName = getSenderName(telegramUser);
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
    const canonical = canonicalName || (isBetterUserName(displayName, storedName) ? displayName : (storedName || displayName || (telegramUser.username ? `@${telegramUser.username}` : telegramId)));
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
    const finalName = String(prev?.canonical_name || "").trim()
      || (isBetterUserName(displayName, prev?.name) ? displayName : (prev?.name || displayName));
    const columns = ["telegram_id", "chat_id", "name", "username", "first_name", "last_name", "source", "last_seen_at"];
    const values = [telegramId, String(chatId || from.id), finalName, from.username || "", from.first_name || "", from.last_name || "", source, "CURRENT_TIMESTAMP"];
    if (hasCanonical) {
      columns.push("canonical_name");
      values.push(finalName);
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
    "보내줘", "공유해줘", "첨부해줘", "알려줘", "찾아줘", "줘", "해줘",
    "어디", "위치", "관련", "내가", "포함된", "방들", "단체방", "다른방",
    "다른", "에서도", "오늘", "어제", "이번주", "지난주", "최근", "있는",
    "있던", "된거", "공유된", "전체", "기준", "보고", "안건", "회의",
    "일정", "먼저", "챙겨야", "확인", "필요", "해라", "해줘라"
  ]);

  return [...new Set(
    kohNormalizeText(text)
      .split(" ")
      .map(t => t.trim())
      .filter(t => t.length >= 2)
      .filter(t => !stopWords.has(t))
      .slice(0, 10)
  )];
}

function kohIsInternalKnowledgeRequest(text = "") {
  const t = String(text || "").trim();

  if (/^\/\w+/.test(t)) return false;

  const hasInternalCue =
    /(자료|파일|문서|보고자료|보고내용|내용|상세|요약|정리|어디|위치|보내줘|공유해줘|첨부해줘|알려줘|포함된 방|다른방|단체방|공유된 내용|챙겨야|우선순위|안건|회의|일정)/.test(t);

  const isPureExternal =
    /(뉴스|기사|웹검색|외부검색|검색해줘|오늘자 뉴스)/.test(t) &&
    !/(방|대화|공유|자료|파일|문서|보고내용)/.test(t);

  return hasInternalCue && !isPureExternal;
}

function kohIsFileSendRequest(text = "") {
  return /(보내줘|공유해줘|첨부해줘|올려줘)/.test(String(text || ""));
}

function kohIsCurrentRoomOnly(text = "") {
  return /(이 방만|여기만|현재 방만|이 단체방만)/.test(String(text || ""));
}

function kohLooksLikeCommandOrRequestOnly(content = "") {
  const t = String(content || "").trim();

  if (!t) return true;
  if (/^\/\w+/.test(t)) return true;

  const normalized = kohNormalizeText(t);
  const words = normalized.split(" ").filter(Boolean);

  const requestLike =
    /(요약|정리|알려줘|보내줘|공유해줘|찾아줘|해줘|해라|어디|뭐야|확인해줘)/.test(t);

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

    if (source.includes(n)) score += 10;
    if (source.replace(/\s+/g, "").includes(n.replace(/\s+/g, ""))) score += 5;
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

function kohFormatThreeLineItem({ title = "", content = "", location = "", person = "", date = "" }) {
  const safeTitle = kohEscapeHtml(title || "확인된 안건");
  const safeContent = kohEscapeHtml(kohShortText(content || "관련 내용 확인 필요", 220));
  const safeLocation = kohEscapeHtml(location || "위치 확인 필요");
  const safePerson = kohEscapeHtml(person || "공유자 확인 필요");
  const safeDate = kohEscapeHtml(date || "일자 확인 필요");

  return `<b>[${safeTitle}]</b>
 🧩 <b>내용</b>: ${safeContent}
 📎 <b>자료 위치</b>: ${safeLocation}
 👤 <b>공유자</b>: ${safePerson} / ${safeDate}`;
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

  const documentId = file.telegram_file_id;
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

async function kohFetchRecentFilesAndMessages(env, currentRoomId = "", currentRoomOnly = false) {
  const roomFilter = currentRoomOnly && currentRoomId ? "AND CAST(f.room_id AS TEXT) = ?" : "";
  const msgRoomFilter = currentRoomOnly && currentRoomId ? "AND CAST(m.room_id AS TEXT) = ?" : "";

  const fileSql = `
    SELECT
      f.id,
      f.room_id,
      COALESCE(r.room_title, f.room_title,
        CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' ELSE '알 수 없는 방' END
      ) AS room_title,
      f.uploader_name,
      f.file_name,
      f.telegram_file_id,
      f.summary,
      f.extracted_text,
      f.created_at
    FROM files f
    LEFT JOIN rooms r ON r.room_id = f.room_id
    WHERE f.created_at >= datetime('now', '-30 days')
      ${roomFilter}
    ORDER BY f.created_at DESC
    LIMIT 120
  `;

  const msgSql = `
    SELECT
      m.id,
      m.room_id,
      COALESCE(r.room_title, m.room_title,
        CASE WHEN CAST(m.room_id AS INTEGER) > 0 THEN '1:1' ELSE '알 수 없는 방' END
      ) AS room_title,
      m.sender_name,
      m.content,
      m.created_at
    FROM messages m
    LEFT JOIN rooms r ON r.room_id = m.room_id
    WHERE m.created_at >= datetime('now', '-14 days')
      AND m.content IS NOT NULL
      AND m.content != ''
      AND m.content NOT LIKE '/%'
      ${msgRoomFilter}
    ORDER BY m.created_at DESC
    LIMIT 200
  `;

  const files = currentRoomOnly && currentRoomId
    ? await env.DB.prepare(fileSql).bind(String(currentRoomId)).all()
    : await env.DB.prepare(fileSql).all();

  const messages = currentRoomOnly && currentRoomId
    ? await env.DB.prepare(msgSql).bind(String(currentRoomId)).all()
    : await env.DB.prepare(msgSql).all();

  return {
    files: files.results || [],
    messages: messages.results || []
  };
}

async function kohHandleInternalKnowledgeRequest(env, chatId, text, currentRoomId = "") {
  if (!env.DB) {
    await kohSendHtml(env, chatId, "DB 연결이 없어 저장 기록을 확인할 수 없음.");
    return true;
  }

  const terms = kohExtractSearchTerms(text);
  const currentRoomOnly = kohIsCurrentRoomOnly(text);
  const sendFile = kohIsFileSendRequest(text);

  const { files, messages } = await kohFetchRecentFilesAndMessages(env, currentRoomId, currentRoomOnly);

  const rankedFiles = files
    .map(f => ({ ...f, _score: kohScoreRecord(f, terms) }))
    .filter(f => terms.length ? f._score > 0 : true)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const rankedMessages = messages
    .filter(m => !kohLooksLikeCommandOrRequestOnly(m.content))
    .map(m => ({ ...m, _score: kohScoreRecord(m, terms) }))
    .filter(m => terms.length ? m._score > 0 : true)
    .sort((a, b) => b._score - a._score)
    .slice(0, 8);

  if (sendFile && rankedFiles.length > 0) {
    const file = rankedFiles[0];

    const room = file.room_title || "알 수 없는 방";
    const fileName = file.file_name || "파일명 없음";
    const uploader = file.uploader_name || "공유자 확인 필요";
    const date = kohFormatDate(file.created_at);
    const summary = file.summary || file.extracted_text || "관련 자료가 확인됨.";

    const caption = kohFormatThreeLineItem({
      title: "자료 공유",
      content: summary,
      location: `${room} > ${fileName}`,
      person: uploader,
      date
    });

    const sent = await kohSendDocument(env, chatId, file, caption);

    if (sent) return true;

    await kohSendHtml(env, chatId,
`<b>[자료 확인 결과]</b>
 🧩 <b>내용</b>: 관련 파일은 확인됐지만 원본 재전송 ID가 없어 파일을 보낼 수 없음.
 📎 <b>자료 위치</b>: ${kohEscapeHtml(room)} &gt; ${kohEscapeHtml(fileName)}
 👤 <b>공유자</b>: ${kohEscapeHtml(uploader)} / ${kohEscapeHtml(date)}`);
    return true;
  }

  if (rankedFiles.length > 0) {
    const body = rankedFiles.slice(0, 3).map((f, i) => {
      const room = f.room_title || "알 수 없는 방";
      const fileName = f.file_name || "파일명 없음";
      const uploader = f.uploader_name || "공유자 확인 필요";
      const date = kohFormatDate(f.created_at);
      const summary = f.summary || f.extracted_text || "요약 정보 없음";

      return kohFormatThreeLineItem({
        title: `${i + 1}. ${fileName}`,
        content: summary,
        location: `${room} > ${fileName}`,
        person: uploader,
        date
      });
    }).join("\n\n");

    await kohSendHtml(env, chatId,
`<b>저장된 자료 기준으로 확인한 내용입니다.</b>

${body}`);
    return true;
  }

  if (rankedMessages.length > 0) {
    const body = rankedMessages.slice(0, 5).map((m, i) => {
      const room = m.room_title || "알 수 없는 방";
      const sender = m.sender_name || "공유자 확인 필요";
      const date = kohFormatDate(m.created_at);
      const content = m.content || "관련 메시지 확인됨";

      return kohFormatThreeLineItem({
        title: `${i + 1}. ${room}`,
        content,
        location: `${room} > 관련 메시지`,
        person: sender,
        date
      });
    }).join("\n\n");

    await kohSendHtml(env, chatId,
`<b>관련 파일 원본은 확인되지 않음.</b>
다만 포함된 방의 최근 기록 기준으로 확인된 내용입니다.

${body}`);
    return true;
  }

  const fallbackScope = currentRoomOnly ? "현재 방" : "포함된 방 전체";

  await kohSendHtml(env, chatId,
`<b>[검색 결과 없음]</b>
 🧩 <b>내용</b>: ${fallbackScope}의 최근 저장 기록에서 관련 내용을 찾지 못함.
 📎 <b>자료 위치</b>: 확인된 자료 또는 관련 메시지 없음
 👤 <b>공유자</b>: 확인 불가 / 확인 불가`);
  return true;
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
  return String(env.EXTERNAL_SEARCH_ENABLED || "").trim().toLowerCase() === "true";
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
  await sendMessage(
    env,
    chatId,
    `BUILD_VERSION: ${BUILD_VERSION}\n` +
    `DB binding: ${env.DB ? "있음" : "없음"}\n` +
    `DAILY_BRIEFING_CHAT_ID: ${env.DAILY_BRIEFING_CHAT_ID ? "있음" : "없음"}\n` +
    `ADMIN_CHAT_ID: ${env.ADMIN_CHAT_ID ? "있음" : "없음"}\n` +
    `cron config: KST 08:00 = UTC 23:00`
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

function formatShortDate(value) {
  const text = String(value || "");
  const m = text.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}` : "";
}

function normalizeRoomTitle(row, titleKey = "room_title", joinedKey = "joined_room_title") {
  const roomId = Number(row?.room_id);
  const joined = String(row?.[joinedKey] || "").trim();
  const own = String(row?.[titleKey] || "").trim();
  if (Number.isFinite(roomId) && roomId > 0) return "1:1";
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
    const lines = rows.map((f, idx) => {
      f.room_title = normalizeRoomTitle(f);
      const fileName = f.file_name || "파일명 없음";
      const roomTitle = f.room_title || "알 수 없는 방";
      const summary = hasGeneratedSummary(f.summary)
        ? String(f.summary || "").replace(/\s+/g, " ").slice(0, 180)
        : "요약 미생성임.";
      return kohFormatThreeLineItem({
        title: `${idx + 1}. ${fileName}`,
        content: summary,
        location: `${roomTitle} > ${fileName}`,
        person: f.uploader_name || f.sender_name || "공유자 미상",
        date: formatShortDate(f.created_at),
      });
    });
    await kohSendHtml(env, chatId, `<b>최근 저장 자료 ${rows.length}건입니다.</b>\n\n${lines.join("\n\n")}`);
  } catch (e) {
    console.error("handleFilesCommand:", e);
    await sendMessage(env, chatId, `파일 목록 조회 실패함.\n${String(e?.message || e).slice(0, 300)}`);
  }
}

async function handleDebugFiles(env, chatId) {
  try {
    if (!env.DB || !(await tableExists(env, "files"))) {
      await sendMessage(env, chatId, "files 테이블 없음.");
      return;
    }
    const table = await env.DB.prepare(`PRAGMA table_info(files)`).all();
    const columns = (table.results || []).map((c) => c.name).join(", ");
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM files`).first();
    const orderColumn = await columnExists(env, "files", "created_at") ? "created_at" : "id";
    const recent = await env.DB.prepare(`SELECT * FROM files ORDER BY ${orderColumn} DESC LIMIT 5`).all();
    const recentText = (recent.results || []).map((f) =>
      `id=${f.id || ""} / ${f.file_name || ""}\n` +
      `room=${f.room_id || ""} / ${f.room_title || ""}\n` +
      `uploader=${f.uploader_id || ""} / ${f.uploader_name || ""}\n` +
      `sender=${f.sender_name || ""} / mime=${f.mime_type || ""} / ${f.created_at || ""}`
    ).join("\n\n") || "최근 파일 없음";
    const last = env.CONVERSATIONS ? await env.CONVERSATIONS.get("debug_files_last") : "";
    await sendMessage(
      env,
      chatId,
      `files count: ${count?.count || 0}\ncolumns: ${columns || "없음"}\nlast file save: ${last || "기록 없음"}\n\n${recentText}`
    );
  } catch (e) {
    await sendMessage(env, chatId, `debug files 실패\n${String(e?.stack || e?.message || e).slice(0, 1200)}`);
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
  const file = escapeHtml(row.file_name || "파일명 없음");
  const room = escapeHtml(normalizeRoomTitle(row) || "알 수 없는 방");
  const actor = escapeHtml(row.actor || row.uploader_name || row.sender_name || "공유자 미상");
  const date = escapeHtml(formatShortDate(row.created_at));
  return `자료 확인했습니다. 아래 파일을 공유드립니다.\n\n` +
    `📎 <b>${file}</b>\n` +
    `🔎 위치: ${room} &gt; ${file}\n` +
    `👤 공유자: ${actor}\n` +
    `🗓 일자: ${date}`;
}

async function searchFilesForResend(env, text) {
  if (!env.DB || !(await tableExists(env, "files"))) return { files: [], messages: [], exactDateMiss: false, keyword: "" };
  const keyword = extractFileKeyword(text);
  const like = `%${keyword || ""}%`;
  const date = parseDateFilter(text);
  const hasRooms = await tableExists(env, "rooms");
  const hasUsers = await tableExists(env, "users");
  const { hasCanonical } = await getUserNameColumnInfo(env);
  const joins = `${hasRooms ? "LEFT JOIN rooms r ON r.room_id = f.room_id" : ""} ${hasUsers ? "LEFT JOIN users u ON u.telegram_id = f.uploader_id" : ""}`;
  const sourceExpr = hasRooms
    ? `COALESCE(CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' END, CASE WHEN CAST(f.room_id AS INTEGER) < 0 THEN COALESCE(r.room_title, NULLIF(f.room_title, '1:1'), '알 수 없는 방') END, f.room_title, '알 수 없는 방')`
    : `COALESCE(CASE WHEN CAST(f.room_id AS INTEGER) > 0 THEN '1:1' END, NULLIF(f.room_title, ''), '알 수 없는 방')`;
  const actorExpr = hasUsers
    ? (hasCanonical ? "COALESCE(NULLIF(u.canonical_name, ''), NULLIF(u.name, ''), f.uploader_name, f.sender_name, '공유자 미상')" : "COALESCE(NULLIF(u.name, ''), f.uploader_name, f.sender_name, '공유자 미상')")
    : "COALESCE(f.uploader_name, f.sender_name, '공유자 미상')";
  const baseSelect = `
    SELECT f.*, ${sourceExpr} AS joined_room_title, ${actorExpr} AS actor
    FROM files f
    ${joins}
    WHERE (f.file_name LIKE ? OR f.summary LIKE ? OR f.extracted_text LIKE ? OR f.room_title LIKE ?)
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
    files = (await env.DB.prepare(`${baseSelect} AND datetime(f.created_at) >= datetime('now', '-14 days') ORDER BY f.created_at DESC LIMIT 6`)
      .bind(...params).all()).results || [];
  }
  let messages = [];
  if (!files.length && await tableExists(env, "messages")) {
    messages = (await env.DB.prepare(`
      SELECT content, room_title, sender_name, created_at
      FROM messages
      WHERE content LIKE ? AND datetime(created_at) >= datetime('now', '-14 days')
      ORDER BY created_at DESC
      LIMIT 5
    `).bind(like).all()).results || [];
  }
  return { files, messages, exactDateMiss, keyword, date };
}

async function sendFileRow(env, chatId, row) {
  const document = row.telegram_file_id || row.file_id || "";
  if (!document) {
    await sendMessage(env, chatId, "파일 원본 재전송용 ID가 저장되어 있지 않음.");
    return;
  }
  await sendMessage(env, chatId, `자료 확인했습니다. 아래 파일을 공유드립니다.\n📎 ${row.file_name || "파일명 없음"}\n🔎 위치: ${fileLocation(row)}`);
  await sendDocument(env, chatId, document, fileCaption(row));
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
    const lines = candidates.map((f, idx) =>
      kohFormatThreeLineItem({
        title: `${idx + 1}. ${f.file_name || "파일명 없음"}`,
        content: f.summary || f.extracted_text || "요약 없음",
        location: fileLocation(f),
        person: f.actor || f.uploader_name || f.sender_name || "공유자 미상",
        date: formatShortDate(f.created_at),
      })
    );
    await kohSendHtml(env, chatId, `${prefix}자료 후보 ${candidates.length}건입니다.\n\n${lines.join("\n\n")}\n\n원하는 번호를 입력해주세요.`);
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
    const files = (await env.DB.prepare(`
      SELECT 'file' AS type, file_name AS title, summary AS summary, room_title, COALESCE(uploader_name, sender_name) AS actor, created_at, file_name AS location
      FROM files
      WHERE file_name LIKE ? OR summary LIKE ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(like, like).all()).results || [];
    const messages = (await env.DB.prepare(`
      SELECT 'message' AS type, content AS title, content AS summary, room_title, sender_name AS actor, created_at, '' AS location
      FROM messages
      WHERE content LIKE ?
      ORDER BY created_at DESC
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
      const loc = r.location ? `${room} > ${r.location}` : `${room} > ${String(r.title || "").slice(0, 40)}`;
      return kohFormatThreeLineItem({
        title: `${idx + 1}. ${String(r.title || "자료").slice(0, 60)}`,
        content: String(r.summary || "요약 미생성임.").slice(0, 180),
        location: loc,
        person: r.actor || "미상",
        date: formatShortDate(r.created_at),
      });
    });
    return `<b>찾은 자료 ${rows.length}건입니다.</b>\n\n${lines.join("\n\n")}`;
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
      ? (hasCanonical ? "COALESCE(NULLIF(u.canonical_name, ''), NULLIF(u.name, ''), f.uploader_name, f.sender_name, 'unknown')" : "COALESCE(NULLIF(u.name, ''), f.uploader_name, f.sender_name, 'unknown')")
      : "COALESCE(f.uploader_name, f.sender_name, 'unknown')";
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
        m.source_type,
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
        COALESCE(f.summary, f.extracted_text, f.file_name) AS text,
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
          m.source_type,
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
          COALESCE(f.summary, f.extracted_text, f.file_name) AS text,
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
    const typeLabel =
      r.type === "message" ? "대화" :
      r.type === "file" ? "파일" :
      r.type === "meeting" ? "회의록" :
      r.type === "memory" ? "축적 기억" : "자료";
    const extra = r.file_name ? ` / 파일명: ${r.file_name}` : r.title ? ` / 제목: ${r.title}` : "";
    return `[${idx + 1}] ${typeLabel}
room_id: ${r.room_id || ""}
source_type: ${r.source_type || ""}
출처: [${r.source || "출처 미상"}] ${r.actor || "작성자 미상"} (${r.created_at || "시간 미상"})${extra}
내용:
${String(r.text || "").slice(0, 700)}`;
  }).join("\n\n");
}

function isPriorityIntent(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return /(이번주|오늘|보고\s*전|임원|사장님|우선순위|제일\s*먼저|먼저\s*(볼|확인|챙)|챙겨야\s*할|확인해야\s*할|보고해야\s*할|제일\s*급한|주요\s*리스크|확인\s*필요\s*과제)/i.test(t)
    && /(안건|일|것|과제|리스크|우선순위|보고|확인|챙)/i.test(t);
}

function priorityProjectName(text) {
  const t = String(text || "");
  if (/New Vision|비전선포식|선포식|서울랜드|이든|앨리스/i.test(t)) return "SK하이닉스 New Vision 선포식";
  if (/M15|화재|고객사\s*Letter|대외\s*커뮤니케이션|Letter/i.test(t)) return "M15 화재 대응 커뮤니케이션";
  if (/AI Agent|1인\s*1\s*AI|Comm\.?\s*총괄|6R/i.test(t)) return "Comm. 총괄 AI Agent 도입";
  if (/솔리다임|Solidigm|EPIC\s*Semi|MOU|낸드/i.test(t)) return "솔리다임/EPIC Semi MOU 커뮤니케이션";
  const first = t.replace(/\s+/g, " ").slice(0, 28).trim();
  return first ? `${first} 관련 안건` : "최근 업무 안건";
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
               f.uploader_id AS actor_id, COALESCE(f.uploader_name, f.sender_name) AS actor,
               COALESCE(f.summary, f.extracted_text, f.file_name) AS text,
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
      judgment: "고객사 Letter와 대외 커뮤니케이션 리스크가 연결되어 우선 확인 필요성이 큼.",
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
    judgment: "최근 기록에서 반복 확인되어 이번주 우선 확인 후보로 보임.",
    action: "담당자·마감·보고 필요 여부를 먼저 확인 필요.",
  };
}

function formatPriorityAnswer(candidates) {
  if (!candidates.length) return "최근 저장된 업무 기록이 없어 우선순위를 판단할 수 없음.";
  const items = candidates.slice(0, 5).map((item, idx) => {
    const s = summarizePriorityText(item);
    const date = formatShortDate(item.latest);
    const room = [...item.rooms][0] || "알 수 없는 방";
    const actor = [...item.actors][0] || "공유자 미상";
    const file = [...item.files][0] || "";
    const loc = file ? `${room} > ${file}` : `${room} > 관련 메시지`;
    const content = `${s.judgment} / ${s.action}`;
    return kohFormatThreeLineItem({
      title: `${idx + 1}. ${item.name}`,
      content,
      location: loc,
      person: actor,
      date,
    });
  }).join("\n\n");
  return `<b>이번주 챙길 안건 ${candidates.slice(0, 5).length}건입니다.</b>\n\n${items}`;
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
    `아래는 사용자가 포함된 Telegram 방과 1:1에서 수집된 최근 업무 기록이다. 프로젝트/안건 단위로 묶어 요약하라. 단순 나열하지 말고 유사 주제를 병합하라. 각 안건마다 출처 방, 공유자, 일자를 표시하라. 없는 내용은 추정하지 말라.\n\n` +
    `[보고서 출력 형식]\n` +
    `${range.label} 주요 안건 N건 공유드립니다.\n\n` +
    `[프로젝트] 프로젝트/안건명\n` +
    `- 핵심 내용: 1~2문장. 짧게.\n` +
    `- 확인 필요: 다음 액션 1~2문장. 짧게.\n\n` +
    `🗓 일자: MM/DD\n` +
    `👤 공유자: telegram_id 기준 대표 이름\n` +
    `📍 방: 실제 room_title 또는 1:1\n` +
    `📎 자료: 파일명 또는 없음\n` +
    `🔎 위치: 방 제목 > 파일명 또는 방 제목 > 메시지 일부\n\n` +
    `[프로젝트 묶음 규칙]\n` +
    `- 비전선포식/New Vision/선포의 장/서울랜드/이든&앨리스는 같은 프로젝트로 묶어라.\n` +
    `- AI Agent/1인 1 AI Agent/Comm. 총괄/6R Comm 전략팀은 같은 프로젝트로 묶어라.\n` +
    `- M15/화재/고객사 Letter/대외 커뮤니케이션은 같은 프로젝트로 묶어라.\n` +
    `- 같은 파일, 같은 행사, 같은 TF, 같은 회의는 하나로 병합하라.\n` +
    `- 최대 5개 프로젝트, 전체 1500자 이내. 장문 설명 금지.\n\n` +
    `[작성 지침]\n` +
    `너는 ${BOT_OWNER_NAME}의 개인 업무 비서 AI OS입니다.\n` +
    `아래 기록은 이 봇이 직접 들어가 있는 텔레그램 방, 1:1 대화, 파일, 회의록에서 수집한 내용입니다.\n` +
    `단순 나열하지 말고, 사용자가 오늘 확인해야 할 안건 중심으로 압축해 주세요.\n\n` +
    `[출력 형식]\n` +
    `주요 안건 N건임.\n\n` +
    `1. 안건명\n` +
    `* 일자: MM/DD\n` +
    `* 공유자: 이름\n` +
    `* 방: 방이름\n` +
    `* 핵심: 1~2줄임.\n` +
    `* 확인: 필요사항임.\n` +
    `* 자료: 파일명 또는 링크\n\n` +
    `[품질 기준]\n` +
    `1. 최대 5개 안건까지만 선정합니다.\n` +
    `2. 각 안건은 현상, 의미, 확인할 일 중심으로 짧게 씁니다.\n` +
    `3. 업무적으로 중요한 내용만 고릅니다.\n` +
    `4. 잡담, 웃음, 단순 리액션은 제외합니다.\n` +
    `5. 출처는 반드시 [방이름] 공유자명 (시간) 형식으로 표시합니다.\n` +
    `6. 출처 없는 내용은 쓰지 않습니다.\n` +
    `7. 전체 답변은 1500자 이내로 씁니다.\n` +
    `8. 마크다운 기호는 쓰지 않습니다.\n` +
    `\n[최종 출력 강제]\n` +
    `${range.label} 주요 안건 N건 공유드립니다.\n\n` +
    `<b>[프로젝트] 프로젝트명</b>\n` +
    `• <b>핵심</b>: 1~2줄 요약임.\n` +
    `• <b>확인</b>: 확인 필요사항 1줄임.\n\n` +
    `🗓 MM/DD  📍 방 이름\n` +
    `👤 공유자  📎 파일명 또는 없음\n` +
    `📎 자료: 파일명 또는 없음\n` +
    `🔎 위치: 방 이름 &gt; 파일명 또는 방 이름 &gt; 메시지 일부\n\n` +
    `이 형식 외 다른 형식은 사용하지 마라. source_type은 출력하지 마라. HTML 태그는 <b>만 사용하라. 전체 1500자 이내.\n`;
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
  const senderName = await getCanonicalUserName(env, message.from);
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

async function persistIncomingFile(env, message) {
  if (!env.DB || !message?.document || message.from?.is_bot || message._filePersisted) return;
  if (!isSupportedDocument(message)) return;
  try {
    const room = resolveFileRoomInfo(message);
    if (room.sourceType === "telegram_group") {
      await dbRegisterRoom(env, room.roomId, room.roomTitle, BOT_KEY, room.roomType);
    }
    const canonicalName = await getCanonicalUserName(env, message.from);
    await dbSaveFile(env, {
      telegram_file_id: message.document.file_id || "",
      telegram_file_unique_id: message.document.file_unique_id || "",
      roomId: room.roomId,
      roomTitle: room.roomTitle,
      senderId: message.from?.id || "",
      senderName: canonicalName,
      uploaderId: message.from?.id || "",
      uploaderName: canonicalName,
      fileName: message.document.file_name || "document",
      fileType: getDocumentFileType(message.document.file_name || "", message.document.mime_type || ""),
      mimeType: message.document.mime_type || "",
      fileSize: message.document.file_size || 0,
      sourceType: room.sourceType,
      extracted_text: "",
      summary: room.tags.includes("원본방 확인 불가 / 1:1 전달본")
        ? "요약 미생성 / 파일 저장 완료 / 원본방 확인 불가 / 1:1 전달본"
        : "요약 미생성 / 파일 저장 완료",
      tags: ["document", ...room.tags],
    }, { throwOnError: true });
    message._filePersisted = true;
    if (env.CONVERSATIONS) await env.CONVERSATIONS.put("debug_files_last", "파일 메타 저장 성공", { expirationTtl: 86400 });
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

  await handleNewChatMembers(env, message);
  await persistIncomingMessage(env, message);
  await persistIncomingFile(env, message);
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
  if (!message._persisted && chatType !== "private") {
    await upsertRoom(env, message.chat);
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

  // internal knowledge: digest/file/priority 앞에서 먼저 처리
  if (kohIsInternalKnowledgeRequest(text)) {
    const handled = await kohHandleInternalKnowledgeRequest(env, chatId, text, "");
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

  // internal knowledge: digest/file/priority 앞에서 먼저 처리
  if (kohIsInternalKnowledgeRequest(cleanText)) {
    const handled = await kohHandleInternalKnowledgeRequest(env, chatId, cleanText, String(chatId));
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

    const room = resolveFileRoomInfo(message);
    const roomId = room.roomId;
    const roomTitle = room.roomTitle;
    const senderName = await getCanonicalUserName(env, message.from);

    const fileInfo = await tgGetFile(env, fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    // 이미지는 Gemini로, 문서는 Dify로 처리
    if (false && mimeType.startsWith("image/")) {
      const buffer = await fetch(fileUrl).then((r) => r.arrayBuffer());
      const answer = await analyzeImageWithClaude(env, buffer, mimeType, message.caption || "");
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
        summary: answer,
        tags: ["image", "analysis", ...room.tags],
      });
      await sendMessage(env, chatId, answer);
      return;
    }

    const fileBlob = await fetch(fileUrl).then((r) => r.blob());
    let extractedText = "";
    if (getDocumentFileType(fileName, mimeType) === "txt") {
      extractedText = (await fileBlob.text()).slice(0, 4000);
    } else if (getDocumentFileType(fileName, mimeType) === "html") {
      extractedText = htmlToPlainText(await fileBlob.text()).slice(0, 4000);
    }
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

    const summary = result.answer || extractedText || "요약 미생성 / 파일 저장 완료";
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
      fileType: getDocumentFileType(fileName, mimeType),
      mimeType,
      fileSize: message.document?.file_size || 0,
      sourceType: room.sourceType,
      extracted_text: extractedText,
      summary,
      tags: ["document", ...room.tags],
    });
    await sendMessage(env, chatId, summary || "파일은 저장됐으나 요약은 아직 미생성임.");
  } catch (e) {
    console.error("handleFile error:", e);
    await sendMessage(env, chatId, `파일 처리 오류.\n핵심: ${e.message}\n확인: /db_status 필요.`);
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
  return "";
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
  if (!env.DB || !(await tableExists(env, "users"))) return "";
  try {
    const row = await env.DB.prepare(`
      SELECT chat_id, telegram_id
      FROM users
      WHERE COALESCE(chat_id, '') != ''
      ORDER BY last_seen_at DESC
      LIMIT 1
    `).first();
    return String(row?.chat_id || row?.telegram_id || "");
  } catch (error) {
    console.error("resolveDailyBriefingTargetChatId:", error);
    return "";
  }
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
  const today = getTodayKST();
  const isMonday = getKstDayOfWeek() === 1;
  const title = isMonday ? "<b>지난주 주요 안건 공유드립니다.</b>" : "<b>전일 주요 안건 및 오늘 일정 공유드립니다.</b>";
  const section1 = isMonday ? "주요 안건" : "전일 주요 안건";
  const section2 = isMonday ? "이번주 일정" : "오늘 일정";
  const section3 = isMonday ? "이번주 확인 과제" : "오늘 확인 과제";
  const schedules = isMonday ? await getSchedulesForRange(env, today, 7) : await getSchedulesForDate(env, today);
  const scheduleLines = schedules.length
    ? schedules
        .sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`))
        .slice(0, 8)
        .map((s) => `- ${formatShortDate(s.date || today)} ${s.time || ""} ${s.title || s.text || "일정"}`.replace(/\s+/g, " ").trim())
        .join("\n")
    : "- 오늘 일정 데이터가 없습니다.";
  const rows = await fetchDigestRows(env, isMonday ? 7 : 1, 140);
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
      `<b>[프로젝트] 프로젝트/안건명</b>\n` +
      `• <b>핵심</b>: 1~2줄 요약임.\n` +
      `• <b>확인</b>: 확인 필요사항 1줄임.\n\n` +
      `2) ${section2}\n- MM/DD HH:MM 일정명\n\n` +
      `3) ${section3}\n- 확인할 일\n\n` +
      `[규칙]\n` +
      `- 프로젝트별로 병합하고 시간순 나열은 금지.\n` +
      `- source_type은 출력하지 말 것.\n` +
      `- HTML 태그는 <b>만 사용.\n` +
      `- 전체 1200자 이내. 짧고 보고형.\n`;
    const result = await difyChat(env, { query, user: String(adminUser?.id || "admin"), conversationId: "" });
    msg = result.answer || "";
  } catch (error) {
    console.error("sendDailyBriefing:", error);
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeTelegramHtml(value) {
  return escapeHtml(value)
    .replace(/&lt;b&gt;/g, "<b>")
    .replace(/&lt;\/b&gt;/g, "</b>");
}

async function sendMessage(env, chatId, text, options = {}) {
  const clean = options.parseMode === "HTML"
    ? sanitizeTelegramHtml(text).slice(0, 3900)
    : stripMarkdown(text).slice(0, 3900);
  const body = { chat_id: chatId, text: clean };
  if (options.parseMode === "HTML") body.parse_mode = "HTML";
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
