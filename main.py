import asyncio
import logging
import os

from dotenv import load_dotenv
from telegram import Update
from telegram.error import NetworkError
from telegram.ext import Application, ApplicationBuilder, MessageHandler, filters

from bot.handlers import handle_message, handle_register_admin
from bot.scheduler import start_scheduler

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
GROUP_CHAT_ID = int(os.environ.get("GROUP_CHAT_ID") or "0")


async def main() -> None:
    # updater=None → Updater 클래스를 생성하지 않음 (버전 충돌 완전 우회)
    app: Application = (
        ApplicationBuilder()
        .token(TOKEN)
        .updater(None)
        .build()
    )

    app.add_handler(
        MessageHandler(filters.Regex(r"^/관리자등록$"), handle_register_admin)
    )
    app.add_handler(
        MessageHandler(
            (filters.TEXT | filters.Document.ALL | filters.PHOTO) & ~filters.COMMAND,
            handle_message,
        )
    )

    await app.initialize()
    await app.start()

    # 이벤트 루프가 살아있는 상태에서 스케줄러 시작
    start_scheduler(app.bot, GROUP_CHAT_ID)

    logger.info("봇 시작됨 — long-polling 중...")
    offset = 0
    try:
        while True:
            try:
                updates = await app.bot.get_updates(
                    offset=offset,
                    timeout=30,
                    allowed_updates=Update.ALL_TYPES,
                )
            except NetworkError:
                await asyncio.sleep(5)
                continue

            for update in updates:
                await app.process_update(update)
                offset = update.update_id + 1

    except (KeyboardInterrupt, SystemExit):
        logger.info("봇 종료 중...")
    finally:
        await app.stop()
        await app.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
