const CLAUDE_MODEL = "claude-sonnet-4-6";
const STATUS_TAGS = ["#보고", "#Fup", "#공유", "#일정"];
const DEFAULT_SYSTEM_PROMPT =
  `너는 SK하이닉스 6R전략실 권오혁 담당의 전담 AI 비서 권오혁(A)다.

호칭: 염성진→사장님, 팀장→OO팀장님, 담당→OO담당님, TL→OO TL님

6R전략실: 권오혁 담당, 구정모 팀장, 성봉구 팀장,
김선영 TL, 홍석윤 TL, 이동연 TL, 위예슬 TL,
이기두 TL, 김민아 TL, 황성욱 TL

커뮤니케이션 본부: 염성진 사장님, 권오혁 담당님,
황무연 담당님, 함동균 담당님, 손경배 담당님,
한혜승 담당님, 박호현 담당님, 양서진 담당님, 원정호 담당님

답변 원칙:
- 존댓말. 짧고 간결하게. 바로 본론.
- 강조할 내용은 <b>텍스트</b> 형식으로 표시.
- 마크다운(**,#,*) 완전 금지. HTML 태그만 사용.
- 이모티콘은 적절히 사용 가능.
- 끝맺음 인사 금지. 무엇을 도와드릴까요 금지.
- 추측하지 않는다. 없는 정보는 만들지 않는다.
- 확인이 필요하면 확인이 필요합니다 라고만 답한다.`;

const REPORT_BRIEFING_FORMAT = `아래 4개 그룹을 한국어로 정리하세요.
담당자명 반드시 포함. 내용 없는 그룹은 특이사항 없음.
마크다운(#,*,**) 금지. 플레인 텍스트. 존댓말.

[일정] 이번주 주요 일정 (날짜순)
형식: 날짜(요일) / 담당자 / 업무명 / 장소·참석자(있으면)
오늘 일정은 맨 위 오늘 표시

[보고] 보고 임박 D-7
형식: 담당자 / 업무명 / 진행내용 / 마감일
의사결정 필요 사항 있으면 별도 표시

[공유] 최근 2일 공유
형식: 담당자 / 핵심내용 1줄

[Fup] 최근 2일 Fup
형식: 담당자 / 현황 1줄`;

const INFO_BRIEFING_FORMAT = `정보방 내용을 한국어로 요약하세요.
없는 항목은 특이사항 없음. 마크다운·이모티콘 금지. 플레인 텍스트.

[Daily 정보 요약]
정책 :
국회 :
BH(대통령실) :
글로벌 :`;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok");

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("ok");
    }

    const msg = update.message;
    if (!msg) return new Response("ok");

    try {
      await handleMessage(env, msg);
    } catch (error) {
      console.error("handleMessage error", error?.stack || error);
    }

    return new Response("ok");
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runMorningBriefing(env));
  },
};

async function handleMessage(env, msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || "").trim();
  const botToken = (env.TELEGRAM_BOT_TOKEN || "").split(":")[0];
  if (msg.from && String(msg.from.id) === botToken) return;

  if (text.startsWith("/설정")) {
    const instruction = text.replace("/설정", "").trim();
    await updateSystemPrompt(env, instruction);
    return sendMessage(env, chatId, "반영했습니다.");
  }

  if (msg.document || (msg.photo && msg.photo.length)) {
    return ingestAndSummarize(env, msg, chatId, text);
  }

  const isShortGreeting =
    msg.chat.type !== "private" &&
    text.length <= 20 &&
    /(안녕|ㅎㅇ|하이|반가|잘있|고마|감사|수고|어떻게|뭐야|뭐해)/.test(text);
  if (isQueryToBot(env, msg, text) || isShortGreeting) {
    return handleQuery(env, chatId, cleanMention(text));
  }

  if (text && parseReportTags(text).status) {
    return handleReport(env, msg, chatId, text);
  }

  if (text) await saveMessage(env, msg, text);
}

function parseReportTags(text) {
  const firstLine = text.split("\n")[0] || "";
  const tags = firstLine.match(/#\S+/g) || [];
  const status = tags.find((tag) => STATUS_TAGS.includes(tag)) || "";
  const field = tags.find((tag) => !STATUS_TAGS.includes(tag)) || "";
  return { status, field };
}

function extractMilestoneDate(text) {
  const match = text.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

async function handleReport(env, msg, chatId, text) {
  const { status, field } = parseReportTags(text);
  const milestoneDate = extractMilestoneDate(text);
  if (!status) {
    return sendMessage(
      env,
      chatId,
      "첫 줄에 상태 태그가 필요합니다. 예: #보고 #6RMonthly\n상태 태그: #보고 #Fup #공유 #일정\n태그 사이에는 공백을 넣어주세요."
    );
  }

  const parsed = await parseForStorage(env, text, status);

  await insertMessage(env, {
    msg,
    content: text,
    summary: parsed.summary,
    action_items: parsed.action_items,
    needs_escalation: parsed.needs_escalation,
    statusTag: status,
    fieldTag: field,
    milestoneDate,
  });

  if (milestoneDate) {
    const dday = Math.ceil(
      (new Date(milestoneDate) - new Date(kstDateStr())) / 86400000
    );
    if (dday >= 0 && dday <= 1) {
      const chatIds = (env.BRIEFING_CHAT_ID || "").split(",").filter(Boolean);
      for (const id of chatIds) {
        await sendMessage(
          env,
          id,
          `[D-${dday} 알림] ${msg.from?.first_name || ""}님 보고
${parsed.summary}
마감: ${milestoneDate}
(주말에도 챙겨드립니다. 죄송합니다 😅)`
        );
      }
    }
  }

  if (parsed.needs_escalation === 1) {
    const chatIds = (env.BRIEFING_CHAT_ID || "").split(",").filter(Boolean);
    for (const id of chatIds) {
      await sendMessage(
        env,
        id,
        `[사장님 보고 검토] ${msg.from?.first_name || ""}님 보고
${parsed.summary}
판단 필요: ${parsed.action_items || "확인이 필요합니다"}`
      );
    }
  }
}

async function ingestAndSummarize(env, msg, chatId, caption) {
  let extracted = "";
  let fileId = "";
  let fileName = "";
  let type = "file";

  if (msg.photo && msg.photo.length) {
    type = "image";
    fileId = msg.photo[msg.photo.length - 1].file_id;
    fileName = `image_${msg.message_id || Date.now()}.jpg`;
    const url = await getFileUrl(env, fileId);
    extracted = await describeImage(env, url, caption);
  } else if (msg.document) {
    fileId = msg.document.file_id;
    fileName = msg.document.file_name || "file";
    const url = await getFileUrl(env, fileId);
    extracted = await extractDocumentText(env, url, fileName);
  }

  const parsed = await parseForStorage(env, extracted, "");

  await insertMessage(env, {
    msg,
    content: extracted,
    summary: parsed.summary,
    action_items: parsed.action_items,
    needs_escalation: parsed.needs_escalation,
    fileId,
    fileName,
  });

  return sendMessage(env, chatId, formatActionBriefing(parsed));
}

async function handleQuery(env, chatId, query) {
  if (!query) return sendMessage(env, chatId, "질문 내용을 입력해주세요.");

  const hits = await searchMemory(env, query);
  const fileHit = hits.find((hit) => hit.file_id);

  if (looksLikeFileRequest(query) && fileHit) {
    await sendDocument(
      env,
      chatId,
      fileHit.file_id,
      `요청하신 자료입니다. ${fileHit.file_name || ""}`.trim()
    );
  }

  const internalContext = hits.length
    ? hits.map((hit) =>
        `[${hit.sender_name || ""}] ${hit.summary || hit.content.slice(0, 200)}` +
        (hit.action_items ? `\n액션: ${hit.action_items}` : "") +
        (hit.milestone_date ? `\n마감: ${hit.milestone_date}` : "")
      ).join("\n\n").slice(0, 5000)
    : "";

  const SEARCH_TRIGGERS =
    /(동향|트렌드|최신|사례|정책|법안|발의|해외|글로벌|경쟁사|시장|여론|언론|뉴스)/;
  let webContext = "";
  if (SEARCH_TRIGGERS.test(query) && env.BRAVE_API_KEY) {
    const results = await searchWeb(env, query);
    if (results.length) {
      webContext = "\n\n[외부 검색]\n" +
        results.map((result) => `${result.title}\n${result.snippet}\n${result.url}`).join("\n\n");
    }
  }

  const systemPrompt = await getSystemPrompt(env);
  const prompt = `
${internalContext ? `내부 자료:\n${internalContext}\n\n` : ""}
${webContext}

지시:
- 내부 자료가 있으면 "OO님이 올리신 자료가 있습니다" 형식으로 먼저 언급
- 관련 자료가 논의와 연결되면 선제적으로 요약 제공
- 의사결정이 필요한 내용이면 판단 포인트 제시
- 없는 내용은 만들지 않는다

질문: ${query}`;
  const answer = await callClaude(
    env,
    prompt,
    systemPrompt
  );

  return sendMessage(env, chatId, answer);
}

async function parseForStorage(env, text, statusTag) {
  const prompt = `아래 텍스트를 분석해서 JSON으로만 답해줘.
다른 말 하지 말고 JSON만. 마크다운 코드블록도 없이 순수 JSON만.

{
  "summary": "핵심 내용 2~3줄. 담당자명 포함.",
  "action_items": "다음 액션·의사결정·공유 필요사항. 없으면 빈 문자열.",
  "needs_escalation": 0
}

needs_escalation 판단 기준 (1로 설정):
- 사장님 보고/결재가 필요한 내용
- 임원 공유가 필요한 중요 이슈
- 대외 커뮤니케이션 방향 결정 필요
- 리스크 또는 기회 요인 포함

상태태그: ${statusTag || "없음"}
텍스트: ${text.slice(0, 3000)}`;

  const result = await callClaude(env, prompt);
  try {
    const clean = result.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return {
      summary: parsed.summary || text.slice(0, 100),
      action_items: parsed.action_items || "",
      needs_escalation: parsed.needs_escalation === 1 ? 1 : 0,
    };
  } catch {
    return { summary: text.slice(0, 100), action_items: "", needs_escalation: 0 };
  }
}

function formatActionBriefing(parsed) {
  const actionItems = parsed.action_items || "없음";
  const escalation = parsed.needs_escalation === 1 ? "있음" : "없음";

  return `[액션 브리핑]

챙길 일정
→ ${actionItems}

의사결정 필요
→ ${actionItems}

사장님 보고 필요
→ ${escalation}

공유 필요
→ ${parsed.needs_escalation === 1 ? actionItems : "없음"}

다음 액션
→ ${actionItems}

핵심 요약
→ ${parsed.summary || "확인이 필요합니다"}`;
}

async function runMorningBriefing(env) {
  const kstDay = new Date(Date.now() + 9 * 3600000).getDay();
  if (kstDay === 0 || kstDay === 6) return;

  await runReportBriefing(env);
  await runInfoBriefing(env);
}

async function runReportBriefing(env) {
  if (!env.BRIEFING_CHAT_ID) return;

  const rows = (
    await env.DB.prepare(
      `SELECT content, sender_name, summary, action_items, status_tag, milestone_date, created_at,
        CASE
          WHEN milestone_date >= date('now') AND milestone_date <= date('now', '+7 days') THEN 1
          ELSE 0
        END AS is_due_soon,
        CASE
          WHEN created_at > datetime('now', '-2 days') THEN 1
          ELSE 0
        END AS is_recent
       FROM messages
       WHERE status_tag != ''
       ORDER BY created_at DESC
       LIMIT 200`
    ).all()
  ).results || [];

  const schedules = rows.filter((row) => row.status_tag === "#일정");
  const reports = rows.filter(
    (row) => row.status_tag === "#보고" && row.is_due_soon
  );
  const shares = rows.filter((row) => row.status_tag === "#공유" && row.is_recent);
  const fups = rows.filter((row) => row.status_tag === "#Fup" && row.is_recent);

  const output = await callClaude(
    env,
    `${REPORT_BRIEFING_FORMAT}

=== [일정] ===
${joinRows(schedules)}

=== [보고] ===
${joinRows(reports)}

=== [공유] ===
${joinRows(shares)}

=== [Fup] ===
${joinRows(fups)}`
  );

  const chatIds = (env.BRIEFING_CHAT_ID || "").split(",").filter(Boolean);
  for (const id of chatIds) {
    await sendMessage(env, id, output);
  }
}

async function runInfoBriefing(env) {
  if (!env.BRIEFING_CHAT_ID) return;

  const rows = (
    await env.DB.prepare(
      `SELECT content, summary
       FROM messages
       WHERE status_tag = '' AND created_at > datetime('now', '-1 days')
       ORDER BY created_at`
    ).all()
  ).results || [];

  if (!rows.length) return;

  const output = await callClaude(
    env,
    `${INFO_BRIEFING_FORMAT}

=== 정보방 내용 ===
${rows.map((row) => row.summary || row.content).join("\n").slice(0, 10000)}`
  );

  const chatIds = (env.BRIEFING_CHAT_ID || "").split(",").filter(Boolean);
  for (const id of chatIds) {
    await sendMessage(env, id, output);
  }
}

async function callClaude(env, userText, system = DEFAULT_SYSTEM_PROMPT) {
  const effectiveSystem =
    system && system !== DEFAULT_SYSTEM_PROMPT
      ? `${DEFAULT_SYSTEM_PROMPT}\n\n추가 지시:\n${system}`
      : DEFAULT_SYSTEM_PROMPT;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: effectiveSystem,
      messages: [{ role: "user", content: userText }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Claude API error", data);
    return "응답 생성 중 오류가 발생했습니다.";
  }

  return textFromClaude(data) || "응답을 생성하지 못했습니다.";
}

async function describeImage(env, imageUrl, caption) {
  const imageResponse = await fetch(imageUrl);
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  const buf = await imageResponse.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: contentType,
                data: b64,
              },
            },
            {
              type: "text",
              text: `이미지 내용을 한국어로 설명하고, 글자나 수치가 보이면 그대로 읽어주세요.${caption ? ` 설명: ${caption}` : ""}`,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Claude Vision error", data);
    return "[이미지 설명 생성 실패]";
  }

  return textFromClaude(data) || "[이미지에서 내용을 추출하지 못했습니다]";
}

async function extractDocumentText(env, fileUrl, fileName) {
  if (!/\.pdf$/i.test(fileName)) {
    return `[지원하지 않는 형식: ${fileName} — PDF와 이미지만 처리합니다]`;
  }

  const res = await fetch(fileUrl);
  const buf = await res.arrayBuffer();

  if (buf.byteLength > 32 * 1024 * 1024) {
    return "[PDF 파일이 너무 큽니다 — 32MB 이하만 처리 가능합니다]";
  }

  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: b64,
            },
          },
          {
            type: "text",
            text: `이 문서의 내용을 한국어로 상세히 분석해줘.
다음 순서로 정리:
1. 문서 목적 (1줄)
2. 핵심 내용 (항목별)
3. 주요 수치·일정 (있으면)
4. 확인이 필요한 사항 (있으면)
마크다운(#,*,**) 금지. 플레인 텍스트.`,
          },
        ],
      }],
    }),
  });

  const data = await response.json();
  return (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n") || "[문서 분석 실패]";
}

async function saveMessage(env, msg, content) {
  await insertMessage(env, { msg, content });
}

async function insertMessage(env, options) {
  const {
    msg,
    content,
    summary = "",
    action_items = "",
    needs_escalation = 0,
    statusTag = "",
    fieldTag = "",
    milestoneDate = "",
    fileId = "",
    fileName = "",
  } = options;

  try {
    await env.DB.prepare(
      `INSERT INTO messages (
        telegram_message_id, room_id, room_title, sender_id, sender_name, content,
        summary, action_items, needs_escalation,
        status_tag, field_tag, milestone_date, file_id, file_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      String(msg.message_id || ""),
      String(msg.chat?.id || "0"),
      msg.chat?.title || "DM",
      String(msg.from?.id || "0"),
      senderName(msg.from),
      content || "(내용 없음)",
      summary || "",
      action_items || "",
      needs_escalation === 1 ? 1 : 0,
      statusTag,
      fieldTag,
      milestoneDate,
      fileId,
      fileName
    ).run();
  } catch (e) {
    console.error(
      "insertMessage error:",
      e.message,
      "room:",
      msg.chat?.id,
      "sender:",
      msg.from?.id
    );
  }
}

async function searchMemory(env, query) {
  const terms = query.split(/\s+/).filter((term) => term.length >= 2).slice(0, 5);
  if (!terms.length) return [];

  const where = terms.map(() => "content LIKE ?").join(" OR ");
  const binds = terms.map((term) => `%${term}%`);

  const rows = await env.DB.prepare(
    `SELECT content, sender_name, summary, action_items, milestone_date, file_id, file_name
     FROM messages
     WHERE (${where}) AND created_at > datetime('now', '-2 days')
     ORDER BY datetime(created_at) DESC
     LIMIT 8`
  ).bind(...binds).all();

  return rows.results || [];
}

async function searchWeb(env, query) {
  if (!env.BRAVE_API_KEY) return [];
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&country=KR&lang=ko`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": env.BRAVE_API_KEY,
        },
      }
    );
    const data = await res.json();
    return (data.web?.results || []).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.description || "",
    }));
  } catch {
    return [];
  }
}

async function getSystemPrompt(env) {
  return (await env.PROMPT.get("system")) || "";
}

async function updateSystemPrompt(env, instruction) {
  if (!instruction) return;
  const previous = await getSystemPrompt(env);
  await env.PROMPT.put("system", `${previous}\n[지시] ${instruction}`.trim());
}

async function sendMessage(env, chatId, text) {
  await fetch(`${telegramApi(env)}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || "").slice(0, 3900),
      parse_mode: "HTML",
    }),
  });
}

async function sendDocument(env, chatId, fileId, caption) {
  await fetch(`${telegramApi(env)}/sendDocument`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, document: fileId, caption }),
  });
}

async function getFileUrl(env, fileId) {
  const response = await fetch(`${telegramApi(env)}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram getFile failed: ${JSON.stringify(data)}`);
  return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

function telegramApi(env) {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
}

function isQueryToBot(env, msg, text) {
  if (msg.chat.type === "private") return !!text;
  const entities = msg.entities || [];
  const hasMention = entities.some((e) => e.type === "mention");
  const botName = (env.BOT_USERNAME || "").toLowerCase();
  const mentionedByName = botName && text.toLowerCase().includes(`@${botName}`);
  const isReply = !!msg.reply_to_message?.from?.is_bot;
  return hasMention || mentionedByName || isReply;
}

function cleanMention(text) {
  return text.replace(/@\w+/g, "").trim();
}

function looksLikeFileRequest(query) {
  return /(자료|파일|문서|보내|전달|찾아)/.test(query);
}

function senderName(from) {
  return [from?.first_name, from?.last_name].filter(Boolean).join(" ") || from?.username || "";
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function joinRows(rows) {
  return rows.map((row) =>
    `${row.sender_name || "담당자 미상"} - ${row.summary || row.content.slice(0, 100)}
액션: ${row.action_items || "없음"}
마감: ${row.milestone_date || "없음"}`
  ).join("\n---\n").slice(0, 3000) || "특이사항 없음";
}

function kstDate(ms) {
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
}

function kstDateStr() {
  return kstDate(Date.now());
}

function textFromClaude(data) {
  return (data.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

