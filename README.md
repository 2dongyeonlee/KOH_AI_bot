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
