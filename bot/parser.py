import os
import json
import re
import google.generativeai as genai

PARSE_PROMPT = """다음 텍스트에서 일정 정보를 추출해줘.
결과는 JSON으로만 출력해.
형식: {{"date": "MM/DD", "day": "요일", "time": "HH:MM", "title": "회의명"}}
텍스트: {text}"""


def parse_schedule(text: str) -> dict | None:
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(model_name="gemini-2.0-flash")
        response = model.generate_content(PARSE_PROMPT.format(text=text))
        raw = response.text.strip()

        # JSON 블록만 추출
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return None
        return json.loads(match.group())
    except Exception:
        return None
