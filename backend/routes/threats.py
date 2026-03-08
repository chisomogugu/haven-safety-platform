import uuid
import json
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from database import VALID_SEVERITIES, VALID_STATUSES, VALID_TYPES, get_db
from services.ai_service import generate_actions

threats_bp = Blueprint('threats', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def row_to_dict(row):
    return dict(row)


def _get_profile_context(client_id):
    """Load a minimal user context for personalization."""
    if not client_id:
        return None

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT location, services, tech_literacy FROM user_profiles WHERE client_id = ?',
            (client_id,)
        )
        row = cursor.fetchone()
        if not row:
            return None

        profile = dict(row)
        try:
            profile['services'] = json.loads(profile.get('services') or '[]')
        except Exception:
            profile['services'] = []
        return profile
    finally:
        conn.close()


def _personalized_risk(threat, profile):
    """
    Compute a lightweight personalized risk signal for MVP.
    Returns (level, reason).
    """
    severity_base = {'critical': 3, 'high': 2, 'medium': 1, 'low': 0}
    score = severity_base.get(threat.get('severity'), 1)
    reasons = []

    if profile:
        user_location = (profile.get('location') or '').strip().lower()
        threat_location = (threat.get('location') or '').strip().lower()
        if user_location and threat_location and (user_location in threat_location or threat_location in user_location):
            score += 1
            reasons.append('This affects your location')

        services = [s.lower() for s in (profile.get('services') or []) if isinstance(s, str)]
        text = f"{threat.get('title', '')} {threat.get('description', '')}".lower()
        if any(s and s in text for s in services):
            score += 1
            reasons.append('This may impact services you use')

    if score >= 3:
        level = 'high'
    elif score >= 1:
        level = 'medium'
    else:
        level = 'low'

    if reasons:
        reason = '; '.join(reasons)
    else:
        reason = f"Based on reported severity: {threat.get('severity', 'unknown')}"

    return level, reason


def validate_threat(data, partial=False):
    """
    Validate threat fields.
    When partial=True (PATCH), only fields present in data are checked.
    Returns a list of error strings; empty list means valid.
    """
    errors = []

    if not partial or 'title' in data:
        title = data.get('title', '')
        if not isinstance(title, str):
            errors.append('title must be a string')
        else:
            title = title.strip()
            if not title:
                errors.append('title is required')
            elif len(title) < 3:
                errors.append('title must be at least 3 characters')
            elif len(title) > 100:
                errors.append('title must be 100 characters or fewer')

    if not partial or 'description' in data:
        desc = data.get('description', '')
        if not isinstance(desc, str):
            errors.append('description must be a string')
        else:
            desc = desc.strip()
            if not desc:
                errors.append('description is required')
            elif len(desc) < 10:
                errors.append('description must be at least 10 characters')
            elif len(desc) > 1000:
                errors.append('description must be 1000 characters or fewer')

    if not partial or 'type' in data:
        t = data.get('type', '')
        if not isinstance(t, str) or not t.strip():
            errors.append('type is required')
        elif t.strip() not in VALID_TYPES:
            errors.append(f'type must be one of: {", ".join(sorted(VALID_TYPES))}')

    if not partial or 'severity' in data:
        s = data.get('severity', '')
        if not isinstance(s, str) or not s.strip():
            errors.append('severity is required')
        elif s.strip() not in VALID_SEVERITIES:
            errors.append(f'severity must be one of: {", ".join(sorted(VALID_SEVERITIES))}')

    if not partial or 'location' in data:
        loc = data.get('location', '')
        if not isinstance(loc, str) or not loc.strip():
            errors.append('location is required')
        elif len(loc.strip()) < 3:
            errors.append('location must be at least 3 characters')
        elif len(loc.strip()) > 150:
            errors.append('location must be 150 characters or fewer')

    if 'status' in data:
        st = data.get('status', '')
        if not isinstance(st, str) or st.strip() not in VALID_STATUSES:
            errors.append(f'status must be one of: {", ".join(sorted(VALID_STATUSES))}')

    return errors


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@threats_bp.route('/threats', methods=['GET'])
def get_threats():
    """
    List threats with optional filtering and search.
    Query params: type, severity, status, location, search (matches title/description/location)
    """
    type_filter     = request.args.get('type', '').strip()
    severity_filter = request.args.get('severity', '').strip()
    status_filter   = request.args.get('status', '').strip()
    location_filter = request.args.get('location', '').strip()
    search          = request.args.get('search', '').strip()
    client_id       = request.args.get('client_id', '').strip() or None

    query  = 'SELECT * FROM threats WHERE 1=1'
    params = []

    if type_filter and type_filter in VALID_TYPES:
        query += ' AND type = ?'
        params.append(type_filter)

    if severity_filter and severity_filter in VALID_SEVERITIES:
        query += ' AND severity = ?'
        params.append(severity_filter)

    if status_filter and status_filter in VALID_STATUSES:
        query += ' AND status = ?'
        params.append(status_filter)

    if location_filter:
        query += ' AND location LIKE ?'
        params.append(f'%{location_filter}%')

    if search:
        query += ' AND (title LIKE ? OR description LIKE ? OR location LIKE ?)'
        like = f'%{search}%'
        params.extend([like, like, like])

    query += (
        " ORDER BY CASE severity "
        "WHEN 'critical' THEN 0 "
        "WHEN 'high' THEN 1 "
        "WHEN 'medium' THEN 2 "
        "ELSE 3 END, created_at DESC"
    )

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        threats = [row_to_dict(row) for row in cursor.fetchall()]

        profile = _get_profile_context(client_id)
        for threat in threats:
            risk, reason = _personalized_risk(threat, profile)
            threat['personalized_risk'] = risk
            threat['personalized_risk_reason'] = reason

        return jsonify({'threats': threats, 'count': len(threats)}), 200
    finally:
        conn.close()


@threats_bp.route('/threats/<threat_id>', methods=['GET'])
def get_threat(threat_id):
    """Retrieve a single threat by ID."""
    client_id = request.args.get('client_id', '').strip() or None
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM threats WHERE id = ?', (threat_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Threat not found'}), 404
        threat = row_to_dict(row)
        profile = _get_profile_context(client_id)
        risk, reason = _personalized_risk(threat, profile)
        threat['personalized_risk'] = risk
        threat['personalized_risk_reason'] = reason
        return jsonify(threat), 200
    finally:
        conn.close()


@threats_bp.route('/threats', methods=['POST'])
def create_threat():
    """Create a new threat report."""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Request body must be valid JSON'}), 400

    errors = validate_threat(data, partial=False)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400

    now = datetime.now(timezone.utc).isoformat()
    threat = {
        'id':          str(uuid.uuid4()),
        'title':       data['title'].strip(),
        'description': data['description'].strip(),
        'type':        data['type'].strip(),
        'severity':    data['severity'].strip(),
        'status':      data.get('status', 'active').strip(),
        'location':    data['location'].strip(),
        'reported_by': (data.get('reported_by') or '').strip() or None,
        'created_at':  now,
        'updated_at':  now,
    }

    conn = get_db()
    try:
        conn.execute(
            '''INSERT INTO threats
               (id, title, description, type, severity, status, location, reported_by, created_at, updated_at)
               VALUES (:id, :title, :description, :type, :severity, :status, :location, :reported_by, :created_at, :updated_at)''',
            threat
        )
        conn.commit()
        return jsonify(threat), 201
    finally:
        conn.close()


@threats_bp.route('/threats/<threat_id>', methods=['PATCH'])
def update_threat(threat_id):
    """Partially update an existing threat."""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Request body must be valid JSON'}), 400

    UPDATABLE = {'title', 'description', 'type', 'severity', 'status', 'location', 'reported_by'}
    update_data = {k: v for k, v in data.items() if k in UPDATABLE}

    if not update_data:
        return jsonify({'error': 'No valid fields provided for update', 'allowed': sorted(UPDATABLE)}), 400

    errors = validate_threat(update_data, partial=True)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM threats WHERE id = ?', (threat_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Threat not found'}), 404

        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        update_data['id'] = threat_id

        set_clause = ', '.join(f'{k} = :{k}' for k in update_data if k != 'id')
        cursor.execute(f'UPDATE threats SET {set_clause} WHERE id = :id', update_data)
        conn.commit()

        cursor.execute('SELECT * FROM threats WHERE id = ?', (threat_id,))
        return jsonify(row_to_dict(cursor.fetchone())), 200
    finally:
        conn.close()


@threats_bp.route('/threats/<threat_id>/actions', methods=['POST'])
def get_threat_actions(threat_id):
    """
    Generate an AI-powered action plan for a specific threat.
    Optionally accepts user_profile in request body for personalization.
    Always returns actions — falls back to templates if AI is unavailable.
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM threats WHERE id = ?', (threat_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Threat not found'}), 404
        threat = row_to_dict(row)
    finally:
        conn.close()

    data = request.get_json(silent=True) or {}
    client_id = (data.get('client_id') or '').strip() or None

    result, is_ai = generate_actions(threat, client_id=client_id)

    # Hydrate completed-state so checklist remains consistent across reloads.
    completed_indexes = set()
    completed_steps = set()
    if client_id:
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute(
                '''SELECT action_index, action_step
                   FROM completed_actions
                   WHERE client_id = ? AND threat_id = ?''',
                (client_id, threat_id)
            )
            for row in cursor.fetchall():
                completed_indexes.add(row['action_index'])
                completed_steps.add((row['action_step'] or '').strip().lower())
        finally:
            conn.close()

    actions = []
    for idx, action in enumerate(result.get('actions', [])):
        if isinstance(action, dict):
            action_obj = dict(action)
        elif isinstance(action, str):
            action_obj = {'step': action}
        else:
            action_obj = {'step': str(action or '')}
        step_text = (action_obj.get('step') or '').strip().lower()
        action_obj['completed'] = (idx in completed_indexes) or (step_text in completed_steps)
        actions.append(action_obj)

    return jsonify({
        'threat_id':        threat_id,
        'threat_title':     threat['title'],
        'why_this_matters': result.get('why_this_matters', ''),
        'actions':          actions,
        'is_ai_generated':  is_ai,
        'source_note':      None if is_ai else 'Using standard safety steps (AI analysis unavailable)',
    }), 200
