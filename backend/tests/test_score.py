"""
Unit tests for calculate_score — purely rule-based, no AI, no DB.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.ai_service import calculate_score


BEST_ANSWERS = {
    "password_habits":   "unique",
    "two_factor_auth":   "all",
    "software_updates":  "current",
    "local_awareness":   "high",
    "physical_security": "high",
    "emergency_prep":    "prepared",
}

WORST_ANSWERS = {
    "password_habits":   "reused",
    "two_factor_auth":   "none",
    "software_updates":  "rarely",
    "local_awareness":   "low",
    "physical_security": "low",
    "emergency_prep":    "unprepared",
}

MIXED_ANSWERS = {
    "password_habits":   "unique",   # 25
    "two_factor_auth":   "some",     # 12
    "software_updates":  "rarely",   # 0
    "local_awareness":   "medium",   # 10
    "physical_security": "low",      # 0
    "emergency_prep":    "partial",  # 6
}


def test_perfect_score_returns_100():
    result = calculate_score(BEST_ANSWERS)
    assert result["total"] == 100
    assert result["digital_hygiene"] == 60
    assert result["local_awareness"] == 40
    assert result["rating"] == "good"


def test_zero_score_returns_needs_attention():
    result = calculate_score(WORST_ANSWERS)
    assert result["total"] == 0
    assert result["digital_hygiene"] == 0
    assert result["local_awareness"] == 0
    assert result["rating"] == "needs_attention"


def test_mixed_answers_score():
    # 25 + 12 + 0 = 37 digital, 10 + 0 + 6 = 16 local → total 53
    result = calculate_score(MIXED_ANSWERS)
    assert result["digital_hygiene"] == 37
    assert result["local_awareness"] == 16
    assert result["total"] == 53
    assert result["rating"] == "fair"


def test_rating_boundary_good():
    # Exactly 80 → good
    answers = {
        "password_habits":   "unique",   # 25
        "two_factor_auth":   "all",      # 20
        "software_updates":  "sometimes",# 8  → digital = 53
        "local_awareness":   "high",     # 15
        "physical_security": "high",     # 15
        "emergency_prep":    "unprepared",# 0  → local = 30 → total = 83
    }
    result = calculate_score(answers)
    assert result["total"] >= 80
    assert result["rating"] == "good"


def test_rating_boundary_fair():
    # Target ~65 → fair
    answers = {
        "password_habits":   "mixed",    # 15
        "two_factor_auth":   "all",      # 20
        "software_updates":  "sometimes",# 8  → digital = 43
        "local_awareness":   "high",     # 15
        "physical_security": "medium",   # 10
        "emergency_prep":    "partial",  # 6  → local = 31 → total = 74
    }
    result = calculate_score(answers)
    assert 50 <= result["total"] < 80
    assert result["rating"] == "fair"


def test_missing_fields_default_to_zero():
    result = calculate_score({})
    assert result["total"] == 0
    assert result["rating"] == "needs_attention"


def test_result_contains_required_keys():
    result = calculate_score(BEST_ANSWERS)
    for key in ("total", "digital_hygiene", "local_awareness", "rating", "details", "calculated_at"):
        assert key in result


def test_details_contain_all_questions():
    result = calculate_score(BEST_ANSWERS)
    for field in ("password_habits", "two_factor_auth", "software_updates",
                  "local_awareness", "physical_security", "emergency_prep"):
        assert field in result["details"]
        assert result["details"][field]["percentage"] == 100


def test_score_is_deterministic():
    result_a = calculate_score(MIXED_ANSWERS)
    result_b = calculate_score(MIXED_ANSWERS)
    assert result_a["total"] == result_b["total"]
    assert result_a["rating"] == result_b["rating"]
