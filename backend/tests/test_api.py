"""
Integration tests for the Haven API using Flask's test client.
Uses an isolated temp-file SQLite database — no shared state with haven.db.
"""
import sys
import os
import json
import uuid
import tempfile
import pytest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


@pytest.fixture()
def client(monkeypatch):
    """
    Yield a Flask test client wired to a fresh temp SQLite DB.
    The DB file is deleted after each test.
    """
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(db_fd)

    # Patch DATABASE_PATH before any DB calls happen
    import database as db_module
    monkeypatch.setattr(db_module, 'DATABASE_PATH', db_path)

    import app as flask_app
    flask_app.app.config['TESTING'] = True

    # Re-run init_db so tables exist in the fresh DB
    with flask_app.app.app_context():
        db_module.init_db()

    with flask_app.app.test_client() as c:
        yield c

    os.unlink(db_path)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _seed_threat(db_path, threat_id='thr-001'):
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT OR IGNORE INTO threats "
        "(id, title, description, type, severity, status, location, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (threat_id, 'Test Threat', 'A test threat description', 'cyber_threat',
         'medium', 'active', 'Chicago, IL, USA', _now(), _now())
    )
    conn.commit()
    conn.close()


def _seed_score(db_path, client_id, total=60):
    import sqlite3
    conn = sqlite3.connect(db_path)
    now = _now()
    conn.execute(
        "INSERT OR IGNORE INTO user_profiles (client_id, created_at, updated_at) VALUES (?, ?, ?)",
        (client_id, now, now)
    )
    rating = 'good' if total >= 80 else 'fair' if total >= 50 else 'needs_attention'
    conn.execute(
        "INSERT INTO safety_scores "
        "(id, client_id, total, digital_hygiene, local_awareness, rating, answers, calculated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), client_id, total, 40, 20, rating, '{}', now)
    )
    conn.commit()
    conn.close()


def _db_path(monkeypatch):
    """Helper to get the current patched DB path from the monkeypatched module."""
    import database as db_module
    return db_module.DATABASE_PATH


# ---------------------------------------------------------------------------
# Tests: POST /api/threats/<id>/complete
# ---------------------------------------------------------------------------

class TestCompleteAction:
    def test_returns_201_on_first_completion(self, client, monkeypatch):
        db = _db_path(monkeypatch)
        _seed_threat(db, 'thr-1')
        cid = str(uuid.uuid4())
        res = client.post('/api/threats/thr-1/complete', json={
            'client_id': cid,
            'action_index': 0,
            'action_step': 'Change your password',
            'points': 5,
        })
        assert res.status_code == 201
        data = res.get_json()
        assert data['status'] == 'completed'
        assert data['score_delta'] == 5

    def test_awards_points_to_existing_score(self, client, monkeypatch):
        db = _db_path(monkeypatch)
        cid = str(uuid.uuid4())
        _seed_threat(db, 'thr-2')
        _seed_score(db, cid, total=60)

        res = client.post('/api/threats/thr-2/complete', json={
            'client_id': cid,
            'action_index': 0,
            'action_step': 'Enable two-factor authentication',
            'points': 5,
        })
        assert res.status_code == 201
        assert res.get_json()['new_score'] == 65

    def test_caps_score_at_100(self, client, monkeypatch):
        db = _db_path(monkeypatch)
        cid = str(uuid.uuid4())
        _seed_threat(db, 'thr-3')
        _seed_score(db, cid, total=98)

        res = client.post('/api/threats/thr-3/complete', json={
            'client_id': cid,
            'action_index': 0,
            'action_step': 'Update software',
            'points': 5,
        })
        assert res.status_code == 201
        assert res.get_json()['new_score'] == 100

    def test_idempotent_second_call_returns_200(self, client, monkeypatch):
        db = _db_path(monkeypatch)
        cid = str(uuid.uuid4())
        _seed_threat(db, 'thr-4')
        payload = {'client_id': cid, 'action_index': 0, 'action_step': 'Lock doors', 'points': 4}
        client.post('/api/threats/thr-4/complete', json=payload)
        res = client.post('/api/threats/thr-4/complete', json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data['status'] == 'already_completed'
        assert data['score_delta'] == 0

    def test_unknown_threat_returns_404(self, client, monkeypatch):
        res = client.post('/api/threats/does-not-exist/complete', json={
            'client_id': str(uuid.uuid4()),
            'action_index': 0,
            'action_step': 'Some step',
        })
        assert res.status_code == 404

    def test_missing_client_id_returns_400(self, client, monkeypatch):
        db = _db_path(monkeypatch)
        _seed_threat(db, 'thr-5')
        res = client.post('/api/threats/thr-5/complete', json={
            'action_index': 0,
            'action_step': 'Some step',
        })
        assert res.status_code == 400

    def test_no_prior_score_returns_null_new_score(self, client, monkeypatch):
        """User completes a step before ever taking the quiz — new_score should be null."""
        db = _db_path(monkeypatch)
        cid = str(uuid.uuid4())
        _seed_threat(db, 'thr-6')
        res = client.post('/api/threats/thr-6/complete', json={
            'client_id': cid,
            'action_index': 0,
            'action_step': 'Check surroundings',
            'points': 3,
        })
        assert res.status_code == 201
        assert res.get_json()['new_score'] is None


# ---------------------------------------------------------------------------
# Tests: GET /api/threats
# ---------------------------------------------------------------------------

class TestGetThreats:
    def test_returns_threats_list(self, client, monkeypatch):
        db = _db_path(monkeypatch)
        _seed_threat(db, 'thr-list-1')
        res = client.get('/api/threats')
        assert res.status_code == 200
        assert 'threats' in res.get_json()

    def test_location_filter_only_returns_matching(self, client, monkeypatch):
        db = _db_path(monkeypatch)
        _seed_threat(db, 'thr-chicago')
        res = client.get('/api/threats?location=Chicago')
        assert res.status_code == 200
        for t in res.get_json()['threats']:
            assert 'chicago' in t['location'].lower()

    def test_severity_filter_only_returns_matching(self, client, monkeypatch):
        db = _db_path(monkeypatch)
        _seed_threat(db, 'thr-sev')
        res = client.get('/api/threats?severity=medium')
        assert res.status_code == 200
        for t in res.get_json()['threats']:
            assert t['severity'] == 'medium'
