import sqlite3
import os
import json

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'haven.db')
SYNTHETIC_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'synthetic', 'threats.json')

VALID_TYPES = {'physical_hazard', 'digital_scam', 'cyber_threat', 'weather', 'crime_alert'}
VALID_SEVERITIES = {'low', 'medium', 'high', 'critical'}
VALID_STATUSES = {'active', 'resolved', 'monitoring'}


def get_db():
    """Return a SQLite connection with row_factory set for dict-like access."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create all tables and seed synthetic data if the threats table is empty."""
    conn = get_db()
    try:
        cursor = conn.cursor()

        # --- Shared threat data (server-side) ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS threats (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                description TEXT NOT NULL,
                type        TEXT NOT NULL,
                severity    TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'active',
                location    TEXT NOT NULL,
                reported_by TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        ''')

        # --- User profile (identified by client_id UUID generated on frontend) ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_profiles (
                client_id         TEXT PRIMARY KEY,
                name              TEXT,
                location          TEXT,
                tech_literacy     TEXT DEFAULT 'intermediate',
                services          TEXT DEFAULT '[]',
                digest_frequency  TEXT DEFAULT 'weekly',
                digest_interests  TEXT DEFAULT 'both',
                created_at        TEXT NOT NULL,
                updated_at        TEXT NOT NULL
            )
        ''')

        # --- Safety score history (one row per calculation) ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS safety_scores (
                id               TEXT PRIMARY KEY,
                client_id        TEXT NOT NULL,
                total            INTEGER NOT NULL,
                digital_hygiene  INTEGER NOT NULL,
                local_awareness  INTEGER NOT NULL,
                rating           TEXT NOT NULL,
                answers          TEXT NOT NULL,
                calculated_at    TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES user_profiles(client_id)
            )
        ''')

        # --- Action completion tracking (links users to completed threat action steps) ---
        # action_index is the 0-based position of the step in the action list
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS completed_actions (
                id           TEXT PRIMARY KEY,
                client_id    TEXT NOT NULL,
                threat_id    TEXT NOT NULL,
                action_index INTEGER NOT NULL,
                action_step  TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES user_profiles(client_id),
                UNIQUE (client_id, threat_id, action_index)
            )
        ''')

        conn.commit()

        cursor.execute('SELECT COUNT(*) FROM threats')
        if cursor.fetchone()[0] == 0:
            _seed_synthetic_data(conn)
    finally:
        conn.close()


def _seed_synthetic_data(conn):
    """Load threats from the synthetic JSON file into the database."""
    try:
        with open(SYNTHETIC_DATA_PATH, 'r') as f:
            threats = json.load(f)

        cursor = conn.cursor()
        cursor.executemany(
            '''INSERT INTO threats
               (id, title, description, type, severity, status, location, reported_by, created_at, updated_at)
               VALUES (:id, :title, :description, :type, :severity, :status, :location, :reported_by, :created_at, :updated_at)''',
            threats
        )
        conn.commit()
        print(f"[Haven] Seeded {len(threats)} synthetic threats.")
    except FileNotFoundError:
        print(f"[Haven] Warning: Synthetic data file not found at {SYNTHETIC_DATA_PATH}. Starting with empty database.")
    except Exception as e:
        print(f"[Haven] Warning: Could not seed synthetic data: {e}")
