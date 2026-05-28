import os
from collections import deque

from google import genai
from google.genai import types
from telegram import Update
from telegram.ext import ContextTypes

from bot.auth import get_admin, is_admin, is_member, register_admin, register_member
from bot.parser import parse_schedule
from bot.scheduler import save_schedule
from bot.summarizer import summarize_image, summarize_pdf, summarize_pptx, summarize_text

SYSTEM_PROMPT = """너는 SK하이닉스 커뮤니케이션 총괄 조직의
6R 전략 담당 권오혁 담당의 전담 비서 '궁오혁봇'이야.

권오혁 담당은 국내외 대외 이슈를 즉각 포착하고,
입체적인 커뮤니케이션 메시지를 적재적소에 배치하며,
높은 정무감각으로 SK하이닉스의 커뮤니케이션을
전략적으로 대응하는 전문가야.

행동 원칙:
- 답변은 항상 간결하고 실용적으로
- 존댓말 유지
- 커뮤니케이션·IR·GR·PR·ER·CR·BR 관련 질문에 전문적으로 답변
- 불필요한 부연 설명 없이 바로 본론으로"""

SUMMARY_KEYWORDS = {"요약", "요약해줘", "정리해줘"}
IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp", "bmp"}

# 대화 히스토리: user_id → deque of types.Content (maxlen=10)
_chat_history: dict[int, deque] = {}


def _get_history(user_id: int) -> deque:
    if user_id not in _chat_history:
        _chat_history[user_id] = deque(maxlen=10)
    return _chat_history[user_id]


def _gemini_chat(user_id: int, text: str) -> str:
    try:
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        history = list(_get_history(user_id))
        chat = client.chats.create(
            model="gemini-2.0-flash",
            config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
            history=history,
        )
        response = chat.send_message(text)
        reply = response.text

        h = _get_history(user_id)
        h.append(types.Content(role="user", parts=[types.Part(text=text)]))
        h.append(types.Content(role="model", parts=[types.Part(text=reply)]))
        return reply
    except Exception:
        return "요약 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."


async def _download_bytes(update: Update, context: ContextTypes.DEFAULT_TYPE) -> tuple[bytes, str] | None:
    msg = update.message

    if msg.document:
        doc = msg.document
        file = await context.bot.get_file(doc.file_id)
        data = await file.download_as_bytearray()
        name = doc.file_name or ""
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        return bytes(data), ext

    if msg.photo:
        photo = msg.photo[-1]
        file = await context.bot.get_file(photo.file_id)
        data = await file.download_as_bytearray()
        return bytes(data), "jpg"

    return None


async def handle_register_admin(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    result = register_admin(user_id)
    await update.message.reply_text(result)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if not msg:
        return

    user_id = update.effective_user.id
    text = msg.text or msg.caption or ""
    has_file = bool(msg.document or msg.photo)

    # 파일 업로드 시 미등록자 자동 MEMBER 등록
    if has_file and not is_member(user_id):
        register_member(user_id)

    # 권한 없는 순수 텍스트 → 무시
    if not has_file and not is_admin(user_id):
        return

    # 관리자 등록 안 된 상태에서 일반 메시지 → 무시
    if get_admin() is None and not has_file:
        return

    # ── 파일 업로드 처리 ──────────────────────────────────────────
    if has_file:
        result = await _download_bytes(update, context)
        if result is None:
            return
        file_bytes, ext = result

        if ext == "pdf":
            reply = summarize_pdf(file_bytes)
        elif ext in IMAGE_EXTS:
            reply = summarize_image(file_bytes, ext)
        elif ext in ("pptx", "ppt"):
            reply = summarize_pptx(file_bytes)
        else:
            return  # 지원하지 않는 형식 무시

        await msg.reply_text(reply)
        return

    # ── ADMIN 전용 처리 ───────────────────────────────────────────
    if not is_admin(user_id):
        return

    stripped = text.strip()

    # reply 요약
    if msg.reply_to_message and stripped in SUMMARY_KEYWORDS:
        replied = msg.reply_to_message
        if replied.document or replied.photo:
            result = await _download_bytes(update, context)
            if result:
                file_bytes, ext = result
                if ext == "pdf":
                    reply = summarize_pdf(file_bytes)
                elif ext in IMAGE_EXTS:
                    reply = summarize_image(file_bytes, ext)
                elif ext in ("pptx", "ppt"):
                    reply = summarize_pptx(file_bytes)
                else:
                    return
                await msg.reply_text(reply)
                return
        if replied.text:
            await msg.reply_text(summarize_text(replied.text))
            return

    # 인라인 요약 키워드만 단독 입력 → 요약 대상 없음
    if stripped in SUMMARY_KEYWORDS:
        return

    # 일정 등록
    if "일정:" in text or "일정 :" in text:
        schedule = parse_schedule(text)
        if schedule:
            save_schedule(schedule)
            await msg.reply_text("✅ 일정 저장됐습니다.")
        else:
            await msg.reply_text("일정을 파싱하지 못했어요. 형식을 확인해주세요.")
        return

    # 자유 대화
    reply = _gemini_chat(user_id, stripped)
    await msg.reply_text(reply)
