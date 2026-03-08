import json
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from database import get_db
from services.ai_service import (
    analyze_scam,
    calculate_score,
    detect_intent,
    generate_digest,
    generate_search_guidance,
    generate_score_recommendations,
)

ai_bp = Blueprint('ai', __name__)


# ---------------------------------------------------------------------------
# POST /api/intent — Unified search bar intent detection
# ---------------------------------------------------------------------------

@ai_bp.route('/intent', methods=['POST'])
def intent():
    """
    Detect what the user wants from unified search bar input.
    Accepts text, base64 image, or both.
    Body: { "text": "...", "image": "base64...", "image_type": "image/jpeg", "client_id": "uuid" }
    Returns: { intent, query, context, route_to, is_ai_generated, search_result? }
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Request body must be valid JSON'}), 400

    text = (data.get('text') or '').strip()
    image_b64 = (data.get('image') or '').strip()
    client_id = (data.get('client_id') or '').strip() or None

    if not text and not image_b64:
        return jsonify({'error': 'Provide text, image, or both'}), 400

    if image_b64:
        # Rough size check — base64 is ~1.33x raw size; 5MB raw = ~6.7MB b64
        if len(image_b64) > 7_000_000:
            return jsonify({'error': 'Image too large. Maximum size is 5MB'}), 400

    result, is_ai = detect_intent(
        text=text or None,
        image_b64=image_b64 or None,
        client_id=client_id,
    )

    # Keep search in the same intent route, but answer it with AI guidance
    # instead of treating it as a plain DB string match.
    if result.get('intent') == 'search':
        search_result, search_ai = generate_search_guidance(
            query=(result.get('query') or text or None),
            image_b64=image_b64 or None,
            client_id=client_id,
        )
        search_result['is_ai_generated'] = search_ai
        if not search_ai and search_result.get('ai_unavailable'):
            search_result['source_note'] = 'Using standard safety guidance (AI temporarily unavailable)'
        result['search_result'] = search_result

    result['is_ai_generated'] = is_ai
    return jsonify(result), 200


# ---------------------------------------------------------------------------
# POST /api/analyze — Scam / phishing analysis
# ---------------------------------------------------------------------------

@ai_bp.route('/analyze', methods=['POST'])
def analyze():
    """
    Analyze suspicious text or image for scam/phishing indicators.
    Body: { "text": "...", "image": "base64...", "image_type": "image/jpeg", "client_id": "uuid" }
    At least one of text or image is required.
    Always returns a result — falls back gracefully if AI unavailable.
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Request body must be valid JSON'}), 400

    text = (data.get('text') or '').strip()
    image_b64 = (data.get('image') or '').strip()
    client_id = (data.get('client_id') or '').strip() or None

    if not text and not image_b64:
        return jsonify({'error': 'Provide text, image, or both'}), 400

    if text and len(text) > 10000:
        return jsonify({'error': 'text must be 10,000 characters or fewer'}), 400

    if image_b64 and len(image_b64) > 7_000_000:
        return jsonify({'error': 'Image too large. Maximum size is 5MB'}), 400

    result, is_ai = analyze_scam(
        text=text or None,
        image_b64=image_b64 or None,
        client_id=client_id,
    )

    result['is_ai_generated'] = is_ai
    if not is_ai and result.get('ai_unavailable'):
        result['source_note'] = 'Using standard safety steps (AI analysis unavailable)'

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# GET /api/digest — Weekly safety digest
# ---------------------------------------------------------------------------

@ai_bp.route('/digest', methods=['GET'])
def get_digest():
    """
    Generate a calm weekly safety digest.
    Query params:
      - client_id: optional — agent fetches profile + local threats automatically
      - location:  optional location override
      - interests: optional — 'digital', 'physical', or 'both'
    """
    client_id = request.args.get('client_id', '').strip() or None
    location  = request.args.get('location', '').strip() or None
    interests = request.args.get('interests', 'both').strip()

    result, is_ai = generate_digest(
        client_id=client_id,
        location=location,
        interests=interests,
    )
    result['is_ai_generated'] = is_ai
    if not is_ai and result.get('ai_unavailable'):
        result['source_note'] = 'Using standard digest format (AI analysis unavailable)'

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# POST /api/score — Calculate and persist safety score
# ---------------------------------------------------------------------------

@ai_bp.route('/score', methods=['POST'])
def post_score():
    """
    Calculate a safety score from questionnaire answers and persist it.
    Body: {
      "client_id": "uuid",
      "answers": {
        "password_habits": "unique" | "mixed" | "reused",
        "two_factor_auth": "all" | "some" | "none",
        "software_updates": "current" | "sometimes" | "rarely",
        "local_awareness": "high" | "medium" | "low",
        "physical_security": "high" | "medium" | "low",
        "emergency_prep": "prepared" | "partial" | "unprepared"
      }
    }
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Request body must be valid JSON'}), 400

    client_id = (data.get('client_id') or '').strip()
    if not client_id:
        return jsonify({'error': 'client_id is required'}), 400

    answers = data.get('answers')
    if not isinstance(answers, dict):
        return jsonify({'error': 'answers must be an object'}), 400

    VALID_ANSWERS = {
        'password_habits':   {'unique', 'mixed', 'reused'},
        'two_factor_auth':   {'all', 'some', 'none'},
        'software_updates':  {'current', 'sometimes', 'rarely'},
        'local_awareness':   {'high', 'medium', 'low'},
        'physical_security': {'high', 'medium', 'low'},
        'emergency_prep':    {'prepared', 'partial', 'unprepared'},
    }

    errors = []
    for field, valid_values in VALID_ANSWERS.items():
        if field not in answers:
            errors.append(f'{field} is required')
        elif answers[field] not in valid_values:
            errors.append(f'{field} must be one of: {", ".join(sorted(valid_values))}')

    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400

    score = calculate_score(answers)

    conn = get_db()
    try:
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()

        cursor.execute('SELECT client_id FROM user_profiles WHERE client_id = ?', (client_id,))
        if not cursor.fetchone():
            cursor.execute(
                'INSERT INTO user_profiles (client_id, created_at, updated_at) VALUES (?, ?, ?)',
                (client_id, now, now)
            )

        score_id = str(uuid.uuid4())
        cursor.execute(
            '''INSERT INTO safety_scores
               (id, client_id, total, digital_hygiene, local_awareness, rating, answers, calculated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                score_id,
                client_id,
                score['total'],
                score['digital_hygiene'],
                score['local_awareness'],
                score['rating'],
                json.dumps(answers),
                score['calculated_at'],
            )
        )
        conn.commit()
    finally:
        conn.close()

    score['id'] = score_id
    score['client_id'] = client_id
    return jsonify(score), 201


# ---------------------------------------------------------------------------
# GET /api/score/<client_id> — Retrieve latest score + history
# ---------------------------------------------------------------------------

@ai_bp.route('/score/<client_id>', methods=['GET'])
def get_score(client_id):
    """
    Retrieve the latest safety score and full history for a user.
    Response: { latest, history, count }
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM safety_scores WHERE client_id = ? ORDER BY calculated_at DESC',
            (client_id,)
        )
        rows = cursor.fetchall()

        if not rows:
            return jsonify({'error': 'No scores found for this client_id'}), 404

        history = []
        for row in rows:
            entry = dict(row)
            try:
                entry['answers'] = json.loads(entry.get('answers') or '{}')
            except Exception:
                entry['answers'] = {}
            history.append(entry)

        return jsonify({
            'latest':  history[0],
            'history': history,
            'count':   len(history),
        }), 200
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/score/<client_id>/recommendations — AI micro-action recommendations
# ---------------------------------------------------------------------------

@ai_bp.route('/score/<client_id>/recommendations', methods=['GET'])
def get_score_recommendations(client_id):
    """
    Get 2-3 AI-generated micro-action recommendations based on user's
    weakest score areas and local threats.
    Query param: location (optional override)
    """
    location = request.args.get('location', '').strip() or None

    # Try to get location from profile if not provided
    if not location:
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute('SELECT location FROM user_profiles WHERE client_id = ?', (client_id,))
            row = cursor.fetchone()
            if row and row['location']:
                location = row['location']
        finally:
            conn.close()

    result, is_ai = generate_score_recommendations(client_id=client_id, location=location)
    result['is_ai_generated'] = is_ai
    if not is_ai and result.get('ai_unavailable'):
        result['source_note'] = 'Using standard recommendations (AI analysis unavailable)'

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# POST /api/threats/<threat_id>/complete — Mark action step complete
# ---------------------------------------------------------------------------

@ai_bp.route('/threats/<threat_id>/complete', methods=['POST'])
def complete_action(threat_id):
    """
    Mark a specific action step for a threat as completed by a user.
    Body: { "client_id": "uuid", "action_index": 0, "action_step": "...", "points": 4 }
    Idempotent — completing the same step twice is not an error.
    Awards points to the user's latest safety score.
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Request body must be valid JSON'}), 400

    client_id = (data.get('client_id') or '').strip()
    if not client_id:
        return jsonify({'error': 'client_id is required'}), 400

    action_index = data.get('action_index')
    if action_index is None or not isinstance(action_index, int) or action_index < 0:
        return jsonify({'error': 'action_index must be a non-negative integer'}), 400

    action_step = (data.get('action_step') or '').strip()
    if not action_step:
        return jsonify({'error': 'action_step is required'}), 400

    points = int(data.get('points') or 3)

    conn = get_db()
    try:
        cursor = conn.cursor()

        cursor.execute('SELECT id FROM threats WHERE id = ?', (threat_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Threat not found'}), 404

        now = datetime.now(timezone.utc).isoformat()
        cursor.execute('SELECT client_id FROM user_profiles WHERE client_id = ?', (client_id,))
        if not cursor.fetchone():
            cursor.execute(
                'INSERT INTO user_profiles (client_id, created_at, updated_at) VALUES (?, ?, ?)',
                (client_id, now, now)
            )

        cursor.execute(
            'SELECT id FROM completed_actions WHERE client_id = ? AND threat_id = ? AND action_index = ?',
            (client_id, threat_id, action_index)
        )
        if cursor.fetchone():
            return jsonify({
                'status':       'already_completed',
                'client_id':    client_id,
                'threat_id':    threat_id,
                'action_index': action_index,
                'score_delta':  0,
                'new_score':    None,
            }), 200

        completion_id = str(uuid.uuid4())
        cursor.execute(
            '''INSERT INTO completed_actions
               (id, client_id, threat_id, action_index, action_step, completed_at)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (completion_id, client_id, threat_id, action_index, action_step, now)
        )

        # Award points to the user's latest safety score
        new_score = None
        cursor.execute(
            'SELECT id, total FROM safety_scores WHERE client_id = ? ORDER BY calculated_at DESC LIMIT 1',
            (client_id,)
        )
        score_row = cursor.fetchone()
        if score_row:
            new_total = min(100, score_row['total'] + points)
            if new_total >= 80:
                new_rating = 'good'
            elif new_total >= 50:
                new_rating = 'fair'
            else:
                new_rating = 'needs_attention'
            cursor.execute(
                'UPDATE safety_scores SET total = ?, rating = ? WHERE id = ?',
                (new_total, new_rating, score_row['id'])
            )
            new_score = new_total

        conn.commit()

        return jsonify({
            'status':       'completed',
            'id':           completion_id,
            'client_id':    client_id,
            'threat_id':    threat_id,
            'action_index': action_index,
            'action_step':  action_step,
            'completed_at': now,
            'score_delta':  points,
            'new_score':    new_score,
        }), 201

    finally:
        conn.close()
