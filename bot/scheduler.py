import json
import os
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from telegram import Bot

SCHEDULES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "schedules.json")


def load_schedules() -> list:
    with open(SCHEDULES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_schedule(entry: dict) -> None:
    schedules = load_schedules()
    schedules.append(entry)
    with open(SCHEDULES_PATH, "w", encoding="utf-8") as f:
        json.dump(schedules, f, ensure_ascii=False, indent=2)


async def send_daily_briefing(bot: Bot, group_chat_id: int) -> None:
    today = datetime.now().strftime("%m/%d")
    schedules = load_schedules()
    todays = [s for s in schedules if s.get("date") == today]

    if not todays:
        return

    lines = [f"📅 {s['date']}({s['day']}) {s['time']} {s['title']}" for s in todays]
    message = "\n".join(lines)
    await bot.send_message(chat_id=group_chat_id, text=message)


def start_scheduler(bot: Bot, group_chat_id: int) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
    scheduler.add_job(
        send_daily_briefing,
        trigger="cron",
        hour=7,
        minute=0,
        args=[bot, group_chat_id],
    )
    scheduler.start()
    return scheduler
