# Cloudflare Worker webhook setup

Run D1 migration before testing:

```bash
npx wrangler d1 execute 6r-ai-db --remote --file=./migrations/0004_personal_ai_os.sql
npx wrangler d1 execute 6r-ai-db --remote --file=./migrations/0006_external_sources.sql
```

Set Telegram webhook with room membership updates enabled:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "<WORKER_WEBHOOK_URL>",
    "allowed_updates": ["message", "edited_message", "my_chat_member", "chat_member"]
  }'
```

Test order:

```text
/db_status
/rooms
/search_status
/web_test 하이닉스 HBM
/image_status
```

Notes:

- `/db_status` and other slash commands are routed before Dify or any SQL diagnostic path.
- `/sql` is admin-only and accepts only `SELECT` or `PRAGMA`.
- Group and private messages are persisted before group response filtering.
