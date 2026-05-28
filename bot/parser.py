import os
import json
import re
from google import genai

PARSE_PROMPT = """다음 텍스트에서 일정 정보를 추출해줘.
결과는 JSON으로만 출력해.
형식: {{"date": "MM/DD", "day": "요일", "time": "HH:MM", "title": "회의명"}}
텍스트: {text}"""


def parse_schedule(text: str) -> dict | None:
    try:
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=PARSE_PROMPT.format(text=text),
        )
        raw = response.text.strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return None
        return json.loads(match.group())
    except Exception:
        return None
