# Haven Refactor Log

Last Updated: 2026-03-08

## Purpose
Track findings, implementation work, and incremental updates while refactoring Haven toward the requirements-defined AI-orchestrated MVP architecture with graceful fallback.

## Findings (From Audit)

### Architecture Drift
- Frontend behaves like a CRUD feed first and unified AI search second.
- AI contract drift exists between backend responses and frontend expectations.
- Fallback metadata is often returned by backend but not surfaced in UI.
- Digest and recommendation flows are partially implemented and not rendered as structured feature outputs.

### High-Severity Gaps
- Intent enum mismatch across backend/frontend causes misrouting.
- Scam analysis response fields are mismatched (UI drops important data).
- Score recommendations render incorrectly as plain text.
- Threat actions do not reliably rehydrate completed-state.
- Home feed defaults to broad listing instead of search- or user-context-driven results.

### Requirement Gaps Still Open
- Personalized risk labels on threat cards.
- High-risk-first ordering backed by personalized risk.
- Full score behavior loop (decay + action-linked updates).
- Digest verified vs unverified split and archive/search history.

## Refactor Strategy (MVP)
1. Stabilize API/UI contracts first.
2. Make unified search the primary interaction path.
3. Improve action checklist flow and fallback transparency.
4. Keep implementation simple and testable (no extra infrastructure).

## Implementation Updates

### 2026-03-08 11:00 CDT — Started
- Created this refactor log.
- Next: apply contract fixes and unified-search-driven frontend behavior.

### 2026-03-08 11:15 CDT — Contract + Search Refactor Batch 1
- Backend:
  - `/api/threats/<id>/actions` now rehydrates `completed` state from `completed_actions` for reliable checklist persistence.
  - File: `backend/routes/threats.py`
- Frontend:
  - Home search flow now uses backend query params (`search`, filters, contextual location fallback) instead of local-only filtering.
  - Intent handling now accepts backend canonical `score` and uses `route_to` safety path.
  - Scam result cards now render `explanation`, `actions`, and fallback/source notes.
  - Files: `frontend/src/pages/Home.jsx`, `frontend/src/pages/AnalyzePage.jsx`
- Frontend action UX:
  - Action checklist now displays `why_this_matters`, fallback note, `time_estimate`, and optional tooltip text.
  - File: `frontend/src/components/ActionChecklist.jsx`
- Frontend score/digest UX:
  - Score recommendations now render structured recommendation cards (action, impact, time, reason) instead of raw text.
  - Digest page now renders structured fields (`headline`, `summary`, `top_priority`, `categories`, `positive_note`) and fallback note.
  - Files: `frontend/src/pages/ScorePage.jsx`, `frontend/src/pages/DigestPage.jsx`
- Misc contract cleanup:
  - Report Threat modal now returns created threat object correctly to Home.
  - SearchBar enum handling updated for `score` intent compatibility.
  - Files: `frontend/src/components/ReportThreatModal.jsx`, `frontend/src/components/SearchBar.jsx`

### 2026-03-08 11:30 CDT — Personalization Refactor Batch 2
- Backend:
  - Added lightweight personalized risk computation using severity + user location + user services context.
  - Added `personalized_risk` and `personalized_risk_reason` to threats list/detail responses.
  - Changed default threat ordering toward risk priority (`critical/high` first, then recency).
  - File: `backend/routes/threats.py`
- Frontend:
  - Home now sends `client_id` with threat queries so backend can personalize risk.
  - Threat cards and detail panel now display personalized risk and reason.
  - Files: `frontend/src/pages/Home.jsx`, `frontend/src/components/ThreatCard.jsx`, `frontend/src/components/ThreatDetail.jsx`

### 2026-03-08 12:20 CDT — Threat Match Refactor Batch 3
- Backend:
  - Added unified `/api/threat-match` endpoint and `generate_threat_match()` service flow:
    - DB/templates queried first to avoid duplicate search effort.
    - AI synthesizes guidance + actions + optional score micro-actions.
    - Supports targeted follow-up question for additional detail.
  - Intent detection now routes general safety questions to `threat_match`.
  - Reduced default AI timeout from 30s to 10s.
  - Files: `backend/database.py`, `backend/routes/ai.py`, `backend/services/ai_service.py`
- Frontend:
  - Home unified search now calls `threat-match` for non-scam safety help and renders inline Threat Match guidance card.
  - Added follow-up UX inside the same card so users can provide extra context and get refined results.
  - Removed Analyze from visible navbar (search-bar scam flow remains primary).
  - Score page recommendations now auto-load in result mode (no manual “AI Recommendations” button).
  - Added MCP placeholder panel (“Device Safety Scan — coming soon”).
  - Fallback transparency shifted toward subtle chips.
  - Files: `frontend/src/api/index.js`, `frontend/src/pages/Home.jsx`, `frontend/src/components/Navbar.jsx`, `frontend/src/pages/ScorePage.jsx`, `frontend/src/components/ActionChecklist.jsx`

### 2026-03-08 13:20 CDT — Runtime Stability Patch (Timeout/Noise Reduction)
- Backend reliability fixes:
  - OpenAI client retries now disabled by default (`OPENAI_MAX_RETRIES=0`) to prevent long retry chains and delayed fallback.
  - Expected AI failures (timeout/network/rate limit) now log as concise warnings instead of full stack traces.
  - Digest and score recommendations switched to single-shot context prompts (precomputed DB context) to avoid multi-tool loop timeout amplification.
  - Files: `backend/services/ai_service.py`
- Outcome:
  - Faster fallback behavior under slow API/network conditions.
  - Dramatically reduced backend log noise from expected timeout scenarios.

### 2026-03-08 13:35 CDT — Threat Match Simplification (Memory Removed)
- Decision:
  - Removed persistent DB-backed memory from Threat Match to keep MVP flow simple and reliable.
  - Follow-up context is now request-level only (frontend passes prior query as optional `context`).
- Backend:
  - `generate_threat_match()` no longer reads/writes `user_memory`.
  - `/api/threat-match` now accepts optional `context`.
  - Fallback follow-up heuristic now inspects current query text only.
  - Files: `backend/services/ai_service.py`, `backend/routes/ai.py`, `backend/database.py`
- Frontend:
  - Follow-up submission passes prior query context to `/api/threat-match`.
  - File: `frontend/src/pages/Home.jsx`, `frontend/src/api/index.js`

### 2026-03-08 13:45 CDT — Timeout Reliability Tuning
- Problem observed:
  - Threat Match and Digest frequently returned fallback due to strict 10s timeout under normal API latency.
- Fixes:
  - Added per-call timeout and output-budget controls in `_run_agent(...)`.
  - Threat Match now uses compact context payloads (trimmed profile/threat/score fields) to reduce response latency.
  - Threat Match timeout set via `OPENAI_THREAT_MATCH_TIMEOUT` (default `18`).
  - Digest timeout set via `OPENAI_DIGEST_TIMEOUT` (default `18`).
  - Intent keeps a short timeout (8s) and compact output budget.
  - Files: `backend/services/ai_service.py`, `backend/.env.example`

### 2026-03-08 13:46 CDT — Threat Match Recreated (Function-Calling Pattern)
- Change:
  - Rebuilt `generate_threat_match()` to follow the same tool-calling loop pattern as `analyze_scam`:
    - passes tool definitions to Responses API
    - model calls `search_threats` / `get_user_profile` / `get_score_summary`
    - app executes tool calls and returns `function_call_output`
    - model returns final structured JSON
- Behavior:
  - Keeps deterministic fallback path seeded with DB results for reliability.
  - Normalizes action output so frontend always gets valid checklist steps.
  - Maintains request-level follow-up context (`context`) without persistent memory.
- Files:
  - `backend/services/ai_service.py`

## Change Log
- [x] Add persistent refactor tracking markdown file.
- [x] Refactor Home from local CRUD filtering to backend search-driven retrieval.
- [x] Fix intent mismatch paths and route fallback handling.
- [x] Fix scam response rendering mismatch in Home and Analyze.
- [x] Fix recommendations rendering mismatch on Score page.
- [x] Improve action checklist metadata + completion hydration.
- [x] Add lightweight personalized risk labels and reasons on threat views.
- [x] Move feed ordering closer to high-risk-first behavior.
- [x] Add Threat Match endpoint and render AI guidance/actions inline from unified search.
- [x] Add follow-up context flow for search.
- [x] Remove Analyze from visible navigation.
- [x] Auto-curate score recommendations (no manual trigger required).
- [x] Shift fallback messaging toward subtle transparency chips.
- [x] Harden runtime behavior for API timeout/network fallback and reduce stack-trace noise.
- [x] Simplify Threat Match by removing persistent DB memory and using request-level context only.
- [ ] Implement score decay and score updates from completed actions/digest actions.
- [ ] Implement digest verified/unverified segmentation and archive/search.
- [ ] Add required tests (minimum 2) around happy-path and fallback.

## Validation Log
- 2026-03-08: `frontend` production build passed (`npm run build`).
- 2026-03-08: Backend Python syntax check passed (`python3 -m py_compile ...`).
- 2026-03-08: Re-validated after Batch 2 (`npm run build`, `python3 -m py_compile routes/threats.py`).
- 2026-03-08: Re-validated after Batch 3 (`npm run build`, `python3 -m py_compile app.py database.py routes/*.py services/ai_service.py`).
- 2026-03-08: Re-validated after stability patch (`npm run build`, `python3 -m py_compile app.py database.py routes/*.py services/ai_service.py`).
- 2026-03-08: Re-validated after Threat Match simplification (`npm run build`, `python3 -m py_compile app.py database.py routes/*.py services/ai_service.py`).

## Remaining Work
- Backend/API:
  - Integrate completed actions into score updates.
  - Add lightweight score decay model.
  - Add digest archive and retrieval/search endpoints.
- Frontend:
  - Add digest verified vs unverified UI sections and linkbacks to threat details.
  - Add trend visualization and “why score moved” strip on Score page.
- Quality:
  - Add at least 2 tests required by case study rubric.
