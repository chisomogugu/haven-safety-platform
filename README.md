# Haven — AI-Powered Community Safety Platform Design Doc

> Palo Alto Networks Case Study · Built with OpenAI, Flask, React

Haven is a community safety platform where AI is the core product, not a supporting feature. Every interaction — searching for threats, checking a suspicious message, reviewing your safety score, or reading a weekly digest — is an AI-powered experience personalized to the user's location, tech literacy, and services they use.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [AI Design](#ai-design)
- [Testing](#testing)
- [Future Recommendations](#future-recommendations)

---

## Overview

Haven addresses a real gap: most people have no reliable, personalized way to know what safety threats are active near them, whether a message they received is a scam, or how to concretely improve their digital and physical security posture.

Haven solves this by combining a community-reported threat feed with an AI layer that:
- Detects user intent from natural language input
- Analyzes suspicious content for scam/phishing indicators
- Generates personalized protective action checklists per threat
- Tracks completed actions and rewards users with safety score points
- Delivers weekly AI-written safety digests tailored to the user's area and interests

Users require no account. Identity is a UUID generated in the browser on first visit.

---

## Features

### Unified Smart Search
A single search bar is the entry point for all AI interactions. The user can type a safety question, paste a suspicious message, or upload a screenshot. Haven's intent detection AI automatically routes the input to the right flow.

| Input | AI Routes To |
|---|---|
| "How do I secure my home network?" | Safety guidance with actionable steps |
| Pasted SMS / email / screenshot | Scam analysis with verdict + confidence |
| "What's my safety score?" | Score page navigation |
| "Show me my digest" | Weekly digest page |
| Unrelated input | Gentle "not a safety query" nudge |

### Threat Feed
A community-reported feed of local safety threats filtered to the user's location. Threats are tagged by type (digital scam, cyber threat, physical hazard, weather, crime alert) and severity (low → critical). The feed is sortable and filterable.

Each threat card shows:
- Severity badge and personalized risk level
- Location and time reported
- Category icon

### Threat Detail & Protective Actions
Clicking a threat opens a full detail panel. Inside is an AI-generated protective action checklist specific to that threat. Each step includes:
- A clear, immediately actionable description
- Estimated time to complete
- A tooltip with extra context
- Point value (3–5 pts)

Completing a step saves progress, awards points to the user's safety score, and updates the score badge in real time.

### Safety Score
A 6-question quiz assesses the user's security posture across two dimensions:

| Dimension | Max Points | Questions |
|---|---|---|
| Digital Hygiene | 60 | Password habits, 2FA status, software updates |
| Local Awareness | 40 | Threat awareness, physical security, emergency prep |

**Score bands:**
- 80–100 → Good (green)
- 50–79 → Fair (yellow)
- 0–49 → Needs Attention (red)

The score widget on the Home page updates live as the user completes threat action steps.

### Daily Safety Scoreboard
A rotating set of daily safety checkin tasks with point values. Completing daily tasks builds a habit of proactive safety awareness and contributes to the user's score.

### Weekly Safety Digest
An AI-generated personalized weekly brief covering:
- A headline summarizing the safety landscape
- 2–3 sentence threat overview
- Top priority action
- Category breakdown (digital / physical / resolved counts)
- An encouraging closing note

Digest content is scoped to the user's location and interests (digital, physical, or both).

### Scam & Phishing Analyzer
Users paste or upload suspicious content directly into the search bar. The AI returns:
- **Verdict**: scam / legitimate / unclear
- **Confidence** score (0.0–1.0); below 0.6 forces "unclear"
- **Risk level**: high / medium / low
- **Red flags** found in the content
- **Protective steps** to take

Supports text, images (screenshots), or both simultaneously.

### Threat Reporting
Any user can report a new threat to the community feed. Reports include title, description, type, severity, and location.

---

## Tech Stack

### Backend
| | |
|---|---|
| Framework | Flask (Python) |
| Database | SQLite |
| AI | OpenAI Responses API with function calling + vision |
| Auth | None — UUID-based device identity |
| CORS | Flask-CORS |

### Frontend
| | |
|---|---|
| Framework | React 19 |
| Build | Vite |
| Routing | React Router v6 |
| Styling | Tailwind CSS (custom design tokens) |
| HTTP | Axios |
| Icons | Lucide React |

### Testing
| | |
|---|---|
| Backend | pytest |
| Frontend | Vitest |

---

## Architecture

```
Browser (React SPA — port 5173)
    │
    ├── localStorage
    │     ├── haven_client_id  (UUID — permanent device identity)
    │     └── haven_profile    (name, location, preferences cache)
    │
    └── Axios ──► Flask API (port 5000)
                      │
                      ├── /api/threats/*      Threat CRUD + actions
                      ├── /api/intent         AI intent detection
                      ├── /api/analyze        AI scam analysis
                      ├── /api/score          Quiz scoring + history
                      ├── /api/digest         AI weekly digest
                      ├── /api/profile        User profile CRUD
                      └── /api/daily-checkins Daily safety tasks
                                │
                                ├── SQLite (haven.db)
                                └── OpenAI Responses API
```

### AI Architecture Principle

All AI service functions follow a **pre-fetch, single-call** pattern. Database context (user profile, score, relevant threats) is fetched in Python before the API call, then passed as a single message. This eliminates multi-round-trip agent loops that cause cumulative timeouts.

The one exception is `analyze_scam`, which uses an agent loop because the AI needs to dynamically decide which user context is relevant when analyzing arbitrary content.

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- An OpenAI API key

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create a .env file
echo "OPENAI_API_KEY=your_key_here" > .env

python app.py
# API running at http://localhost:5000
```

The database is created and seeded automatically on first run.

### Frontend

```bash
cd frontend
npm install
npm run dev
# App running at http://localhost:5173
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | required | Your OpenAI API key |
| `FORCE_FALLBACK` | `false` | Set to `true` to bypass all AI (uses templates) |
| `OPENAI_INTENT_TIMEOUT` | `8` | Timeout in seconds for intent detection |
| `OPENAI_SEARCH_TIMEOUT` | `25` | Timeout for search guidance generation |
| `OPENAI_ACTIONS_TIMEOUT` | `25` | Timeout for threat action generation |
| `OPENAI_DIGEST_TIMEOUT` | `25` | Timeout for digest generation |

---

## API Reference

### Threats

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/threats` | List threats. Params: `type`, `severity`, `status`, `location`, `search` |
| `GET` | `/api/threats/:id` | Single threat by ID |
| `POST` | `/api/threats` | Report a new threat |
| `PATCH` | `/api/threats/:id` | Update threat status or severity |
| `POST` | `/api/threats/:id/actions` | Get AI protective action checklist for a threat |
| `POST` | `/api/threats/:id/complete` | Mark an action step complete; awards score points |

### AI Services

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/intent` | Detect intent from search input (text + optional image) |
| `POST` | `/api/analyze` | Scam/phishing analysis (text + optional image) |
| `POST` | `/api/score` | Submit quiz answers and calculate score |
| `GET` | `/api/score/:client_id` | Fetch latest score and history |
| `GET` | `/api/score/:client_id/recommendations` | AI micro-action recommendations |
| `GET` | `/api/digest` | Generate weekly safety digest |

### Profile & Checkins

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/profile` | Create or update user profile |
| `GET` | `/api/profile/:client_id` | Fetch user profile |
| `GET` | `/api/daily-checkins` | Fetch daily safety checkin cards |

---

## Database Schema

### `threats`
Shared community threat records seeded from `data/synthetic/threats.json`.

```
id           TEXT PRIMARY KEY
title        TEXT
description  TEXT
type         TEXT  — digital_scam | cyber_threat | physical_hazard | weather | crime_alert
severity     TEXT  — low | medium | high | critical
status       TEXT  — active | resolved | monitoring
location     TEXT
reported_by  TEXT
created_at   TEXT  ISO 8601
updated_at   TEXT  ISO 8601
```

### `user_profiles`
One row per device, identified by client_id UUID from localStorage.

```
client_id        TEXT PRIMARY KEY
name             TEXT
location         TEXT
tech_literacy    TEXT  — beginner | intermediate | advanced
services         TEXT  JSON array e.g. ["Venmo", "Gmail"]
digest_frequency TEXT  — daily | weekly | never
digest_interests TEXT  — digital | physical | both
created_at       TEXT
updated_at       TEXT
```

### `safety_scores`
One row per quiz submission. Action completions update the most recent row.

```
id               TEXT PRIMARY KEY
client_id        TEXT  FK → user_profiles
total            INTEGER  0–100
digital_hygiene  INTEGER  0–60
local_awareness  INTEGER  0–40
rating           TEXT  — good | fair | needs_attention
answers          TEXT  JSON of quiz answers
calculated_at    TEXT  ISO 8601
```

### `completed_actions`
Tracks which protective steps a user has completed per threat.

```
id            TEXT PRIMARY KEY
client_id     TEXT  FK → user_profiles
threat_id     TEXT  FK → threats
action_index  INTEGER  0-based step position
action_step   TEXT  Step description
completed_at  TEXT  ISO 8601
UNIQUE (client_id, threat_id, action_index)  — idempotent
```

---

## AI Design

### Intent Detection
Every search bar submission first hits `/api/intent`. The AI classifies the input into one of five intents and routes accordingly. For `search` intent, the AI resolves the guidance inline in the same call — no second round-trip.

### Scam Analysis
`analyze_scam` is the only function that uses a full agent loop. Because the user can submit any arbitrary content, the AI dynamically decides which context tools to call (user profile, similar threat patterns). It supports text, images, and both simultaneously via OpenAI's vision capability.

### Action Generation
`generate_actions` pre-fetches the user's profile and previously completed steps in Python before calling the API. The model generates 3–5 steps with point values (3–5 pts each). If the AI is unavailable, a template keyed on threat type is served instead.

### Graceful Degradation
Every AI function returns a `(result, is_ai_generated)` tuple. When `is_ai_generated` is `False`, a template or rule-based fallback is returned. Setting `FORCE_FALLBACK=true` in the environment bypasses all AI calls — useful for development and testing without an API key.

---

## Testing

### Run Backend Tests

```bash
cd backend
source .venv/bin/activate
python -m pytest tests/ -v
```

**19 tests** covering:
- `test_score.py` — 9 unit tests for `calculate_score` (all score bands, boundary conditions, determinism, missing fields)
- `test_api.py` — 10 integration tests for the REST API (action completion, score awarding, idempotency, validation, threat filtering)

### Run Frontend Tests

```bash
cd frontend
npm test
```

**21 tests** covering:
- `helpers.test.js` — unit tests for all utility functions (`getScoreColor`, `getSeverityColor`, `getVerdictStyle`, `getCategoryLabel`, `truncate`, `formatDate`)

---

## Future Recommendations

### Push Notifications & Real-Time Alerts
Implement WebSocket or push notification support so users receive immediate alerts when a critical threat is reported near their location. Browser push notifications and email delivery (using the user's preferred digest frequency) would extend Haven's reach beyond active sessions.

### Community Threat Verification
Add an upvote / confirm mechanism on threat reports. Community confirmations increase a threat's credibility score and could trigger automatic severity escalation. A "mark as resolved" voting system would keep the feed accurate without requiring admin moderation.

### Richer Threat Intelligence Sources
Integrate public data feeds — NOAA weather alerts, local PD RSS feeds, FBI IC3 scam bulletins — to supplement community reports with verified authoritative data. Automatic deduplication would prevent the same event from appearing multiple times.

### Gamification & Streaks
Introduce streak tracking for daily checkin completions, achievement badges (e.g. "Phishing Detector", "7-Day Streak", "Score Improver"), and an opt-in anonymized leaderboard. These mechanics drive habitual engagement with the safety content.

### Mobile Application
A React Native app sharing the same Flask backend would extend Haven to mobile users with native push notification support, camera access for on-the-spot scam scanning, and location-based threat alerting in the background.

### Organization & Household Mode
Allow a group of users (family, small team, neighborhood) to share a threat feed and safety digest. A household admin could view aggregate safety scores and assign protective action tasks to members.

### AI Improvements
- **Streaming responses** — Stream AI output to the client for perceived speed improvements on slower connections
- **Multilingual support** — Detect the user's browser language and respond in kind
- **Proactive score nudges** — When the AI detects a local threat matching a user's weak score areas, surface a targeted recommendation automatically
- **Personalized feed ranking** — Re-order the threat feed by relevance to the user's profile rather than pure severity

### Admin Dashboard
A moderation interface for reviewing user-reported threats before they go live, managing synthetic seed data, and monitoring AI fallback rates and error logs. Would include basic analytics: active users by location, most-completed action steps, average score trends.
