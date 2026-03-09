import json
import random
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request

from database import get_db

checkins_bp = Blueprint('checkins', __name__)

CHECKINS_PATH = Path(__file__).parent.parent.parent / "data" / "synthetic" / "daily_checkins.json"


def _load_checkins() -> list[dict]:
    try:
        with open(CHECKINS_PATH) as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
    except Exception:
        return []
    return []


def _load_profile(client_id: str | None) -> dict | None:
    if not client_id:
        return None

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT tech_literacy, location, services FROM user_profiles WHERE client_id = ?",
            (client_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None

        profile = dict(row)
        try:
            profile["services"] = json.loads(profile.get("services") or "[]")
        except Exception:
            profile["services"] = []
        return profile
    finally:
        conn.close()


def _matches_conditions(card: dict, profile: dict | None) -> bool:
    conditions = card.get("conditions") or {}
    if not isinstance(conditions, dict):
        return True

    tech_literacy = (profile or {}).get("tech_literacy") or "intermediate"
    services = [s.lower() for s in ((profile or {}).get("services") or []) if isinstance(s, str)]

    allowed_tech = conditions.get("tech_literacy")
    if isinstance(allowed_tech, list) and allowed_tech and tech_literacy not in allowed_tech:
        return False

    services_any = conditions.get("services_any")
    if isinstance(services_any, list) and services_any and services:
        wanted = {s.lower() for s in services_any if isinstance(s, str)}
        if not any(s in wanted for s in services):
            return False

    return True


def _sanitize_cards(cards: list[dict]) -> list[dict]:
    safe = []
    for card in cards:
        steps = []
        for step in card.get("steps") or []:
            if not isinstance(step, dict):
                continue
            step_text = (step.get("step") or "").strip()
            if not step_text:
                continue
            try:
                score_points = max(0, min(int(step.get("score_points", 0) or 0), 25))
            except Exception:
                score_points = 0
            steps.append({
                "step": step_text,
                "time_estimate": (step.get("time_estimate") or "").strip(),
                "tooltip": (step.get("tooltip") or "").strip(),
                "score_points": score_points,
            })

        if not steps:
            continue

        safe.append({
            "id": (card.get("id") or "").strip(),
            "title": (card.get("title") or "").strip(),
            "description": (card.get("description") or "").strip(),
            "category": (card.get("category") or "").strip(),
            "points": max(0, min(int(card.get("points", 0) or 0), 100)),
            "difficulty": (card.get("difficulty") or "easy").strip(),
            "time_estimate": (card.get("time_estimate") or "").strip(),
            "tags": [t for t in (card.get("tags") or []) if isinstance(t, str)],
            "steps": steps,
        })
    return safe


@checkins_bp.route("/daily-checkins", methods=["GET"])
def get_daily_checkins():
    """
    Get a daily set of safety check-in cards for the scoreboard.
    MVP behavior: non-persistent selection and completion (resets on reload).
    Query params:
      - client_id (optional): use profile for lightweight personalization
      - count (optional): number of cards to return (default 4, max 6)
    """
    client_id = (request.args.get("client_id") or "").strip() or None
    try:
        count = int(request.args.get("count", "4"))
    except Exception:
        count = 4
    count = max(1, min(count, 6))

    all_cards = _load_checkins()
    if not all_cards:
        return jsonify({"cards": [], "count": 0, "daily_goal": 25}), 200

    profile = _load_profile(client_id)
    filtered = [c for c in all_cards if _matches_conditions(c, profile)]
    if len(filtered) < count:
        filtered = all_cards

    digital = [c for c in filtered if c.get("category") == "digital_hygiene"]
    local = [c for c in filtered if c.get("category") == "local_awareness"]
    other = [c for c in filtered if c.get("category") not in ("digital_hygiene", "local_awareness")]

    rng = random.SystemRandom()
    selected = []

    # Balanced mix for MVP: prefer 2 digital + 2 local when possible.
    if digital:
        selected.extend(rng.sample(digital, min(2, len(digital))))
    if local:
        selected.extend(rng.sample(local, min(2, len(local))))

    remaining_pool = [c for c in (digital + local + other) if c not in selected]
    if len(selected) < count and remaining_pool:
        selected.extend(rng.sample(remaining_pool, min(count - len(selected), len(remaining_pool))))

    # If we over-selected, trim randomly.
    if len(selected) > count:
        selected = rng.sample(selected, count)

    safe_cards = _sanitize_cards(selected)
    max_points = sum(sum(step["score_points"] for step in card["steps"]) for card in safe_cards)
    daily_goal = min(30, max_points) if max_points > 0 else 0

    return jsonify({
        "cards": safe_cards,
        "count": len(safe_cards),
        "daily_goal": daily_goal,
        "max_points": max_points,
        "reset_policy": "reload",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }), 200
