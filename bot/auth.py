import json
import os

USERS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "users.json")


def _load() -> dict:
    with open(USERS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    with open(USERS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_admin() -> int | None:
    return _load().get("admin")


def get_members() -> list[int]:
    return _load().get("members", [])


def is_admin(user_id: int) -> bool:
    return _load().get("admin") == user_id


def is_member(user_id: int) -> bool:
    data = _load()
    return user_id in data.get("members", []) or data.get("admin") == user_id


def register_admin(user_id: int) -> str:
    data = _load()
    if data.get("admin") is not None:
        return "이미 관리자가 등록되어 있습니다."
    data["admin"] = user_id
    _save(data)
    return "✅ 관리자로 등록됐습니다."


def register_member(user_id: int) -> None:
    data = _load()
    if user_id not in data["members"] and data.get("admin") != user_id:
        data["members"].append(user_id)
        _save(data)
