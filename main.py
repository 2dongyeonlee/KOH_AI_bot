import os

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters

from bot.handlers import handle_message, handle_register_admin
from bot.scheduler import start_scheduler

load_dotenv()

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
GROUP_CHAT_ID = int(os.environ.get("GROUP_CHAT_ID") or "0")


def main() -> None:
    app = ApplicationBuilder().token(TOKEN).build()

    app.add_handler(
        MessageHandler(filters.Regex(r"^/관리자등록$"), handle_register_admin)
    )

    # 텍스트, 문서, 사진 모두 단일 핸들러로 처리
    app.add_handler(
        MessageHandler(
            (filters.TEXT | filters.Document.ALL | filters.PHOTO) & ~filters.COMMAND,
            handle_message,
        )
    )

    # 스케줄러 시작
    start_scheduler(app.bot, GROUP_CHAT_ID)

    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
