# Haven Safety Platform — Design Document

## Overview

Haven is an AI-powered community safety platform that helps users stay informed about local threats, detect scams, track their personal safety score, and receive personalized weekly safety digests. Every core user interaction routes through an AI layer — AI is the product, not an add-on.

Users are identified by a UUID (`client_id`) generated in the browser and stored in `localStorage`. No login or account creation required.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | Flask (Python) |
| Database | SQLite via `sqlite3` |
| AI | OpenAI Responses API (function calling + vision) |
| Frontend framework | React 19 |
| Build tool | Vite |
| Styling | Tailwind CSS (custom design tokens) |
| Routing | React Router v6 |
| HTTP client | Axios |
| Icons | Lucide React |

---

## System Architecture

```
Browser (React SPA)
    │
    ├── localStorage  ← clientId UUID + profile cache
    │
    └── Axios → Flask API (port 5000)
                    │
                    ├── /api/threats/*  ← threat CRUD + action plans
                    ├── /api/intent     ← AI intent detection
                    ├── /api/analyze    ← AI scam analysis
                    ├── /api/score      ← quiz scoring + history
                    ├── /api/digest     ← AI weekly digest
                    ├── /api/profile    ← user profile CRUD
                    └── /api/daily-checkins
                                │
                                ├── SQLite (haven.db)
                                └── OpenAI Responses API
```

### AI Architecture Principle

Every public AI function pre-fetches all required database context in Python first, then makes a **single direct API call** — no multi-round agent loops (except `analyze_scam` which requires dynamic tool calls for vision-based analysis). This eliminates cumulative timeout failures from chained API round-trips.

---

## Database Schema

### `threats`
Shared community threat records.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `title` | TEXT | |
| `description` | TEXT | |
| `type` | TEXT | `digital_scam`, `cyber_threat`, `physical_hazard`, `weather`, `crime_alert` |
| `severity` | TEXT | `low`, `medium`, `high`, `critical` |
| `status` | TEXT | `active`, `resolved`, `monitoring` |
| `location` | TEXT | Plain text city/region |
| `reported_by` | TEXT | |
| `created_at` | TEXT | ISO 8601 |
| `updated_at` | TEXT | ISO 8601 |

### `user_profiles`
One row per device (client_id).

| Column | Type | Notes |
|---|---|---|
| `client_id` | TEXT PK | UUID from browser |
| `name` | TEXT | |
| `location` | TEXT | Used for threat filtering + AI context |
| `tech_literacy` | TEXT | `beginner`, `intermediate`, `advanced` |
| `services` | TEXT | JSON array (e.g. `["Venmo","Gmail"]`) |
| `digest_frequency` | TEXT | `daily`, `weekly`, `never` |
| `digest_interests` | TEXT | `digital`, `physical`, `both` |

### `safety_scores`
One row per quiz submission. Action completions update the most recent row.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `client_id` | TEXT FK | → user_profiles |
| `total` | INTEGER | 0–100 |
| `digital_hygiene` | INTEGER | 0–60 |
| `local_awareness` | INTEGER | 0–40 |
| `rating` | TEXT | `good`, `fair`, `needs_attention` |
| `answers` | TEXT | JSON of quiz answers |
| `calculated_at` | TEXT | ISO 8601 |

### `completed_actions`
Tracks which threat action steps a user has completed.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `client_id` | TEXT FK | → user_profiles |
| `threat_id` | TEXT FK | → threats |
| `action_index` | INTEGER | 0-based position in action list |
| `action_step` | TEXT | Step description |
| `completed_at` | TEXT | ISO 8601 |
| UNIQUE | | `(client_id, threat_id, action_index)` — idempotent |

---

## API Endpoints

### Threats

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/threats` | List threats; query params: `type`, `severity`, `status`, `location`, `search` |
| `GET` | `/api/threats/:id` | Single threat |
| `POST` | `/api/threats` | Report a new threat |
| `PATCH` | `/api/threats/:id` | Update threat status/severity |
| `POST` | `/api/threats/:id/actions` | Get AI-generated protective actions |
| `POST` | `/api/threats/:id/complete` | Mark an action step complete; awards score points |

### AI Services

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/intent` | Detect intent from search bar input (text + optional image) |
| `POST` | `/api/analyze` | Scam/phishing analysis (text + optional image) |
| `POST` | `/api/score` | Submit quiz answers → calculate + persist score |
| `GET` | `/api/score/:client_id` | Fetch latest score + history |
| `GET` | `/api/score/:client_id/recommendations` | AI micro-action recommendations |
| `GET` | `/api/digest` | Generate personalized weekly digest |

### Profile & Checkins

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/profile` | Upsert user profile |
| `GET` | `/api/profile/:client_id` | Fetch profile |
| `GET` | `/api/daily-checkins` | Fetch daily safety checkin cards |

---

## AI Service Functions

### `detect_intent(text, image_b64, client_id)`
Classifies the search bar input into one of: `search`, `scam_check`, `score`, `digest`, or `unknown`. Returns intent + a `search_result` when intent is `search` (the AI resolves the guidance inline in one call). Falls back to `intent: "search"` if AI is unavailable. Timeout: 8s.

### `analyze_scam(text, image_b64, client_id)`
Analyses suspicious content for scam/phishing indicators. Accepts text, image, or both (vision-enabled). Uses an agent loop because tool calls are dynamic — the AI decides at runtime which user context it needs. Returns `{ verdict, confidence, risk_level, explanation, red_flags[], actions[] }`. Confidence < 0.6 forces verdict to `"unclear"`. Timeout: 30s.

### `generate_actions(threat, client_id)`
Generates a personalized protective action checklist for a threat. Pre-fetches user profile + completed steps in Python before the API call (single direct call, no tools). Each step includes `points` (3–5) for score impact. Falls back to type-based templates if AI is unavailable. Timeout: 25s.

### `generate_search_guidance(text, image_b64, client_id)`
Handles the `search` intent — answers safety questions with AI-generated guidance and actionable steps. Pre-fetches profile + score + relevant threats before the API call. Returns `{ answer, actions: [{ title, why, steps: [{ step, time, points }] }] }`. Timeout: 25s.

### `generate_digest(client_id, location, interests)`
Generates a personalized weekly safety brief. Pre-fetches profile + score + local threats before the API call (single direct call). Returns `{ headline, summary, top_priority, categories, positive_note, generated_at }`. Timeout: 25s.

### `generate_score_recommendations(client_id, location)`
Generates 2–3 micro-action recommendations based on the user's weakest score areas and active local threats. Returns `{ recommendations: [{ action, score_impact, time_estimate, reason }] }`.

### `calculate_score(answers)`
Pure rule-based scoring — deterministic, instant, no AI. Weights quiz answers across digital hygiene (max 60 pts) and local awareness (max 40 pts). Rating bands: `good` (≥80), `fair` (≥50), `needs_attention` (<50).

---

## Frontend Pages

### Home (`/`)
The primary view. Contains the unified smart search bar, inline scam result panel, safety score widget, daily safety scoreboard, and the threat feed with type/severity filters. All AI interactions surface here — no separate dedicated pages for scam checking or search.

### Digest (`/digest`)
Displays the AI-generated weekly safety brief. Structured into: headline, threat landscape summary, top priority action, digital/physical/resolved counts, and a closing encouraging note.

### Score (`/score`)
Six-question safety quiz. Displays score breakdown (digital hygiene vs. local awareness), rating, score history, and AI-generated micro-action recommendations.

---

## Key Components

**`ActionChecklist`** — Lazy-loads AI protective actions when the user expands the section in a threat detail panel. Each step shows time estimate, a tooltip, and point value. Completing a step calls `POST /threats/:id/complete`, awards points, and propagates the new score up to the navbar badge via `onScoreUpdate`.

**`ThreatCard`** — Feed card showing threat title, severity badge, personalized risk level, location, and category icon. Clicking opens `ThreatDetail`.

**`ThreatDetail`** — Right-slide panel with full threat context (description, metadata, critical warning banner) and the `ActionChecklist`.

**`SmartSearch`** — Unified text + image input. Calls `detectIntent` on submit, then routes to the appropriate handler: scam analysis inline, score nudge, digest navigation, safety guidance, or "not a safety query" message for unrelated input.

**`ScoreRing`** — Donut chart visualization of the safety score, color-coded by rating.

**`OnboardingModal`** — Shown once to new users. Collects name, location, tech literacy, and services. Saves to localStorage and the backend profile table.

---

## User Identity

Users have no account. The frontend generates a UUID (`clientId`) on first visit and stores it in `localStorage` under `haven_client_id`. The user profile (name, location, preferences) is cached in `localStorage` under `haven_profile` and mirrored to the backend `user_profiles` table for AI context. `isOnboarded` is `true` when `profile.name` or `profile.location` is set.

---

## Scoring System

| Source | Points |
|---|---|
| Safety quiz (one-time) | 0–100 based on answers |
| Completing a threat action step | 3–5 pts (AI-assigned per step) |

Action points are added to the user's current latest score record (capped at 100). The `rating` field is re-derived automatically. Score history is preserved per quiz submission — action completions update the most recent row rather than creating new entries.

---

## Design Decisions

**Single search entry point.** One smart search bar handles all user input — text, images, safety questions, scam checks, and navigation. There is no separate "scam checker" page.

**Inline results.** Scam verdicts and safety guidance are displayed directly on the Home page, not in separate routes. This keeps the user in context.

**No auth friction.** UUID-based identity requires zero signup. The platform is useful from the first page load.

**Calm AI tone.** All AI responses follow a "calm, empowering advisor" persona. Findings are presented without alarmism; every threat surfaces a concrete next step.

**Graceful degradation.** Every AI function has a template or rule-based fallback. The app is fully usable without an OpenAI key.

**Location-scoped feed.** The threat feed is filtered to the user's location by default. Without a location, all threats are shown.

---

## Future Enhancements

### Notifications & Alerts
- Push notifications for critical threats in the user's location
- Email digest delivery on the user's preferred frequency (daily/weekly)
- Browser notifications for newly reported threats

### Social & Community Features
- Upvote/confirm threat reports to increase credibility score
- Anonymous comments on threat reports for community updates
- "Mark as resolved" voting by the community

### Richer Threat Intelligence
- Source URL and external link verification for threats
- Automatic deduplication of similar threat reports
- Integration with public safety APIs (weather services, local PD RSS feeds)
- Threat severity auto-escalation based on community confirmations

### Score & Gamification
- Score streaks for daily checkin completions
- Achievement badges (e.g. "Phishing Detector", "7-Day Streak")
- Weekly score progress summary
- Leaderboard (opt-in, anonymized)

### AI Improvements
- Streaming AI responses for perceived speed improvement
- Multilingual support for non-English users
- Personalized threat feed ranking (AI re-orders by relevance to user profile)
- Proactive safety nudges based on score weaknesses

### Platform Expansion
- Mobile app (React Native) sharing the same backend
- Organization/household mode — shared threat awareness for families or small teams
- Admin dashboard for threat moderation and synthetic data management
- Export safety score report as PDF
