# KOH_AI_bot

Cloudflare Workers 기반 Telegram AI 비서봇입니다. 이 브랜치는 기존 대형 Worker를 `worker.js` 단일 슬림 버전으로 교체한 배포용 구성입니다.

## 기능

- Telegram webhook 수신 및 200 OK 응답
- 일반 텍스트, PDF, 이미지 내용을 D1 `messages` 테이블에 저장
- PDF 텍스트 추출은 `unpdf` 사용
- 이미지는 Anthropic Claude Vision으로 설명 텍스트화
- 봇 호출 또는 DM 질문에 Claude로 답변
- D1 기록에서 키워드 검색 후 답변 컨텍스트로 사용
- 파일 요청 시 저장된 Telegram `file_id`로 문서 재전송
- KST 08:00 cron 브리핑
- `/설정 ...` 명령으로 KV `PROMPT`의 시스템 프롬프트 보강

## 필수 설정

Secrets:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
```

Vars in `wrangler.toml`:

- `BRIEFING_CHAT_ID`: 아침 브리핑을 받을 채팅 ID
- `INFO_ROOM_IDS`: 정보방 채팅 ID 목록, 쉼표 구분
- `REPORT_ROOM_IDS`: 업무보고방 채팅 ID 목록, 쉼표 구분
- `BOT_USERNAME`: 봇 username, `@` 제외

Bindings:

- D1: `DB`
- KV: `PROMPT`

## 설치

```bash
npm install
```

## D1 migration

기존 DB에 슬림 Worker용 컬럼을 추가합니다.

```bash
npx wrangler d1 execute 6r-ai-db --remote --file migrations/0014_slim_worker_messages.sql
```

## 검증

```bash
npm run check
```

## 배포

```bash
npm run deploy
```

## Telegram 보고방 입력 형식

보고방에서는 첫 줄에 상태 태그를 넣어야 저장됩니다.

```text
#보고 #6RMonthly
- 업무명: 6월 6R Monthly 준비
- 진행내용: 2026-06-10 회의 기반 초안 작성 중
- 마일스톤: 2026-06-12
```

상태 태그:

- `#보고`
- `#Fup`
- `#공유`
- `#일정`

분야 태그는 두 번째 태그로 자유롭게 사용할 수 있습니다. 예: `#6RMonthly`, `#AI`, `#KPI`.
