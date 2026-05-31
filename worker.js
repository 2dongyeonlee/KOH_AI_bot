const DIFY_API_URL = "https://api.dify.ai/v1";
const SUMMARY_PROMPT =
  "다음 파일의 내용을 핵심만 3줄로 요약해줘. 각 줄은 번호를 붙여줘. 한국어로.";
const TONE_RULE =
  "[응답 규칙: 존댓말 격식체 사용. ^^ 이모티콘 사용 금지. 불필요한 감탄사 사용 금지.]\n\n";

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
};

// ─────────────────────────────────────────────
// 메시지 라우팅
// ─────────────────────────────────────────────
async function handleUpdate(update, env) {
  const message = update.message;
  if (!message) return;

  const userId = String(message.from.id);
  const chatId = message.chat.id;
  const text = message.text || message.caption || "";
  const hasFile = !!(message.document || message.photo);

  // /관리자등록
  if (text.trim() === "/관리자등록") {
    await handleAdminRegister(userId, chatId, env);
    return;
  }

  const isAdmin = await checkIsAdmin(userId, env);

  // 파일 업로드 → 누구든 자동 요약
  if (hasFile) {
    await handleFile(message, userId, chatId, isAdmin, env);
    return;
  }

  // ADMIN 텍스트 → Dify 대화
  if (isAdmin && text.trim()) {
    await handleAdminMessage(userId, chatId, text.trim(), env);
    return;
  }

  // 그 외 텍스트 → 무시
}

// ─────────────────────────────────────────────
// /관리자등록
// ─────────────────────────────────────────────
async function handleAdminRegister(userId, chatId, env) {
  await env.USERS.put("admin_id", userId);
  await sendMessage(env, chatId, `등록 완료! 회원님의 텔레그램 ID: ${userId}`);
}

async function checkIsAdmin(userId, env) {
  if (env.ADMIN_TELEGRAM_ID && userId === String(env.ADMIN_TELEGRAM_ID)) return true;
  const kvAdmin = await env.USERS.get("admin_id");
  return kvAdmin !== null && userId === kvAdmin;
}

// ─────────────────────────────────────────────
// ADMIN 자유 대화
// ─────────────────────────────────────────────
async function handleAdminMessage(userId, chatId, text, env) {
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
    await sendMessage(env, chatId, result.answer || "응답을 받지 못했어요.");
  } catch (e) {
    console.error("handleAdminMessage error:", e);
    await sendMessage(env, chatId, `❌ 오류 발생\n${e.message}`);
  }
}

// ─────────────────────────────────────────────
// 파일 요약 (누구든 가능)
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
// Dify API (streaming — Agent 앱 전용)
// ─────────────────────────────────────────────
async function difyChat(env, { query, user, conversationId = "", files = [] }) {
  const body = {
    inputs: {},
    query,
    response_mode: "streaming",
    user,
  };
  if (conversationId) body.conversation_id = conversationId;
  if (files.length > 0) body.files = files;

  const res = await fetch(`${DIFY_API_URL}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DIFY_API_KEY}`,
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
        if (parsed.event === "agent_message" && parsed.answer) {
          answer += parsed.answer;
        }
        if (parsed.event === "message_end") {
          newConversationId = parsed.conversation_id || "";
        }
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
    headers: { Authorization: `Bearer ${env.DIFY_API_KEY}` },
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
