import os

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, ApplicationBuilder, MessageHandler, filters

from bot.handlers import handle_message, handle_register_admin
from bot.scheduler import start_scheduler

load_dotenv()

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
GROUP_CHAT_ID = int(os.environ.get("GROUP_CHAT_ID") or "0")


async def post_init(application: Application) -> None:
    # run_polling이 만든 이벤트 루프 안에서 스케줄러 시작
    start_scheduler(application.bot, GROUP_CHAT_ID)


def main() -> None:
    app = (
        ApplicationBuilder()
        .token(TOKEN)
        .post_init(post_init)
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

    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
