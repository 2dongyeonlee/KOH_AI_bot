# KOH_AI_bot

Cloudflare Worker 기반 Telegram 업무 비서봇입니다.

## 핵심 흐름

1. Telegram update 수신
2. `my_chat_member` 수신 시 `rooms` 저장
3. `message` 수신 시 `users`, `rooms`, `room_members`, `messages` 먼저 저장
4. slash command 처리
5. 그룹방은 mention/reply일 때만 응답
6. digest 요청은 최근 7일 D1 기록 기준 요약
7. 뉴스/검색 요청은 Tavily만 사용
8. 그 외 요청은 Dify 일반 응답

## 필수 설정

- `TELEGRAM_BOT_TOKEN`
- `DIFY_API_KEY`
- `TAVILY_API_KEY`
- `EXTERNAL_SEARCH_ENABLED=true`

## 배포 방법

### 로컬 배포

1. Node.js 설치
2. 의존성 설치

```bash
npm install
```

3. Cloudflare 로그인

```bash
npx wrangler login
```

4. 배포

```bash
npx wrangler deploy
```

### Cloudflare GitHub 자동 배포

Cloudflare Pages/Workers Git 연동 배포 설정에서 deploy command를 아래처럼 지정합니다.

```bash
npx wrangler deploy
```

## 검증

```bash
npm run check
npm run deploy
```

Telegram에서 확인:

```text
/db_status
/rooms
/files
/search_status
/web_test SK하이닉스 HBM
오늘 공유된 주요 안건 정리해줘
지난번 비전선포식 자료 어디 있지?
```

파일 저장 확인:

```text
1:1 또는 단체방에 PDF 업로드 후 /db_status, /files 실행
```

deploy trigger: 2026-06-07

Commit changes
→ Commit directly to claude/ecstatic-carson-CVsrs

## room/file canonical cleanup

테스트방 삭제와 `private_dm`/`telegram_group` 오류 정리는 아래 migration으로 적용합니다.

```bash
npx wrangler d1 execute 6r-ai-db --remote --file migrations/0009_room_file_canonical_cleanup.sql
```

`files.source_type` 컬럼이 있을 때만 아래 SQL을 별도로 실행합니다.

```bash
npx wrangler d1 execute 6r-ai-db --remote --command "UPDATE files SET source_type = 'telegram_private' WHERE CAST(room_id AS INTEGER) > 0;"
npx wrangler d1 execute 6r-ai-db --remote --command "UPDATE files SET source_type = 'telegram_group' WHERE CAST(room_id AS INTEGER) < 0;"
```

## Project Briefing Format

주요 안건 요약은 프로젝트별로 묶어서 짧게 출력합니다.

```text
지난주 주요 안건 N건 공유드립니다.

[프로젝트] 프로젝트/안건명
- 핵심 내용: 1~2문장
- 확인 필요: 다음 액션 1~2문장

🗓 일자: MM/DD
👤 공유자: 대표 이름
📍 방: 실제 방 제목 또는 1:1
📎 자료: 파일명 또는 없음
🔎 위치: 방 제목 > 파일명
```

## Canonical User Name

공유자 이름은 `telegram_id` 기준으로 `users.canonical_name`을 우선 사용합니다.
컬럼이 없거나 값이 없으면 `users.name`을 사용합니다.
이름 후보가 여러 개 쌓이면 1:1 DM에서 대표 이름 선택을 요청합니다.

```bash
npx wrangler d1 execute 6r-ai-db --remote --file migrations/0010_user_canonical_name.sql
```

## 08:00 DM Briefing

Cloudflare cron `0 23 * * *`는 KST 08:00에 실행됩니다.
월요일은 지난주 안건과 이번주 일정/과제를, 화요일~일요일은 전일 안건과 오늘 일정/과제를 운영자 DM으로 보냅니다.

수동 테스트:

```text
/briefing_mock
지난주 내가 포함된 방들에서 공유된 내용을 프로젝트별로 요약해줘
/files
/rooms
```
