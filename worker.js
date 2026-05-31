const TELEGRAM_API = `https://api.telegram.org/bot`;
const SUMMARY_PROMPT =
  "다음 파일의 내용을 핵심만 3줄로 요약해줘. 각 줄은 번호를 붙여줘. 한국어로.";

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

  const adminId = await getAdminId(env);
  const isAdmin = adminId !== null && userId === adminId;

  // 파일 업로드 (ADMIN + 팀원 모두)
  if (hasFile) {
    await handleFile(message, userId, chatId, isAdmin, env);
    return;
  }

  // ADMIN 텍스트 → Dify 대화
  if (isAdmin && text.trim()) {
    await handleAdminMessage(userId, chatId, text.trim(), env);
    return;
  }

  // 팀원 텍스트 → 무시
}

// ─────────────────────────────────────────────
// /관리자등록
// ─────────────────────────────────────────────
async function handleAdminRegister(userId, chatId, env) {
  const existing = await env.BOT_KV.get("admin_id");
  if (existing) {
    await sendMessage(env, chatId, "이미 관리자가 등록되어 있습니다.");
    return;
  }
  await env.BOT_KV.put("admin_id", userId);
  await sendMessage(env, chatId, "✅ 관리자로 등록됐습니다.");
}

async function getAdminId(env) {
  const kv = await env.BOT_KV.get("admin_id");
  return kv || env.ADMIN_ID || null;
}

// ─────────────────────────────────────────────
// ADMIN 자유 대화
// ─────────────────────────────────────────────
async function handleAdminMessage(userId, chatId, text, env) {
  try {
    const conversationId = (await env.BOT_KV.get(`conv_${userId}`)) || "";
    const result = await difyChat(env, {
      query: text,
      user: userId,
      conversationId,
    });
    if (result.conversation_id) {
      await env.BOT_KV.put(`conv_${userId}`, result.conversation_id);
    }
    await sendMessage(env, chatId, result.answer || "응답을 받지 못했어요.");
  } catch (e) {
    console.error("difyChat error:", e);
    await sendMessage(env, chatId, "오류가 발생했어요. 잠시 후 다시 시도해주세요.");
  }
}

// ─────────────────────────────────────────────
// 파일 요약
// ─────────────────────────────────────────────
async function handleFile(message, userId, chatId, isAdmin, env) {
  try {
    // 1) Telegram 파일 메타 추출
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

    // 2) Telegram → 파일 바이너리 다운로드
    const fileInfo = await tgGetFile(env, fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
    const fileBlob = await fetch(fileUrl).then((r) => r.blob());

    // 3) Dify 파일 업로드
    const uploaded = await difyUploadFile(env, fileBlob, fileName, mimeType, userId);
    if (!uploaded.id) throw new Error("Dify 파일 업로드 실패: " + JSON.stringify(uploaded));

    // 4) ADMIN이면 대화 맥락 유지, 팀원은 독립 세션
    const conversationId = isAdmin
      ? (await env.BOT_KV.get(`conv_${userId}`)) || ""
      : "";

    const result = await difyChat(env, {
      query: SUMMARY_PROMPT,
      user: userId,
      conversationId,
      files: [
        {
          type: difyFileType(mimeType),
          transfer_method: "local_file",
          upload_file_id: uploaded.id,
        },
      ],
    });

    if (isAdmin && result.conversation_id) {
      await env.BOT_KV.put(`conv_${userId}`, result.conversation_id);
    }

    await sendMessage(env, chatId, result.answer || "요약 중 오류가 발생했어요.");
  } catch (e) {
    console.error("handleFile error:", e);
    await sendMessage(
      env,
      chatId,
      "파일 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
    );
  }
}

// ─────────────────────────────────────────────
// Dify API
// ─────────────────────────────────────────────
async function difyChat(env, { query, user, conversationId, files = [] }) {
  const body = {
    inputs: {},
    query,
    response_mode: "blocking",
    user,
  };
  if (conversationId) body.conversation_id = conversationId;
  if (files.length > 0) body.files = files;

  const res = await fetch(`${env.DIFY_API_URL}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dify chat error ${res.status}: ${err}`);
  }
  return res.json();
}

async function difyUploadFile(env, blob, fileName, mimeType, userId) {
  const form = new FormData();
  form.append("file", new File([blob], fileName, { type: mimeType }));
  form.append("user", userId);

  const res = await fetch(`${env.DIFY_API_URL}/files/upload`, {
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
    `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const data = await res.json();
  return data.result;
}

async function sendMessage(env, chatId, text) {
  await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
