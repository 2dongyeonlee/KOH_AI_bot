const MODEL_FAST = "claude-haiku-4-5-20251001";  // 단순 대화
const MODEL_SMART = "claude-sonnet-4-6";          // 분석·브리핑
const STATUS_TAGS = ["#보고", "#Fup", "#공유", "#일정"];
// ── 자연어 분류 패턴 ──────────────────────────────
const PAT_REPORT   = /보고\s*드립니다|보고드립니다|보고\s*올립니다|말씀\s*드립니다|보고\s*합니다|보고\s*하겠습니다|주요\s*사항|보고\s*내용|보고\s*자료|결과\s*보고|진행\s*보고|현황\s*보고|상황\s*공유|공유\s*드립니다/;
const PAT_SCHEDULE = /일정\s*(변경|확정|공유|안내|반영|업데이트)|참석\s*(부탁|예정|하겠|가능)|일정\s*(입니다|됩니다)|시간\s*확인|날짜\s*변경/;
const PAT_DECISION = /의사결정|결정\s*필요|승인\s*(필요|부탁)|검토\s*(부탁|요청|필요)|어떻게\s*할까요|방향\s*(결정|확인)|피드백\s*(부탁|요청)/;
const BOT_QUERY = /알려줘|보여줘|정리해줘|요약해줘|공유해줘|찾아줘|보내줘|알려주|해줘|해줄래|있나|있어\?|있어요|뭐야|뭐있어|뭐가 있|브리핑|요약|정리|분석|안되는데|반영이 안|해야 할 사항|있을까|있나요/;
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
- 확인이 필요하면 확인 필요 라고만 답한다.
- 짧은 감탄사·칭찬·불만 표현에는 짧게 받아칠 것. 길게 설명하거나 되묻지 않는다.
- 발신자 이름 확인 멘트 금지.
- 구체적 요청 없으면 되묻지 말고 짧게 답하고 끝.
- 다른 구성원에게 메시지 전달 기능이 있음. 단, DB에 chat_id가 있는 사람만 가능. 없으면 직접 연락 부탁드립니다.

답변 형식:
- 문장 끝 "~입니다" 금지. 단답·단어·명사형으로 끝낼 것.
  예) "확인 필요" "3건" "6월 15일" "완료"
- 블릿포인트(•) 적극 사용. 텔레그램 모바일 가독성 기준.
- 긴급·임박 항목(오늘 또는 D-1 이내)은 앞에 [오늘] 또는 [내일] 표시. 이모지·삼각형 사용 금지.
- D-3 이내 마감은 D-N 숫자로만 표시. 별도 이모지 없음.
- 표(|---|) 사용 금지. 블릿으로 대체.
- HTML 태그 사용: <b>강조</b>

외부 검색:
- Tavily 외부 검색이 연동되어 있어 실시간 정보 검색 가능.
- 검색 결과가 있으면 그 내용을 답변에 포함하고 출처 URL 2개만 제공.

기타:
- 이모티콘·이모지 사용 금지. 텍스트만으로 답변.
- 브리핑 포맷의 📅 📌 🔔 💡 📢 🔁 기호는 예외.
- 답변 시 참고한 자료의 출처 방이 있으면 "(출처: 방이름)" 명시.
- 봇 주인(권오혁 담당님)에게는 정중하게 답변.
- 그 외 사람에게는 간결하고 직접적으로 답변.
- 사람들이 서로 대화하는 내용(봇에게 직접 말하지 않는 대화)에는 절대 끼어들지 말 것.
- "알겠습니다", "수정 완료", "확인했습니다" 등 확인·완료 응답은 봇에게 명확히 요청한 경우에만 사용.
- 파일·이미지 저장 완료 사실을 언급하지 말 것.

팀원 텔레그램 표시 이름 매핑 (표시 이름이 다를 수 있음):
- 홍석윤 = 석윤
- 이기두 = Kidu, 기두
- 위예슬 = 예슬
- 황성욱 = 성욱
- 김선영 = SY, 선영
- 김민아 = 민아
사람 이름으로 검색할 때 위 별칭도 함께 찾아볼 것.

분류 기준 (태그가 없어도 내용으로 판단):
- "보고 드립니다 / 공유 드립니다 / 보고드립니다" → 보고
- "일정 변경 / 일정 확정 / 참석 예정" → 일정
- "의사결정 필요 / 검토 부탁 / 승인 요청" → 의사결정
태그와 자연어 중 어느 쪽이든 해당 분류로 처리할 것.

지시어 해석 규칙:
- "이거 / 그거 / 이것 / 그것 / 저것 / 위에 내용 / 방금 내용"은
  [답장 대상 메시지] 또는 [최근 대화 내용]을 가리킨다.
- 반드시 해당 내용을 찾아 요약·분석·정리한다.
- "뭔지 모르겠다"거나 "구체적으로 알려달라"고 되묻지 말 것.
- [답장 대상 메시지]가 있으면 그것을 최우선으로 사용한다.
- 없으면 [최근 대화 내용] 중 가장 관련 있는 것을 사용한다.`;

const REPORT_BRIEFING_FORMAT = `
브리핑 작성 규칙:
- 마크다운(**, __, #) 절대 금지. HTML 태그만 사용.
- 과제·보고명은 반드시 <b>굵게</b>, 사람 이름은 반드시 <u>밑줄</u>.
- 이모지는 섹션 기호만 허용 (📅 📌 🔔 💡 📋).
- 없는 섹션은 전체 생략. "특이사항 없음" 쓰지 말 것.
- 날짜: 오늘 [6/16], 내일 [6/17] 식으로 슬래시 숫자.

섹션 분류 기준 (반드시 준수):

📌 주요 일정 — 아래 조건을 모두 충족해야 함:
- 날짜와 시간이 구체적으로 확정된 예정 행사·배포·회의·보고
- 예: "6/18 08:30 HBM4E 보도자료 배포", "13:30 AI봇 시연"
- 권오혁 담당님이 참석하거나 인지해야 할 외부·내부 일정

🔔 보고 — 아래 조건에 해당:
- 팀장·TL급이 진행 현황·결과·완료 사항을 올리는 것
- 예: "김민아 TL - 외빈 초청 범위 정리 완료", "이기두 TL - BCP 훈련 일정 변경"
- 담당급이라도 진행 상황을 공유하는 성격이면 보고로 분류

💡 의사결정 필요 — 아래 조건에 해당:
- 권오혁 담당님이 직접 판단·승인·방향 결정이 필요한 사항
- 예: "AI봇 응답 범위 제한 여부", "Fab 협력 모델 방향 선택"
- "~할 예정", "~검토 중", "~여부 결정 필요" 등 미결 판단 사항

분류 규칙:
- 동일 항목 두 섹션 중복 금지
- 날짜 확정 + 실행 예정 → 📌 일정
- 보고·공유·완료 → 🔔 보고
- 판단·승인·방향 미결 → 💡 의사결정
- 과거 날짜([오늘]보다 이전) 항목은 📌·🔔에서 제외, 필요 시 📋 주요 내용에만

날짜 필터 규칙 (반드시 준수):
- 오늘 날짜보다 이전인 일정·보고는 📌 일정, 🔔 보고 섹션에 표시하지 말 것.
- 예: 오늘이 6/16이면 [6/15], [6/14] 항목은 두 섹션에서 제외.
- 단, 아직 완료되지 않은 진행 중 사항(날짜가 지났어도 후속 조치 필요)은
  📋 주요 내용에만 표시.
- 날짜 없는 항목은 최근 3일 이내 생성된 것만 포함.

출력 양식:

📅 YYYY-MM-DD Daily Briefing

📌 주요 일정
• [MM/DD] <b>회의·행사명</b> / <u>담당자</u>
 └ 핵심 안건 또는 준비사항

🔔 보고
• [MM/DD] <b>보고명</b> / <u>보고자</u>
 └ 보고 핵심 내용 또는 필요 액션
(날짜는 항상 [M/DD] 형식. 날짜 없는 항목은 날짜 표기 생략)

💡 의사결정 필요
• <b>의사결정 사항</b> / <u>담당자</u>
 └ 배경 또는 기한

📋 주요 내용
• [방이름] <u>담당자</u>
  - <b>핵심 내용 한줄</b>
   └ 상세 내용 또는 후속 필요사항
`;

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

    if (update.my_chat_member) {
      try { await handleChatMemberUpdate(env, update.my_chat_member); }
      catch (e) { console.error("chat_member error", e?.stack || e); }
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
  console.log("handleMessage:", msg.chat?.id, msg.from?.id, 
    (msg.text || "").slice(0, 20));

  const chatId   = msg.chat.id;
  const text     = (msg.text || msg.caption || "").trim();
  const botToken = (env.TELEGRAM_BOT_TOKEN || "").split(":")[0];

  // 봇 자신 메시지 무시
  if (msg.from && String(msg.from.id) === botToken) return;

  // 중복 메시지 처리 방지 (텔레그램 재시도 대응)
  const updateId = String(msg?.message_id || "");
  const msgKey = `msg:${msg.chat?.id}:${updateId}`;
  const already = await env.PROMPT.get(msgKey);
  if (already) return;
  await env.PROMPT.put(msgKey, "1", { expirationTtl: 60 });

  // /설정 명령
  if (text.startsWith("/설정")) {
    const instruction = text.replace("/설정", "").trim();
    await updateSystemPrompt(env, instruction);
    return sendMessage(env, chatId, "반영했습니다.");
  }

  // /reindex 명령 (기존 메시지 Vectorize 색인)
  if (text === "/reindex") {
    return handleReindex(env, chatId);
  }

  const isOwner = String(msg.from?.id) === String(env.BOT_OWNER_ID || "");

  // 파일/이미지 → 멘션 여부 무관하게 항상 저장·분석
  if (msg.document || (msg.photo && msg.photo.length)) {
    await ingestAndSummarize(env, msg, chatId, text);
    if ((await isQueryToBot(env, msg, text)) && text) {
      return handleQuery(env, chatId, cleanMention(text), msg, isOwner);
    }
    return;
  }

  // 텍스트 저장 (잡담 제외) — 라우팅과 무관하게 항상 먼저 저장
  const junk = !text
    || text.length < 3
    || /^[ㄱ-ㅎㅏ-ㅣ\s]+$/.test(text)
    || /^(ㅎㅇ|ㅋ+|ㅎ+|ㅠ+|ㅜ+|ㄷㄷ|ㅇㅇ|ㄴㄴ|ㅇㅋ|ㄱㄱ|ㄹㅇ|ㅈㄹ)$/.test(text.trim());

  if (!junk) {
    await saveMessage(env, msg, text);
  }

  // 업무보고 태그 있으면 handleReport (추가 처리)
  if (!junk && parseReportTags(text).status) {
    return handleReport(env, msg, chatId, text);
  }

  // 봇에게 말 거는 것이면 handleQuery (답변)
  const isShortGreeting =
    msg.chat.type !== "private" &&
    text.length <= 20 &&
    /(안녕|ㅎㅇ|하이|반가|잘있|고마|감사|수고|어떻게|뭐야|뭐해)/.test(text);

  if ((await isQueryToBot(env, msg, text)) || isShortGreeting || BOT_QUERY.test(text)) {
    return handleQuery(env, chatId, cleanMention(text), msg, isOwner);
  }

  // 나머지는 저장만 (응답 없음) — 이미 위에서 저장됨
}

function isJunk(text) {
  if (text.length < 5) return true;
  if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(text)) return true;
  if (/^(ㅎㅇ|ㅋ+|ㅎ+|ㅠ+|ㅜ+|ㄷㄷ|ㅇㅇ|ㄴㄴ|ㅇㅋ|ㄱㄱ|ㄹㅇ)$/.test(text)) return true;
  return false;
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
    if (/\.(jpe?g|png|webp|gif)$/i.test(fileName)) {
      type = "image";
      extracted = await describeImage(env, url, caption);
    } else {
      extracted = await extractDocumentText(env, url, fileName);
    }
  }

  const [answer, storageJson] = await Promise.all([
    callClaude(
      env,
      `SK하이닉스 6R전략실 권오혁 담당님 관점에서 분석.
아래 양식으로만. 없는 항목은 없음. 마크다운 금지.

일정: (캘린더에 넣을 날짜·마감)
의사결정사항: (담당님 판단 필요 사항. 사장님 보고 여부 포함)
핵심 요약: (2~3줄)

문서:
${extracted.slice(0, 6000)}`,
      "",
      MODEL_SMART
    ),
    callClaude(
      env,
      `아래 문서를 분석해서 JSON만 반환. 다른 말 없이 JSON만.
{
  "summary": "파일 제목과 핵심 내용 2줄. 나중에 검색할 때 쓸 키워드 포함.",
  "action_items": "즉시 해야 할 것 1~3가지",
  "needs_escalation": 0
}

문서:
${extracted.slice(0, 3000)}`,
      "",
      MODEL_SMART
    ),
  ]);

  let parsed;
  try {
    parsed = JSON.parse(storageJson.replace(/```json|```/g, "").trim());
  } catch {
    parsed = { summary: extracted.slice(0, 200), action_items: "", needs_escalation: 0 };
  }

  await insertMessage(env, {
    msg,
    content: extracted,
    fileId: fileId,
    fileName: fileName,
    summary: parsed.summary || "",
    action_items: parsed.action_items || "",
    needs_escalation: parsed.needs_escalation || 0,
  });

  // 파일 저장 완료 알림 없음 (묵음 저장)
  return;
}

async function handleScheduleQuery(env, chatId, query) {
  const dateStr = normalizeDateQuery(query);
  const now = new Date(Date.now() + 9 * 3600000);
  const today = now.toISOString().slice(0, 10);

  let fromDate, toDate;
  if (/(오늘|today)/.test(query)) {
    fromDate = today; toDate = today;
  } else if (/(내일|tomorrow)/.test(query)) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    fromDate = toDate = d.toISOString().slice(0, 10);
  } else if (dateStr) {
    fromDate = toDate = dateStr;
  } else {
    fromDate = today;
    const d = new Date(now); d.setDate(d.getDate() + 7);
    toDate = d.toISOString().slice(0, 10);
  }

  // 특정 날짜(오늘/내일) → milestone_date 필수. 범위(이번주) → 최근 2주 이내 NULL 허용
  const isSpecificDate = fromDate === toDate;
  const dateCondition = isSpecificDate
    ? "milestone_date >= ? AND milestone_date <= ?"
    : "(milestone_date >= ? AND milestone_date <= ?) OR (milestone_date IS NULL AND created_at >= datetime('now', '-14 days'))";

  const rows = (await env.DB.prepare(
    `SELECT sender_name, summary, content, milestone_date, status_tag, MIN(rowid) AS rid
     FROM messages
     WHERE status_tag NOT IN ('#Fup')
       AND (
         status_tag = '#일정'
         OR status_tag = '#의사결정'
         OR (status_tag = '#보고' AND milestone_date IS NOT NULL)
         OR content LIKE '%회의%' OR content LIKE '%미팅%'
         OR content LIKE '%행사%' OR content LIKE '%기공식%'
         OR content LIKE '%보고회%' OR content LIKE '%발표회%'
         OR content LIKE '%워크숍%' OR content LIKE '%세미나%'
         OR content LIKE '%일정 변경%' OR content LIKE '%일정 확정%'
         OR content LIKE '%일정 공유%' OR content LIKE '%일정 반영%'
         OR content LIKE '%일정 안내%' OR content LIKE '%참석 부탁%'
         OR content LIKE '%참석 예정%'
         OR content LIKE '%의사결정%' OR content LIKE '%결정 필요%'
         OR content LIKE '%검토 부탁%' OR content LIKE '%승인 필요%'
       )
       AND (${dateCondition})
     GROUP BY COALESCE(NULLIF(summary,''), content), sender_name, milestone_date
     ORDER BY milestone_date ASC, rid DESC
     LIMIT 20`
  ).bind(fromDate, toDate).all()).results || [];

  // 행사/회의 유형 판별 → 후처리 필터
  const wantEvent   = /(행사|기공식|세미나|워크숍|컨퍼런스)/.test(query);
  const wantMeeting = /(회의|미팅)/.test(query);
  let filtered = rows;
  if (wantEvent && !wantMeeting) {
    filtered = rows.filter((r) =>
      /행사|기공식|세미나|워크숍|컨퍼런스|발표회|보고회/.test(r.content || r.summary || ""));
  } else if (wantMeeting && !wantEvent) {
    filtered = rows.filter((r) =>
      /회의|미팅/.test(r.content || r.summary || ""));
  }

  const typeLabel = (wantEvent && !wantMeeting) ? "행사" : (wantMeeting && !wantEvent) ? "회의 일정" : "일정";

  if (!filtered.length) {
    // 폴백: milestone_date 없이 content에 날짜/일정 키워드가 있는 메시지 검색
    const fallbackRows = await (async () => {
      try {
        const d  = new Date(fromDate + "T00:00:00+09:00");
        const mo = String(d.getMonth() + 1);
        const da = String(d.getDate());
        const patterns = [
          `${mo}/${da}`, `${mo}월 ${da}일`, `${mo}월${da}일`,
          `${String(mo).padStart(2,"0")}/${String(da).padStart(2,"0")}`,
        ];
        const isToday    = fromDate === today;
        const isTomorrow = (() => {
          const td = new Date(now); td.setDate(td.getDate() + 1);
          return fromDate === td.toISOString().slice(0, 10);
        })();
        const keywordLikes = [
          ...patterns.map(p => `content LIKE '%${p}%'`),
          ...(isToday    ? ["content LIKE '%오늘%'"]  : []),
          ...(isTomorrow ? ["content LIKE '%내일%'"]  : []),
        ].join(" OR ");

        const r = await env.DB.prepare(
          `SELECT sender_name, summary, content, milestone_date, status_tag, MIN(rowid) AS rid
           FROM messages
           WHERE status_tag NOT IN ('#Fup')
             AND content NOT LIKE '%알려줘%'
             AND content NOT LIKE '%해줘%'
             AND content NOT LIKE '%있나%'
             AND content NOT LIKE '%있어%'
             AND content NOT LIKE '%뭐야%'
             AND content NOT LIKE '%뭐가 있%'
             AND content NOT LIKE '%부탁해요%'
             AND content NOT LIKE '%보여줘%'
             AND content NOT LIKE '%정리해줘%'
             AND content NOT LIKE '%찾아줘%'
             AND length(content) >= 20
             AND (${keywordLikes})
             AND created_at >= datetime('now', '-3 days')
           GROUP BY COALESCE(NULLIF(summary,''), content), sender_name
           ORDER BY created_at DESC
           LIMIT 10`
        ).all();
        return r.results || [];
      } catch (e) {
        console.error("fallback schedule error:", e.message);
        return [];
      }
    })();

    if (fallbackRows.length) {
      filtered = fallbackRows;
    } else {
      return sendMessage(env, chatId,
        `${fromDate} 등록된 ${typeLabel}이 없습니다.\n` +
        `날짜(6/17, 내일 등)와 함께 일정을 공유해주시면 자동으로 인식합니다.`);
    }
  }

  // LLM이 브리핑 양식으로 정리
  const queryLabel = /(오늘|today)/.test(query) ? "오늘"
    : /(내일|tomorrow)/.test(query) ? "내일"
    : "이번주";
  const dateRange = fromDate === toDate ? fromDate : `${fromDate} ~ ${toDate}`;

  const seen = new Set();
  const rawData = filtered.map(row => {
    const body = row.summary || row.content || "";
    const room = row.room_title ? `[${row.room_title}] ` : "";
    const date = row.milestone_date ? ` (${row.milestone_date})` : "";
    const line = `${room}${row.sender_name || ""}${date}: ${body.slice(0, 300)}`;
    return seen.has(line) ? null : (seen.add(line), line);
  }).filter(Boolean).join("\n");

  const schedulePrompt = `오늘: ${today} / 조회 날짜: ${dateRange}

아래 데이터에서 업무 관련 항목 전체를 섹션별로 정리.
포함 기준: 일정·보고·의사결정 모두 포함. 날짜가 없는 항목도 포함.
제외 기준: 봇에게 한 질문, 잡담, 인사, "~하지 않을까요" 같은 논의성 메시지만 제외.
HTML 태그 사용(<b>, <u>). 해당 항목 없는 섹션은 전체 생략.

📅 ${queryLabel} 일정

📌 주요 일정
• [M/DD] <b>내용</b> / <u>담당자</u>
 └ 핵심 사항

🔔 보고
• [M/DD] <b>보고명</b> / <u>담당자</u>
 └ 핵심 내용

💡 의사결정 필요
• <b>사항</b> / <u>담당자</u>
 └ 배경

=== 데이터 ===
${rawData || "관련 데이터 없음"}`;

  const output = await callClaude(env, schedulePrompt, "", MODEL_SMART);
  return sendMessage(env, chatId, output || `${queryLabel} 등록된 일정이 없습니다.`);
}

async function handleQuery(env, chatId, query, msg = null, isOwner = false) {
  if (!query) return sendMessage(env, chatId, "질문 내용을 입력해주세요.");

  // ── 답장 컨텍스트 추출 ──────────────────────────────
  const replyMsg     = msg?.reply_to_message;
  const replyContent = (replyMsg?.text || replyMsg?.caption || "").trim();
  // Reply 메시지에 파일(사진/PDF/PPTX/DOCX 등)이 있으면 직접 분석
  let replyFileAnalysis = "";
  if (replyMsg && !replyContent) {
    try {
      const replyPhoto = replyMsg.photo?.[replyMsg.photo.length - 1];
      const replyDoc   = replyMsg.document;
      if (replyPhoto) {
        // 사진
        const url = await getFileUrl(env, replyPhoto.file_id);
        const result = await describeImage(env, url, query);
        if (result) replyFileAnalysis = `[답장 이미지 분석]\n${result}`;
      } else if (replyDoc) {
        const mime = replyDoc.mime_type || "";
        const name = replyDoc.file_name || "";
        const url  = await getFileUrl(env, replyDoc.file_id);
        if (mime.startsWith("image/")) {
          // 이미지 문서
          const result = await describeImage(env, url, query);
          if (result) replyFileAnalysis = `[답장 이미지 분석]\n${result}`;
        } else if (
          mime === "application/pdf" ||
          mime.includes("presentation") ||   // PPTX
          mime.includes("wordprocessing") ||  // DOCX
          mime.includes("spreadsheet") ||     // XLSX
          mime.includes("ms-powerpoint") ||
          mime.includes("ms-word") ||
          mime.includes("ms-excel") ||
          /\.(pdf|pptx|ppt|docx|doc|xlsx|xls)$/i.test(name)
        ) {
          // 문서류 (PDF/PPTX/DOCX/XLSX)
          const result = await extractDocumentText(env, url, name);
          if (result && result !== "[문서 분석 실패]") {
            replyFileAnalysis = `[답장 문서 분석: ${name}]\n${result.slice(0, 3000)}`;
          }
        }
      }
    } catch (e) {
      console.error("replyFile analyze error:", e.message);
    }
  }
  const replyContext = replyContent
    ? `[답장 대상 메시지]\n${replyMsg?.from?.first_name || ""}: ${replyContent}\n`
    : "";

  // ── 지시어 / 요약단독 감지 ───────────────────────────
  const PRONOUN_PATTERN      = /^(그거|이거|이것|그것|저것|위에|방금|아까|앞에|이\s*내용|그\s*내용|저\s*내용|위\s*내용|이\s*자료|그\s*자료)/;
  const SUMMARY_ONLY_PATTERN = /^(요약|정리|분석|설명|번역|해석)(해줘|해|해봐|해\s*줘|해줄래|해줘요)?$/;
  let isPronounQuery = PRONOUN_PATTERN.test(query.trim()) || SUMMARY_ONLY_PATTERN.test(query.trim());

  const isFileReq = looksLikeFileRequest(query);
  const hasInlineContent = !isFileReq && query.includes("\n") && query.length > 100;

  // 파일 요청이면 브리핑·일정 라우팅으로 절대 빠지지 않는다.
  if (!isFileReq && /브리핑/.test(query)) {
    return runReportBriefing(env, chatId);
  }

  const isScheduleReq =
    !isFileReq &&
    !/브리핑/.test(query) &&
    !/자료|파일|문서|어디/.test(query) &&
    (
      /(일정|스케줄)/.test(query) ||
      /(이번주|오늘|내일|이번달|금주).*(뭐|있|일정|스케줄)/.test(query) ||
      /(회의|미팅|행사).*(언제|일정|뭐|있어|알려|정리|보여)/.test(query)
    );
  if (isScheduleReq) {
    return handleScheduleQuery(env, chatId, query);
  }

  const forwardRequest = parseForwardRequest(query);
  if (forwardRequest) return handleForwardRequest(env, chatId, query, forwardRequest, msg);

  // ── 인라인 내용 직접 분석 (개행 포함 + 길이 > 100) ───
  if (hasInlineContent) {
    const lines      = query.split("\n");
    const instruction = lines[0].trim();
    const body        = lines.slice(1).join("\n").trim();
    const sysP        = await getSystemPrompt(env);
    const toneCtx     = isOwner
      ? "\n\n[현재 대화 상대: 봇 주인 권오혁 담당님. 정중하게 답변.]"
      : "\n\n[현재 대화 상대: 기타 사용자. 간결하고 직접적으로 답변.]";
    const directPrompt = `[직접 제공된 내용]\n${body}\n\n지시: ${instruction}`;
    const answer = await callClaude(env, directPrompt, sysP + toneCtx, MODEL_SMART);
    await saveChatHistory(env, chatId, query, answer);
    await sendMessage(env, chatId, answer);
    await updateBotSession(env, chatId);
    return;
  }

  // 파일 요청: 파일 전용 검색(file_id 보장) → 상위 3개 전송 또는 명확한 안내
  if (isFileReq) {
    // 파일·사진·텍스트 통합 검색 (searchMemory = 하이브리드)
    const allHits  = await searchMemory(env, query);
    const fileHits = allHits.filter(h => h.file_id && h.file_id !== "");
    const textHits = allHits.filter(h => !h.file_id || h.file_id === "");
    let sentCount = 0;
    // 1. 파일·사진 전송
    for (const fh of fileHits.slice(0, 3)) {
      const roomLabel   = fh.room_title  ? `[${fh.room_title}]`  : "";
      const senderLabel = fh.sender_name ? `${fh.sender_name} 공유` : "";
      const attr    = [roomLabel, senderLabel].filter(Boolean).join(" / ");
      const caption = `요청하신 자료입니다.${attr ? ` (${attr})` : ""}\n${fh.file_name || ""}`.trim();
      let result = await sendDocument(env, chatId, fh.file_id, caption);
      // file_id 실패 → copyMessage 폴백 (원본 형식 유지 - 사진도 사진으로)
      if (!result?.ok && fh.room_id && fh.telegram_message_id) {
        result = await copyMessage(env, chatId, fh.room_id, fh.telegram_message_id);
        if (result?.ok) await sendMessage(env, chatId, caption);
      }
      // 파일 전송도 실패 → 텍스트 내용 폴백
      if (!result?.ok) {
        const body = (fh.summary || fh.content || "").slice(0, 600).trim();
        if (body) {
          await sendMessage(env, chatId,
            `파일 전송 실패, 내용 공유합니다.${attr ? ` (${attr})` : ""}\n<b>${fh.file_name || ""}</b>\n\n${body}`);
        }
      } else {
        sentCount++;
      }
    }
    // 2. 파일 없는 텍스트 내용 → LLM이 요약해서 답변
    if (textHits.length > 0) {
      const textContext = textHits.slice(0, 5).map(h => {
        const room   = h.room_title  ? `[${h.room_title}] ` : "";
        const sender = h.sender_name ? `${h.sender_name}: ` : "";
        const body   = (h.summary || h.content || "").slice(0, 400);
        return `${room}${sender}${body}`;
      }).join("\n\n─────\n\n");
      const textPrompt = `사용자 질문: "${query}"\n\n아래 관련 내용 중 질문과 관련된 것을 찾아 정리해줘.\n없는 내용은 만들지 말 것.\n\n${textContext}`;
      const answer = await callClaude(env, textPrompt, "", MODEL_SMART);
      if (answer) await sendMessage(env, chatId, answer);
      sentCount++;
    }
    // 3. 아무것도 없으면
    if (sentCount === 0 && fileHits.length === 0) {
      await sendMessage(env, chatId,
        "관련 자료나 내용을 찾지 못했습니다.\n키워드를 더 구체적으로 알려주시면 다시 찾겠습니다.");
    }
    await saveChatHistory(env, chatId, query,
      fileHits.map(f => f.file_name || "(파일)").join(", ") || "텍스트 내용",
      { files: fileHits.map(f => ({ name: f.file_name || "", room: f.room_title || "" })) }
    );
    await updateBotSession(env, chatId);
    return;
  }

  // 발신자 명시 쿼리면 sender 필터 우선
  const senderHits = await searchBySender(env, query);
  const hits = senderHits || await searchMemory(env, query);

  // ── 지시어/요약 단독: 같은 방 최근 메시지 조회 ────────
  let recentRawContext = "";
  if (isPronounQuery && !replyContent) {
    try {
      const recent = (await env.DB.prepare(`
        SELECT sender_name, content, created_at
        FROM messages
        WHERE room_id = ?
          AND (is_bot_query = 0 OR is_bot_query IS NULL)
          AND length(content) >= 10
        ORDER BY created_at DESC
        LIMIT 5
      `).bind(String(chatId)).all()).results || [];
      const ordered = [...recent].reverse();
      if (ordered.length) {
        recentRawContext = "[최근 대화 내용 (참고용)]\n" +
          ordered.map(r => `${r.sender_name || "누군가"}: ${(r.content || "").slice(0, 300)}`).join("\n");
      }
    } catch (e) {
      console.error("recentRawContext error:", e.message);
    }
  }

  // 내용 질의여도 관련 파일 본문을 컨텍스트에 추가
  let fileContext = "";
  {
    const files = await searchFiles(env, query);
    const topFiles = files
      .map((h) => ({ hit: h, score: scoreFileHit(query, h) }))
      .filter((i) => i.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((i) => i.hit);
    if (topFiles.length) {
      fileContext = "\n\n[관련 파일 내용]\n" +
        topFiles.map((f) =>
          `· ${f.file_name || "(파일)"}\n${(f.summary || f.content || "").slice(0, 1500)}`
        ).join("\n\n");
    }
  }

  const internalContext = hits.length
    ? hits.map((hit) => {
        const room   = hit.room_title ? `(출처: ${hit.room_title}) ` : "";
        const label  = classifyRow(hit);
        // summary와 content 둘 다 제공 (요약이 부실해도 원문으로 보완)
        const summaryText = (hit.summary || "").trim();
        const contentText = (hit.content || "").slice(0, 800).trim();
        const bodyParts = [];
        if (summaryText) bodyParts.push(`요약: ${summaryText}`);
        if (contentText && contentText !== summaryText) bodyParts.push(`원문: ${contentText}`);
        const body = bodyParts.join("\n  ") || "(내용 없음)";
        return `[${label}] ${room}
- 작성자: ${hit.sender_name || ""}
- ${body}
- 마감: ${hit.milestone_date || "없음"}`;
      }).join("\n\n").slice(0, 9000)
    : "";

  const fullContext = [replyContext, replyFileAnalysis, recentRawContext, internalContext].filter(Boolean).join("\n\n");

  let webResults = [];
  let webContext = "";
  const isInternalQuery = /(일정|스케줄|회의|미팅|행사|보고|자료|파일|문서|브리핑|우리|사내|내부|팀|담당|사장|이번주|오늘|내일|이번달)/.test(query);
  const isExternalQuery = /(뉴스|기사|최신|동향|시장|경쟁사|업계|주가|환율|발표했|출시|보도)/.test(query);
  const webAllowed = env.TAVILY_API_KEY && !isInternalQuery && (isExternalQuery || hits.length < 2);
  if (webAllowed) {
    webResults = await searchWeb(env, query);
    console.log("Tavily fired:", webResults.length);
    if (webResults.length) {
      webContext = "\n\n[외부 검색]\n" +
        webResults.map(r => r.title + "\n" + r.snippet + "\n" + r.url).join("\n\n");
    }
  }

  const systemPrompt = await getSystemPrompt(env);
  const toneCtx = isOwner
    ? "\n\n[현재 대화 상대: 봇 주인 권오혁 담당님. 정중하게 답변.]"
    : "\n\n[현재 대화 상대: 기타 사용자. 간결하고 직접적으로 답변.]";
  const effectiveSystem = systemPrompt + toneCtx;

  const history = await getChatHistory(env, chatId);
  const historyContext = history.length
    ? history.map((item) => {
        const fileNote = item.files?.length
          ? `\n(전송 파일: ${item.files.map(f => `${f.name}${f.room ? ` [${f.room}]` : ""}`).join(", ")})`
          : "";
        return `사용자: ${item.q}\n답변: ${item.a}${fileNote}`;
      }).join("\n\n")
    : "";
  const prompt = `
${historyContext ? `직전 대화:\n${historyContext}\n\n` : ""}
${fullContext ? `${fullContext}\n\n` : ""}
${fileContext}
${webContext}

지시:
- [답장 대상 메시지] 또는 [최근 대화 내용]이 있으면 그것을 분석 대상으로 사용
- 내부 자료는 답변 품질을 높이기 위한 참고자료로만 조용히 활용
- 사용자가 명시적으로 파일/자료를 요청한 경우에만 자료 존재를 언급
- 의사결정이 필요한 내용이면 판단 포인트 제시
- 없는 내용은 만들지 않는다

질문: ${query}`;
  let answer = await callClaude(
    env,
    prompt,
    effectiveSystem,
    isComplexQuery(query, false) ? MODEL_SMART : MODEL_FAST
  );
  if (webResults && webResults.length) {
    answer += "\n\n출처";
    webResults.slice(0, 2).forEach(r => {
      answer += "\n• " + r.title + ": " + r.url;
    });
  }

  await saveChatHistory(env, chatId, query, answer);
  await sendMessage(env, chatId, answer);
  await updateBotSession(env, chatId);
}

function parseForwardRequest(query) {
  const match = String(query || "").match(/([가-힣A-Za-z0-9_]{2,20}?)(?:님)?(?:에게|한테|님께)\s*(.*?)(전해줘|전달해줘|알려줘|말해줘)/);
  if (!match) return null;
  const recipient = normalizePersonName(match[1]);
  const content = match[2].replace(/라고$/, "").trim() || "전달 요청";
  return { recipient, content };
}

function normalizePersonName(name) {
  return String(name || "")
    .replace(/^@/, "")
    .replace(/(팀장님|담당님|TL님|님)$/g, "")
    .trim();
}

async function handleForwardRequest(env, chatId, query, request, msg) {
  const sender = senderName(msg?.from) || "사용자";
  const row = await env.DB.prepare(
    `SELECT room_id, sender_name FROM messages
     WHERE sender_name LIKE ?
     AND room_id = sender_id
     LIMIT 1`
  ).bind(`%${request.recipient}%`).first();

  if (row?.room_id) {
    await sendMessage(env, row.room_id, `${sender}님 전달\n\n${request.content}\n\n— ${sender} via KOH봇`);
    return sendMessage(env, chatId, `${formatRecipientName(row.sender_name || request.recipient)}님께 전달 완료했습니다.`);
  }

  const known = await env.DB.prepare(
    `SELECT sender_name FROM messages
     WHERE sender_name LIKE ?
     ORDER BY datetime(created_at) DESC
     LIMIT 1`
  ).bind(`%${request.recipient}%`).first();

  if (known?.sender_name && msg?.chat?.type !== "private") {
    return sendMessage(env, chatId, `@${request.recipient} ${sender}님이 전달: ${request.content}`);
  }

  return sendMessage(env, chatId, "전달 불가. 직접 연락 부탁드립니다.");
}

function formatRecipientName(name) {
  const normalized = normalizePersonName(name);
  if (normalized === "이동연") return "이동연 TL";
  return normalized;
}

async function getChatHistory(env, chatId) {
  const historyKey = `history:${chatId}`;
  try {
    return JSON.parse((await env.PROMPT.get(historyKey)) || "[]").slice(-5);
  } catch {
    return [];
  }
}

async function saveChatHistory(env, chatId, query, answer, extra = {}) {
  const historyKey = `history:${chatId}`;
  const history = await getChatHistory(env, chatId);
  const entry = { q: String(query || "").slice(0, 500), a: String(answer || "").slice(0, 1000) };
  if (extra.files) entry.files = extra.files;
  history.push(entry);
  await env.PROMPT.put(historyKey, JSON.stringify(history.slice(-5)));
}

function isComplexQuery(query, hasFile) {
  if (hasFile) return true;
  if (query.length > 100) return true;
  const complexKeywords =
    /(요약|분석|보고|브리핑|정리|검토|작성|전략|방향|판단|비교|예측)/;
  return complexKeywords.test(query);
}

async function parseForStorage(env, text, statusTag) {
  const prompt = `아래 문서를 분석해서 JSON으로만 답해줘. 
마크다운 없이 순수 JSON만.
각 항목은 반드시 서로 다른 내용이어야 함.
중복 금지.

{
  "summary": "문서 전체 핵심 2줄. 무엇에 관한 문서인지.",
  "action_items": "담당자가 당장 해야 할 구체적 행동 1~3가지. 일정·의사결정·공유와 겹치지 않는 즉시 실행 사항만.",
  "needs_escalation": 0
}

needs_escalation: 사장님 보고·임원 공유·리스크 포함 시 1.

문서: ${text.slice(0, 3000)}`;

  const result = await callClaude(env, prompt, "", MODEL_SMART);
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

async function runReportBriefing(env, replyChatId = null) {
  const targets = replyChatId ? [replyChatId] : await briefingTargets(env);
  if (!targets.length) return;
  const today = kstDateStr();

  const rows = (
    await env.DB.prepare(
      `SELECT content, sender_name, summary, action_items, needs_escalation, status_tag, milestone_date, created_at,
        CASE
          WHEN milestone_date >= date('now') AND milestone_date <= date('now', '+2 days') THEN 1
          ELSE 0
        END AS is_due_soon,
        CASE
          WHEN created_at > datetime('now', '-3 days') THEN 1
          ELSE 0
        END AS is_recent
       FROM messages
       WHERE status_tag != ''
       ORDER BY created_at DESC
       LIMIT 200`
    ).all()
  ).results || [];

  const schedules = rows.filter((row) =>
    row.status_tag !== "#Fup" &&
    (
      row.status_tag === "#일정" ||
      PAT_SCHEDULE.test(row.content || "") ||
      /회의|미팅|행사|기공식|보고회|발표회|워크숍|세미나/.test(row.content || "")
    ) &&
    row.status_tag !== "#보고"
  );
  const reports = rows.filter((row) =>
    (row.status_tag === "#보고" || PAT_REPORT.test(row.content || row.summary || "")) &&
    (row.is_due_soon || row.is_recent || !row.milestone_date)
  );
  const highlights = rows.filter((row) =>
    ["#공유", "#Fup"].includes(row.status_tag) && row.is_recent
  );
  const decisions = rows.filter((row) =>
    row.is_recent && (
      row.needs_escalation === 1 ||
      /결정|확인 필요|승인|검토 요청/.test(row.content || "")
    )
  );

  const rawMsgs = (await env.DB.prepare(
    `SELECT room_title, sender_name, content, summary, created_at
     FROM messages
     WHERE status_tag = ''
       AND created_at >= datetime('now', '-3 days')
       AND length(content) >= 15
       AND room_title NOT IN ('', 'codex-test', '테스트방임', '--')
       AND content NOT LIKE '%보내줘%'
       AND content NOT LIKE '%공유해줘%'
       AND content NOT LIKE '%알려줘%'
       AND content NOT LIKE '%뭐해줄거야%'
       AND content NOT LIKE '%브리핑%'
       AND content NOT LIKE '%자료 있나%'
       AND content NOT LIKE '%어느 방%'
       AND content NOT LIKE '%어떤 방%'
     ORDER BY created_at DESC
     LIMIT 80`
  ).all()).results || [];
  const rawContext = rawMsgs
    .map(r => {
      const room   = r.room_title ? `[${r.room_title}]` : "[DM]";
      const sender = r.sender_name || "";
      const body   = r.summary || (r.content || "").slice(0, 120);
      return `${room} ${sender} / ${body}`;
    })
    .join("\n").slice(0, 4000);

  const taggedContext = [
    `[일정]\n${joinRows(schedules)}`,
    `[보고]\n${joinRows(reports)}`,
    `[의사결정]\n${joinRows(decisions)}`,
    `[주요내용(태그)]\n${joinRows(highlights)}`,
  ].filter(s => !s.endsWith("\n")).join("\n\n");

  const output = await callClaude(
    env,
    `오늘 날짜: ${today}
${REPORT_BRIEFING_FORMAT}

=== [태그 항목] ===
${taggedContext}

=== [주요 내용 원문] ===
아래 내용을 읽고 업무 관련 항목만:
- 일정/보고/의사결정이면 해당 섹션에 추가
- 그 외는 📋 주요 내용에:
  • [방이름] 담당자 / 핵심 한줄
   └ 상세 또는 후속 필요사항
봇에게 한 질문, 잡담, 인사 제외. 중복 금지.
${rawContext || "없음"}`,
    "",
    MODEL_SMART
  );

  for (const id of targets) {
    await sendMessage(env, id, output);
  }
}

async function runInfoBriefing(env) {
  const targets = await briefingTargets(env);
  if (!targets.length) return;

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
${rows.map((row) => row.summary || row.content).join("\n").slice(0, 10000)}`,
    "",
    MODEL_SMART
  );

  for (const id of targets) {
    await sendMessage(env, id, output);
  }
}

async function briefingTargets(env) {
  if (env.BOT_OWNER_ID) return [String(env.BOT_OWNER_ID)];
  const fromEnv = (env.BRIEFING_CHAT_ID || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  let fromDb = [];
  try {
    const r = await env.DB.prepare(`SELECT room_id FROM rooms`).all();
    fromDb = (r.results || []).map((row) => String(row.room_id));
  } catch (e) {
    console.error("briefingTargets DB error:", e.message);
  }
  return [...new Set([...fromEnv, ...fromDb])];
}

async function handleChatMemberUpdate(env, upd) {
  const chat = upd.chat || {};
  const newMember = upd.new_chat_member || {};
  const roomId = String(chat.id || "");
  const roomTitle = chat.title || chat.username || "";
  const botName = newMember.user?.username || "";
  const status = newMember.status || "";

  if (!roomId) return;

  if (status === "member" || status === "administrator") {
    await env.DB.prepare(
      `INSERT INTO rooms (room_id, room_title, bot_name)
       VALUES (?, ?, ?)
       ON CONFLICT(room_id) DO UPDATE SET
         room_title = excluded.room_title,
         bot_name = excluded.bot_name`
    ).bind(roomId, roomTitle, botName).run();
    console.log("rooms upsert:", roomId, roomTitle);
    await sendMessage(env, roomId,
      `안녕하세요! KOH봇입니다. 이 채팅방이 브리핑 대상으로 등록되었습니다.\n` +
      `• 업무 보고: 첫 줄에 #보고 태그\n` +
      `• 일정 등록: 첫 줄에 #일정 태그\n` +
      `• 공유 사항: 첫 줄에 #공유 태그\n` +
      `• 브리핑 요청: @${env.BOT_USERNAME || "KOH_AI_bot"} 브리핑`);
  } else if (status === "left" || status === "kicked") {
    await env.DB.prepare(
      `DELETE FROM rooms WHERE room_id = ?`
    ).bind(roomId).run();
    console.log("rooms delete:", roomId);
  }
}

async function callClaude(env, userText, system = "", model = MODEL_FAST) {
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
      model: model,
      max_tokens: model === MODEL_FAST ? 500 : 1500,
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
  const buf = await imageResponse.arrayBuffer();
  const contentType = detectImageMediaType(imageResponse.headers.get("content-type"), imageUrl, buf);
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
      model: MODEL_SMART,
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
              text: `이 이미지 내용을 한국어로 설명해줘.
마크다운(#,*,**,##,###) 완전 금지. 플레인 텍스트만.
글자·수치 있으면 그대로 읽어줘.
이미지가 문서·보고서·슬라이드 캡처라면:
1. 제목, 날짜, 작성자 추출
2. 핵심 수치·결론 추출
3. 검색 키워드가 될 만한 고유명사 나열${caption ? `\n설명: ${caption}` : ""}`,
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

function detectImageMediaType(contentType, imageUrl, buf) {
  const type = String(contentType || "").split(";")[0].toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) return type;

  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";

  const lowerUrl = String(imageUrl || "").toLowerCase();
  if (lowerUrl.includes(".png")) return "image/png";
  if (lowerUrl.includes(".webp")) return "image/webp";
  if (lowerUrl.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

async function extractOfficeText(buffer) {
  const view = new DataView(buffer);
  const u8   = new Uint8Array(buffer);
  const dec  = new TextDecoder("utf-8", { fatal: false });
  const texts = [];
  let offset = 0;

  while (offset + 30 <= buffer.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;

    const compression = view.getUint16(offset + 8,  true);
    const compSize    = view.getUint32(offset + 18, true);
    const nameLen     = view.getUint16(offset + 26, true);
    const extraLen    = view.getUint16(offset + 28, true);
    const dataOffset  = offset + 30 + nameLen + extraLen;
    const name        = dec.decode(u8.slice(offset + 30, offset + 30 + nameLen));

    const want =
      name === "word/document.xml" ||
      /^ppt\/slides\/slide\d+\.xml$/.test(name) ||
      name === "xl/sharedStrings.xml";

    if (want && compSize > 0) {
      try {
        const compData = u8.slice(dataOffset, dataOffset + compSize);
        let xml = "";

        if (compression === 0) {
          xml = dec.decode(compData);
        } else if (compression === 8) {
          const ds = new DecompressionStream("deflate-raw");
          const w  = ds.writable.getWriter();
          const r  = ds.readable.getReader();
          w.write(compData);
          w.close();
          const chunks = [];
          while (true) {
            const { done, value } = await r.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
          let p = 0;
          for (const c of chunks) { out.set(c, p); p += c.length; }
          xml = dec.decode(out);
        }

        if (xml) {
          const text = xml
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#\d+;/g, " ")
            .replace(/\s+/g, " ").trim();
          if (text.length > 10) texts.push(text);
        }
      } catch (e) {
        console.error("office xml error:", name, e.message);
      }
    }

    offset = dataOffset + Math.max(compSize, 0);
    if (offset <= dataOffset) { offset = dataOffset + 1; }
  }

  return texts.join("\n\n").slice(0, 8000);
}

async function extractDocumentText(env, fileUrl, fileName) {
  const isPdf  = /\.pdf$/i.test(fileName);
  const isDocx = /\.docx$/i.test(fileName);
  const isPptx = /\.pptx$/i.test(fileName);
  const isXlsx = /\.xlsx$/i.test(fileName);

  if (!isPdf && !isDocx && !isPptx && !isXlsx) {
    return `[지원하지 않는 형식: ${fileName} — PDF, DOCX, PPTX, XLSX, 이미지만 처리합니다]`;
  }

  const res = await fetch(fileUrl);
  const buf = await res.arrayBuffer();

  if (buf.byteLength > 32 * 1024 * 1024) {
    return `[파일이 너무 큽니다 — 32MB 이하만 처리 가능합니다]`;
  }

  // ── Office 형식 (ZIP+XML) ────────────────────────────────────
  if (isDocx || isPptx || isXlsx) {
    const rawText = await extractOfficeText(buf);
    if (!rawText || rawText.length < 20) {
      return `[${fileName} — 내용을 읽을 수 없습니다]`;
    }
    const typeLabel = isPptx ? "프레젠테이션" : isDocx ? "문서" : "스프레드시트";
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_SMART,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `이 ${typeLabel}을 SK하이닉스 6R전략실 권오혁 담당님 관점에서 분석해줘.
아래 양식으로만 답해. 없는 항목은 없음.
마크다운(#,*,**) 금지. 플레인 텍스트.

일정: (문서에 나온 날짜·마감 중 캘린더에 넣을 것)
의사결정사항: (담당님이 판단해야 할 사항. 사장님 보고 필요 여부도 포함)
핵심 요약: (문서 전체 맥락 2~3줄)

문서 내용:
${rawText.slice(0, 6000)}`,
        }],
      }),
    });
    const data = await resp.json();
    return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n")
      || "[문서 분석 실패]";
  }

  // ── PDF ────────────────────────────────────────────────────
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
      model: MODEL_SMART,
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
            text: `이 문서를 SK하이닉스 6R전략실 권오혁 담당님 관점에서 분석해줘.
아래 양식으로만 답해. 없는 항목은 없음.
마크다운(#,*,**) 금지. 플레인 텍스트.

일정: (문서에 나온 날짜·마감 중 캘린더에 넣을 것)
의사결정사항: (담당님이 판단해야 할 사항.
               사장님 보고 필요 여부도 포함해서 판단)
핵심 요약: (문서 전체 맥락 2~3줄)`,
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

function inferStatusTag(text, existingTag) {
  if (existingTag) return existingTag;
  if (BOT_QUERY.test(text)) return "";
  if (text.trim().length < 15) return "";
  if (PAT_REPORT.test(text))   return "#보고";
  if (PAT_SCHEDULE.test(text)) return "#일정";
  if (PAT_DECISION.test(text)) return "#의사결정";
  return "";
}

function extractDateFromText(text) {
  if (!text) return "";
  if (BOT_QUERY.test(text)) return "";
  if (text.trim().length < 15) return "";
  const now  = new Date(Date.now() + 9 * 3600000);
  const year = now.getFullYear();

  if (/(내일|tomorrow)/.test(text)) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/모레/.test(text)) {
    const d = new Date(now); d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }
  // 4자리 연도 포함 (2026/06/17, 2026-06-17) — 먼저 확인
  const mFull = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (mFull) {
    return `${mFull[1]}-${String(mFull[2]).padStart(2,"0")}-${String(mFull[3]).padStart(2,"0")}`;
  }
  // M/D 또는 MM/DD
  const m1 = text.match(/(?<!\d)(\d{1,2})[\/\-](\d{1,2})(?!\d)/);
  if (m1 && Number(m1[1]) >= 1 && Number(m1[1]) <= 12 && Number(m1[2]) >= 1 && Number(m1[2]) <= 31) {
    return `${year}-${String(m1[1]).padStart(2,"0")}-${String(m1[2]).padStart(2,"0")}`;
  }
  // M월 D일
  const m2 = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m2) {
    return `${year}-${String(m2[1]).padStart(2,"0")}-${String(m2[2]).padStart(2,"0")}`;
  }
  return "";
}

async function saveMessage(env, msg, content) {
  const inferredTag    = inferStatusTag(content, "");
  const extractedDate  = extractDateFromText(content);
  await insertMessage(env, { msg, content, statusTag: inferredTag, milestoneDate: extractedDate });
}

async function insertMessage(env, options) {
  const {
    msg,
    content,
    statusTag      = "",
    fieldTag       = "",
    milestoneDate  = "",
    fileId         = "",
    fileName       = "",
    summary        = "",
    action_items   = "",
    needs_escalation = 0,
    info_tag       = "",
  } = options;

  let lastRowId = null;
  try {
    const dbResult = await env.DB.prepare(`
      INSERT INTO messages (
        telegram_message_id, room_id, room_title,
        sender_id, sender_name, content,
        status_tag, field_tag, milestone_date,
        file_id, file_name,
        summary, action_items, needs_escalation, info_tag
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      String(msg.message_id   || "0"),
      String(msg.chat?.id     || "0"),
      String(msg.chat?.title  || msg.chat?.username || "DM"),
      String(msg.from?.id     || "0"),
      String(msg.from?.first_name || msg.from?.username || "unknown"),
      String(content          || "").slice(0, 5000),
      String(statusTag),
      String(fieldTag),
      String(milestoneDate),
      String(fileId),
      String(fileName),
      String(summary),
      String(action_items),
      Number(needs_escalation),
      String(info_tag)
    ).run();

    lastRowId = dbResult?.meta?.last_row_id || null;
    console.log("saved ok:", msg.chat?.id,
      msg.from?.first_name, String(content).slice(0, 30));

  } catch (e) {
    console.error("insertMessage FAILED:", e.message);
    console.error("chat:", JSON.stringify(msg.chat));
    console.error("from:", JSON.stringify(msg.from));
    return null;
  }

  // Vectorize 색인 (실패해도 저장은 유지)
  if (lastRowId && env.AI && env.VECTORIZE) {
    try {
      const textToEmbed = [fileName, fileName, summary, content]
        .filter(Boolean).join(" ").slice(0, 6000);
      const vector = await embedText(env, textToEmbed);
      if (vector) {
        await env.VECTORIZE.upsert([{
          id: String(lastRowId),
          values: vector,
          metadata: {
            file_name: String(fileName || ""),
            status_tag: String(statusTag || ""),
          },
        }]);
        console.log("vectorized rowid:", lastRowId);
      }
    } catch (ve) {
      console.error("vectorize upsert error:", ve.message);
    }
  }

  return lastRowId;
}

async function searchFiles(env, query) {
  const terms = searchTerms(query).slice(0, 6);
  if (!terms.length) {
    const r = await env.DB.prepare(
      `SELECT rowid, content, sender_name, summary, milestone_date, file_id, file_name, room_title, telegram_message_id, room_id
       FROM messages
       WHERE file_id IS NOT NULL AND file_id != ''
       ORDER BY created_at DESC LIMIT 20`
    ).all();
    return r.results || [];
  }
  const whereParts = terms.map(() =>
    "(file_name LIKE ? OR content LIKE ? OR summary LIKE ?)");
  const binds = terms.flatMap((t) => {
    const like = `%${t}%`;
    return [like, like, like];
  });
  const r = await env.DB.prepare(
    `SELECT rowid, content, sender_name, summary, milestone_date, file_id, file_name, room_title, telegram_message_id, room_id
     FROM messages
     WHERE file_id IS NOT NULL AND file_id != ''
       AND (${whereParts.join(" OR ")})
     ORDER BY created_at DESC LIMIT 20`
  ).bind(...binds).all();
  return r.results || [];
}

// 쿼리에서 발신자 명시 감지 후 sender_name 필터 검색
async function searchBySender(env, query) {
  const senderPattern = /^(.+?)\s*(TL|팀장|담당|씨|님|이|가|은|는)?\s*(보고한|공유한|공유해준|말한|언급한|올린|전달한|작성한|보낸|이야기한)/;
  const match = query.match(senderPattern);
  if (!match) return null;

  const nameRaw = match[1].replace(/(어제|오늘|이번주|최근|아까)\s*/g, "").trim();
  if (nameRaw.length < 2) return null;

  // NAME_ALIASES에서 해당 이름의 모든 별칭 찾기
  const aliases = Object.entries(NAME_ALIASES).find(([full, list]) =>
    full.includes(nameRaw) || list.some(a => a.includes(nameRaw) || nameRaw.includes(a))
  );
  if (!aliases) return null;

  const [, aliasList] = aliases;
  const senderLikes = aliasList.map(() => "sender_name LIKE ?").join(" OR ");
  const binds = aliasList.map(a => `%${a}%`);

  try {
    const rows = (await env.DB.prepare(
      `SELECT rowid, content, sender_name, summary, action_items,
              milestone_date, file_id, file_name, room_title, telegram_message_id, room_id
       FROM messages
       WHERE (${senderLikes})
         AND length(content) >= 5
       ORDER BY created_at DESC
       LIMIT 10`
    ).bind(...binds).all()).results || [];
    return rows.length > 0 ? rows : null;
  } catch (e) {
    console.error("searchBySender error:", e.message);
    return null;
  }
}

async function searchMemory(env, query) {
  // 키워드 검색과 의미 검색을 항상 병행 → 병합
  let vectorRows = [];
  let likeRows = [];

  // 의미 검색 (Vectorize)
  if (env.AI && env.VECTORIZE) {
    try {
      const qVec = await embedText(env, query);
      if (qVec) {
        const vr = await env.VECTORIZE.query(qVec, { topK: 8, returnMetadata: "all" });
        const ids = (vr.matches || [])
          .map(m => Number(m.id))
          .filter(n => Number.isFinite(n) && n > 0);
        if (ids.length > 0) {
          const ph = ids.map(() => "?").join(",");
          const r = await env.DB.prepare(
            `SELECT rowid, content, sender_name, summary, action_items,
                    milestone_date, file_id, file_name, room_title, room_id, telegram_message_id
             FROM messages WHERE rowid IN (${ph})
             ORDER BY rowid DESC`
          ).bind(...ids).all();
          vectorRows = r.results || [];
        }
      }
    } catch (e) {
      console.error("Vectorize search error:", e.message);
    }
  }

  // 키워드 검색 (LIKE) — 항상 실행
  try {
    likeRows = await likeSearch(env, query);
  } catch (e) {
    console.error("likeSearch error:", e.message);
  }

  // 병합: 키워드 결과를 앞에 (정확도 우선), 중복 제거
  const seen = new Set();
  const merged = [...likeRows, ...vectorRows].filter(r => {
    const key = String(r.rowid || (r.content || "").slice(0, 40));
    return seen.has(key) ? false : (seen.add(key), true);
  });

  console.log(`searchMemory: like=${likeRows.length} vec=${vectorRows.length} merged=${merged.length}`);
  return merged.slice(0, 12);
}

// 사람 목록. 새 팀원 추가 시 이 배열에만 한 줄 추가하면 됨.
// full: 성+이름 / telegram: 텔레그램 표시 형식 / english: 영문명 / extra: 기타 별칭
const PEOPLE = [
  { full: "염성진",  extra: ["사장님"] },
  { full: "권오혁",  telegram: ["오혁 권"],  extra: ["권오혁(A)"] },
  { full: "이동연",  telegram: ["동연 이"] },
  { full: "구정모" },
  { full: "홍석윤" },
  { full: "이기두",  english: "Kidu Lee",    extra: ["Kidu", "kidu"] },
  { full: "위예슬",  telegram: ["예슬 위"] },
  { full: "황성욱",  telegram: ["성욱 황"] },
  { full: "김선영",  telegram: ["선영 김"],  extra: ["SY", "sy", "SY Kim"] },
  { full: "김민아",  telegram: ["민아 김"] },
  { full: "성봉구",  english: "Bonggu Sung" },
  { full: "손경배" },
  { full: "한혜승" },
  { full: "황무연",  english: "Moo Yeon" },
  { full: "함동균" },
  { full: "박호현" },
  { full: "양서진" },
  { full: "심슬아",  extra: ["Shim"] },
];

// 자동 변형 생성: "황성욱" → ["황성욱", "성욱", "성욱 황"] + extra/english
function buildNameAliases(people) {
  const result = {};
  for (const p of people) {
    const full      = p.full;
    const lastName  = full.slice(0, 1);
    const firstName = full.slice(1);
    const variants  = new Set([
      full,
      firstName,
      `${firstName} ${lastName}`,
    ]);
    (p.telegram || []).forEach(t => variants.add(t));
    if (p.english) {
      variants.add(p.english);
      variants.add(p.english.split(" ")[0]);
    }
    (p.extra || []).forEach(e => variants.add(e));
    result[full] = [...variants];
  }
  return result;
}

const NAME_ALIASES = buildNameAliases(PEOPLE);

function expandWithAliases(terms) {
  const expanded = [...terms];
  for (const [, aliases] of Object.entries(NAME_ALIASES)) {
    if (terms.some(t => aliases.some(a => t.toLowerCase().includes(a.toLowerCase())))) {
      aliases.forEach(a => { if (!expanded.includes(a)) expanded.push(a); });
    }
  }
  return expanded;
}

async function likeSearch(env, query) {
  const dateStr = normalizeDateQuery(query);
  const terms = expandWithAliases(searchTerms(query).slice(0, 6));
  if (!terms.length && !dateStr) return [];

  const whereParts = terms.map(() => "(content LIKE ? OR summary LIKE ? OR file_name LIKE ? OR sender_name LIKE ?)");
  const binds = terms.flatMap((term) => {
    const like = `%${term}%`;
    return [like, like, like, like];
  });
  if (dateStr) {
    const [, month, day] = dateStr.match(/\d{4}-(\d{2})-(\d{2})/) || [];
    whereParts.push("milestone_date = ?");
    binds.push(dateStr);
    whereParts.push("(content LIKE ? AND content LIKE ?)");
    binds.push(`%${Number(month)}월%`, `%${Number(day)}일%`);
  }
  const where = whereParts.join(" OR ");

  const rows = await env.DB.prepare(
    `SELECT rowid, content, sender_name, summary, action_items,
            milestone_date, file_id, file_name, room_title, room_id, telegram_message_id
     FROM messages
     WHERE (${where})
     ORDER BY datetime(created_at) DESC
     LIMIT 15`
  ).bind(...binds).all();

  return rows.results || [];
}

function classifyRow(row) {
  const text = row.summary || row.content || "";
  if (row.status_tag === "#보고"       || PAT_REPORT.test(text))   return "보고";
  if (row.status_tag === "#일정"       || PAT_SCHEDULE.test(text)) return "일정";
  if (row.status_tag === "#의사결정"   || PAT_DECISION.test(text)) return "의사결정";
  if (row.status_tag === "#공유" || row.status_tag === "#Fup")     return "공유";
  return "공유";
}

function searchTerms(query) {
  const stopWords = /^(자료|파일|문서|보내|보내줘|주세요|전달|전달해|올려줘|공유해줘|찾아줘|다운|다운로드|있나|있어|보낸자료)$/;
  const terms = String(query || "")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .flatMap((term) => {
      const cleaned = term
        .replace(/[?.!,。，]/g, "")
        .replace(/(팀장님께서|담당님께서|TL님께서|팀장님이|담당님이|TL님이|팀장님|담당님|TL님|님께서|님이|님)$/g, "")
        .replace(/(께서|에게서|한테서|이|가|은|는|을|를|의)$/g, "")
        .replace(/(관련된|관련|에대한|에대해|보고한|내용)$/g, "");
      const eng = term.match(/[A-Za-z0-9]{2,}/g) || [];
      return [term, cleaned, ...eng];
    })
    .filter((term) => term.length >= 2 && !stopWords.test(term));

  return [...new Set(terms)];
}

function scoreFileHit(query, hit) {
  const terms = searchTerms(query);
  const fileName = String(hit.file_name || "").toLowerCase();
  const summary = String(hit.summary || "");
  const content = String(hit.content || "");
  const sender = String(hit.sender_name || "");
  let score = 0;

  for (const term of terms) {
    const lower = term.toLowerCase();
    if (fileName.includes(lower)) score += 5;
    if (sender.includes(term)) score += 4;
    if (summary.includes(term)) score += 3;
    if (content.includes(term)) score += 1;
  }

  if (/(자료|파일|문서|발표자료)/.test(query) && hit.file_id) score += 1;
  return score;
}

function normalizeDateQuery(query) {
  const now = new Date(Date.now() + 9 * 3600000);
  const year = now.getFullYear();
  const today = now.toISOString().slice(0, 10);

  if (/(오늘|today)/.test(query)) return today;
  if (/(내일|tomorrow)/.test(query)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/(모레)/.test(query)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }
  if (/(어제)/.test(query)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (/(그저께|그제)/.test(query)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }

  // 1순위: YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD (4자리 연도 포함 — 반드시 먼저)
  const mFull = query.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (mFull) return `${mFull[1]}-${String(mFull[2]).padStart(2, "0")}-${String(mFull[3]).padStart(2, "0")}`;

  // 2순위: M/D 또는 MM/DD — 4자리 숫자 경계 제외
  const m1 = query.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (m1) return `${year}-${String(m1[1]).padStart(2, "0")}-${String(m1[2]).padStart(2, "0")}`;

  // 3순위: M월 D일
  const m2 = query.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m2) return `${year}-${String(m2[1]).padStart(2, "0")}-${String(m2[2]).padStart(2, "0")}`;

  // 4순위: M월 D (일 생략)
  const m3 = query.match(/(\d{1,2})월\s*(\d{1,2})/);
  if (m3) return `${year}-${String(m3[1]).padStart(2, "0")}-${String(m3[2]).padStart(2, "0")}`;

  return null;
}

async function embedText(env, text) {
  const vecs = await embedBatch(env, [String(text || "")]);
  return vecs[0] || null;
}

// 여러 텍스트를 한 번의 AI 호출로 임베딩 (서브요청 절감)
async function embedBatch(env, texts) {
  if (!env.AI || !texts.length) return [];
  try {
    const result = await env.AI.run("@cf/baai/bge-m3", {
      text: texts.map((t) => String(t || "").slice(0, 2000)),
    });
    return result?.data || [];
  } catch (e) {
    console.error("embedBatch error:", e.message);
    return [];
  }
}

// 커서 기반 청크 색인. 한 번에 CHUNK건만 처리하고 진행 위치를 KV에 저장.
// 200건 넘는 경우에도 /reindex 를 반복 전송하면 이어서 색인된다.
async function handleReindex(env, chatId) {
  if (!env.AI || !env.VECTORIZE) {
    return sendMessage(env, chatId,
      "AI 또는 Vectorize 미설정. wrangler.toml 확인 필요.");
  }

  const CHUNK = 150;
  let offset = Number((await env.PROMPT.get("reindex:offset")) || "0");

  let rows = [];
  try {
    const r = await env.DB.prepare(
      `SELECT rowid, content, summary, file_name, status_tag
       FROM messages ORDER BY rowid LIMIT ? OFFSET ?`
    ).bind(CHUNK, offset).all();
    rows = r.results || [];
  } catch (e) {
    console.error("reindex D1 query error:", e.message);
    return sendMessage(env, chatId, "D1 조회 오류: " + e.message);
  }

  if (!rows.length) {
    await env.PROMPT.delete("reindex:offset");
    return sendMessage(env, chatId,
      offset > 0
        ? `색인 완료. 총 ${offset}건 색인됨.`
        : "색인할 데이터가 없습니다.");
  }

  const texts = rows.map((row) =>
    [row.file_name, row.file_name, row.summary, row.content]
      .filter(Boolean).join(" ").slice(0, 6000));

  // 청크 안에서 10건씩 나눠 임베딩 (모델 배치 한도 회피)
  const SUB = 10;
  const embeddings = [];
  for (let i = 0; i < texts.length; i += SUB) {
    const part = await embedBatch(env, texts.slice(i, i + SUB));
    for (let j = 0; j < part.length; j++) embeddings[i + j] = part[j];
  }

  let indexed = 0;
  let errors = 0;
  const vectors = rows.map((row, i) => ({
    id: String(row.rowid),
    values: embeddings[i],
    metadata: {
      file_name: String(row.file_name || ""),
      status_tag: String(row.status_tag || ""),
    },
  })).filter((v) => Array.isArray(v.values) && v.values.length > 0);

  errors = rows.length - vectors.length;

  if (vectors.length > 0) {
    try {
      await env.VECTORIZE.upsert(vectors);
      indexed = vectors.length;
    } catch (e) {
      errors += vectors.length;
      indexed = 0;
      console.error("vectorize upsert error:", e.message);
    }
  }

  const newOffset = offset + rows.length;
  await env.PROMPT.put("reindex:offset", String(newOffset), { expirationTtl: 3600 });

  const done = rows.length < CHUNK;
  if (done) {
    await env.PROMPT.delete("reindex:offset");
    return sendMessage(env, chatId,
      `색인 완료\n• 이번: ${indexed}건 (오류 ${errors})\n• 누계: ${newOffset}건`);
  }

  return sendMessage(env, chatId,
    `색인 진행 중: ${indexed}건 (오류 ${errors})\n누계 ${newOffset}건\n` +
    `계속하려면 /reindex 다시 전송`);
}

async function searchWeb(env, query) {
  if (!env.TAVILY_API_KEY) {
    console.log("searchWeb: TAVILY_API_KEY 없음");
    return [];
  }
  console.log("searchWeb 호출:", query);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query: query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
        exclude_domains: [
          "instagram.com", "facebook.com", "tiktok.com",
          "youtube.com", "x.com", "twitter.com", "pinterest.com",
          "threads.net", "blog.naver.com",
        ],
      }),
    });
    console.log("Tavily 응답 status:", res.status);
    const data = await res.json();
    console.log("Tavily results:", data.results?.length || 0);
    return (data.results || []).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content || "",
    }));
  } catch (e) {
    console.error("searchWeb error:", e.message);
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
  const res = await fetch(`${telegramApi(env)}/sendDocument`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, document: fileId, caption }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("sendDocument FAILED:", data.error_code, data.description, "file_id:", fileId);
  }
  return data;
}

// 원본 방에서 메시지를 복사 전송 (file_id 무효 시 폴백)
async function copyMessage(env, chatId, fromChatId, messageId) {
  try {
    const res = await fetch(`${telegramApi(env)}/copyMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        from_chat_id: fromChatId,
        message_id: Number(messageId),
      }),
    });
    const data = await res.json();
    if (!data.ok) console.error("copyMessage FAILED:", data.error_code, data.description);
    return data;
  } catch (e) {
    console.error("copyMessage error:", e.message);
    return { ok: false };
  }
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

async function isQueryToBot(env, msg, text) {
  if (msg.chat.type === "private") return !!text;
  const entities = msg.entities || [];
  const hasMention = entities.some((e) => e.type === "mention");
  const botName = (env.BOT_USERNAME || "").toLowerCase();
  const mentionedByName = botName && text.toLowerCase().includes(`@${botName}`);
  const isReply = !!msg.reply_to_message?.from?.is_bot;
  if (hasMention || mentionedByName || isReply) return true;

  // 맥락 연속성: 최근 10분 내 봇이 이 방에서 응답했으면 멘션 없이도 응답
  try {
    const row = await env.DB.prepare(
      `SELECT last_reply_at FROM bot_sessions WHERE room_id = ?`
    ).bind(String(msg.chat.id)).first();
    if (row?.last_reply_at) {
      const lastReply = new Date(row.last_reply_at + "Z");
      const diffMin = (Date.now() - lastReply.getTime()) / 60000;
      if (diffMin <= 10) return true;
    }
  } catch (e) { console.error("session check error", e.message); }

  return false;
}

async function updateBotSession(env, chatId) {
  if (!String(chatId).startsWith("-")) return;   // 단체방만
  try {
    await env.DB.prepare(
      `INSERT INTO bot_sessions (room_id, last_reply_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(room_id) DO UPDATE SET last_reply_at = excluded.last_reply_at`
    ).bind(String(chatId)).run();
  } catch (e) { console.error("session update error", e.message); }
}

function cleanMention(text) {
  return text.replace(/@\w+/g, "").trim();
}

function looksLikeFileRequest(query) {
  if (/(일정|스케줄|브리핑|보고 일정|회의|미팅).*(공유|알려|보여|정리|뭐)/.test(query)) return false;
  if (/(오늘|내일|이번주|이번달|금주).*(일정|스케줄|공유해|알려|보여)/.test(query)) return false;
  // 요약/정리/분석 의도면 파일 요청 아님
  if (/(요약|정리|분석|설명|번역)(해줘|해|해봐|줘)?$/.test(query.trim())) return false;
  // 지시어로 시작하면 파일 요청 아님 (이 자료, 그거, 방금 등)
  if (/^(이|그|저|이거|그거|저거|이것|그것|저것|이 자료|그 자료|방금|위에|앞에)/.test(query.trim())) return false;
  return /((자료|파일|문서|발표자료|보고서|패키지|package|pdf|ppt|장표).*(보내|전달|올려|공유|다운|다운로드|줘|주세요)|보내줘|전달해|올려줘|찾아서 줄래|다운로드)/.test(query);
}

function senderName(from) {
  return [from?.first_name, from?.last_name].filter(Boolean).join(" ") || from?.username || "";
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function calcDday(dateStr) {
  if (!dateStr) return "";
  const target = new Date(dateStr + "T00:00:00+09:00");
  const m = target.getMonth() + 1;
  const d = target.getDate();
  return `[${m}/${d}]`;
}

function joinRows(rows) {
  if (!rows.length) return "";
  return rows.map((row) => {
    const room   = row.room_title ? `[${row.room_title}]` : "";
    const dday   = calcDday(row.milestone_date);
    const sender = row.sender_name || "담당자 미상";
    const body   = row.summary || (row.content || "").slice(0, 120);
    return [room, dday, sender, body].filter(Boolean).join(" / ");
  }).join("\n").slice(0, 3000);
}

function kstDate(ms) {
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
}

function kstDateStr() {
  return kstDate(Date.now());
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatKstDateLabel(dateStr) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const day = days[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
  return `${dateStr}(${day})`;
}

function textFromClaude(data) {
  return (data.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

