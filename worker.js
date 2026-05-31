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

  if (text.trim() === "/관리자등록") {
    await handleAdminRegister(userId, chatId, env);
    return;
  }

  const adminId = await getAdminId(env);
  const isAdmin = adminId !== null && userId === adminId;

  if (hasFile) {
    await handleFile(message, userId, chatId, isAdmin, env);
    return;
  }

  if (isAdmin && text.trim()) {
    await handleAdminMessage(userId, chatId, text.trim(), env);
    return;
  }
}

// ─────────────────────────────────────────────
// /관리자등록
// ─────────────────────────────────────────────
async function handleAdminRegister(userId, chatId, env) {
  const existing = await env.USERS.get("admin_id");
  if (existing) {
    await sendMessage(env, chatId, "이미 관리자가 등록되어 있습니다.");
    return;
  }
  await env.USERS.put("admin_id", userId);
  await sendMessage(env, chatId, "✅ 관리자로 등록됐습니다.");
}

async function getAdminId(env) {
  const kv = await env.USERS.get("admin_id");
  return kv || env.ADMIN_ID || null;
}

// ─────────────────────────────────────────────
// ADMIN 자유 대화
// ─────────────────────────────────────────────
async function handleAdminMessage(userId, chatId, text, env) {
  try {
    const conversationId = (await env.CONVERSATIONS.get(`conv_${userId}`)) || "";
    const newConversationId = await difyStream(env, chatId, {
      query: text,
      user: userId,
      conversationId,
    });
    if (newConversationId) {
      await env.CONVERSATIONS.put(`conv_${userId}`, newConversationId);
    }
  } catch (e) {
    console.error("handleAdminMessage error:", e);
    await sendMessage(env, chatId, `❌ 오류 발생\n${e.message}`);
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
      ? (await env.CONVERSATIONS.get(`conv_${userId}`)) || ""
      : "";

    const newConversationId = await difyStream(env, chatId, {
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

    if (isAdmin && newConversationId) {
      await env.CONVERSATIONS.put(`conv_${userId}`, newConversationId);
    }
  } catch (e) {
    console.error("handleFile error:", e);
    await sendMessage(env, chatId, `❌ 파일 처리 오류\n${e.message}`);
  }
}

// ─────────────────────────────────────────────
// Dify streaming API → SSE 파싱 → Telegram 전송
// ─────────────────────────────────────────────
async function difyStream(env, chatId, { query, user, conversationId = "", files = [] }) {
  // 1. Dify API 호출 (streaming)
  const body = { inputs: {}, query, response_mode: "streaming", user };
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
    throw new Error(`Dify API ${res.status}: ${err}`);
  }

  // 2. response.body를 ReadableStream으로 읽기
  const reader = res.body.getReader();
  // 3. TextDecoder로 디코딩
  const decoder = new TextDecoder();
  let answer = "";
  let newConversationId = "";
  let buffer = "";
  let sent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // 불완전한 마지막 줄 다음 청크로 이월

    for (const line of lines) {
      // 4. "data: "로 시작하는 줄만 파싱
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;

      try {
        const parsed = JSON.parse(raw);

        // 5. agent_message 이벤트 → answer 누적
        if (parsed.event === "agent_message" && parsed.answer) {
          answer += parsed.answer;
        }

        // 6. message_end 이벤트 → 누적된 텍스트 텔레그램 전송
        if (parsed.event === "message_end") {
          newConversationId = parsed.conversation_id || "";
          await sendMessage(env, chatId, answer || "응답을 받지 못했어요.");
          sent = true;
        }
      } catch (_) {
        // 파싱 불가 라인 무시
      }
    }
  }

  // message_end 없이 스트림이 끝난 경우 fallback 전송
  if (!sent && answer) {
    await sendMessage(env, chatId, answer);
  }

  return newConversationId;
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
