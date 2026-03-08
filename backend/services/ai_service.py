"""
ai_service.py — Haven AI service using OpenAI Responses API with function calling.

Architecture:
  - One central _run_agent() loop handles all AI interactions
  - Tools give the AI access to our SQLite DB — the only thing it cannot do itself
  - AI handles all intelligence: intent detection, analysis, verdicts, action planning
  - Vision support: image input passed directly to gpt-5-mini
  - Every fallback path is logged with full error context for debugging
  - FORCE_FALLBACK=true env var bypasses all AI for testing

Tool functions (DB access only):
  get_user_profile     → user demographics, location, services
  search_threats       → query threat database
  get_completed_actions → what the user has already done
  get_score_summary    → latest score + weakest areas
  get_local_threats    → active threats near a location
"""

import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="[Haven AI] %(asctime)s %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("haven.ai")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TEMPLATES_PATH = Path(__file__).parent.parent.parent / "data" / "synthetic" / "action_templates.json"

SYSTEM_PERSONA = (
    "You are Haven's calm, trusted security advisor. "
    "You provide clear, actionable safety guidance in a professional but approachable tone. "
    "Never use alarmist language. Transform threats into concrete, empowering steps. "
    "When asked to respond in JSON, return only valid JSON — no markdown, no extra text."
)

MAX_TOOL_CALLS = 10  # loop protection per request

# ---------------------------------------------------------------------------
# Templates — loaded once at import time
# ---------------------------------------------------------------------------

_templates: dict = {}
try:
    with open(TEMPLATES_PATH) as f:
        _templates = json.load(f)
    logger.info(f"Loaded {len(_templates)} action templates.")
except Exception as e:
    logger.error(f"Could not load action templates from {TEMPLATES_PATH}: {e}")

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _force_fallback() -> bool:
    return os.getenv("FORCE_FALLBACK", "false").lower() == "true"


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set")
    max_retries = int(os.getenv("OPENAI_MAX_RETRIES", "0"))
    return OpenAI(api_key=api_key, max_retries=max_retries)


def _model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-5-mini")


def _get_template(threat_type: str) -> dict:
    return _templates.get(threat_type) or _templates.get("generic", {
        "why_this_matters": "Taking precautions when a safety concern is identified keeps you and your community better protected.",
        "actions": [
            {"step": "Change passwords for any potentially affected accounts", "time_estimate": "5 min", "tooltip": "Use unique passwords for each service"},
            {"step": "Enable two-factor authentication on important accounts", "time_estimate": "5 min", "tooltip": "The single most effective account security measure"},
            {"step": "Report the incident to the relevant authority", "time_estimate": "10 min", "tooltip": "FTC (reportfraud.ftc.gov) for scams, IC3 (ic3.gov) for cybercrime"},
        ],
    })


def _extract_json(text: str) -> dict:
    """Parse JSON from response — strips markdown fences if present."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


def _build_image_content(image_b64: str, mime_type: str = "image/jpeg") -> dict:
    """Build an input_image content block from a base64 string."""
    return {
        "type": "input_image",
        "image_url": f"data:{mime_type};base64,{image_b64}",
        "detail": "auto",
    }


def _normalize_search_query(query: str) -> str:
    if not query:
        return ""
    text = query.lower().strip()
    # Remove common location phrases that are better handled by profile context.
    for phrase in ("near me", "nearby", "in my area", "around me", "close to me"):
        text = text.replace(phrase, " ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = [tok for tok in text.split() if tok not in {
        "any", "what", "whats", "how", "do", "i", "my", "the", "a", "an",
        "in", "at", "for", "to", "of", "is", "are", "on", "latest", "recent",
        "trending", "alerts", "alert"
    }]
    return " ".join(tokens).strip()


def _infer_type_from_query(query: str) -> str | None:
    q = (query or "").lower()
    if any(term in q for term in ("scam", "phishing", "fraud", "smishing", "vishing", "spoof")):
        return "digital_scam"
    if any(term in q for term in ("breach", "ransomware", "malware", "cyber", "hack", "credential", "wifi", "network")):
        return "cyber_threat"
    if any(term in q for term in ("weather", "storm", "flood", "tornado", "hurricane", "heat", "snow")):
        return "weather"
    if any(term in q for term in ("crime", "theft", "break in", "break-in", "robbery", "assault", "vandal")):
        return "crime_alert"
    if any(term in q for term in ("hazard", "gas leak", "power line", "water main", "structural", "evacuation")):
        return "physical_hazard"
    return None


# ---------------------------------------------------------------------------
# Tool definitions — JSON schemas the model sees
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "name": "get_user_profile",
        "description": (
            "Retrieve a user's profile: name, location, tech literacy level, and services they use. "
            "Call this first to personalize any response. If no profile exists, the user is anonymous."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "The user's unique client identifier"},
            },
            "required": ["client_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "search_threats",
        "description": (
            "Search the Haven threat database. Use to find threats matching a query, "
            "locate threats by area, or look up threats by type or severity. "
            "All parameters are optional — pass null to skip a filter."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query":    {"type": ["string", "null"], "description": "Free-text search across title, description, location"},
                "location": {"type": ["string", "null"], "description": "City, state, or country to filter by"},
                "type":     {"type": ["string", "null"], "description": "One of: physical_hazard, digital_scam, cyber_threat, weather, crime_alert"},
                "severity": {"type": ["string", "null"], "description": "One of: low, medium, high, critical"},
                "limit":    {"type": ["integer", "null"], "description": "Max results to return (default 5)"},
            },
            "required": ["query", "location", "type", "severity", "limit"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "get_completed_actions",
        "description": (
            "Get threat action steps this user has already completed. "
            "Use this to skip steps they've done and avoid redundant advice. "
            "Pass threat_id to scope to a specific threat, or null for recent history."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "The user's unique client identifier"},
                "threat_id": {"type": ["string", "null"], "description": "Optional: scope to a specific threat ID"},
            },
            "required": ["client_id", "threat_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "get_score_summary",
        "description": (
            "Get the user's latest safety score, their digital hygiene and local awareness scores, "
            "their rating (good/fair/needs_attention), and their weakest areas. "
            "Use this for digest personalization and micro-action recommendations."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "The user's unique client identifier"},
            },
            "required": ["client_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "get_local_threats",
        "description": (
            "Get active threats near a location, optionally filtered by type. "
            "Use for digest generation, contextual safety awareness, weather alerts, and local crime context. "
            "Pass type=null to get all types."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string",          "description": "City, state, or country to search near"},
                "type":     {"type": ["string", "null"], "description": "Optional: one of physical_hazard, digital_scam, cyber_threat, weather, crime_alert"},
                "limit":    {"type": ["integer", "null"], "description": "Max results (default 10)"},
            },
            "required": ["location", "type", "limit"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]

# ---------------------------------------------------------------------------
# Tool execution — Python functions the model invokes via function calling
# ---------------------------------------------------------------------------

def _execute_tool(name: str, arguments: dict) -> str:
    """Dispatch a model tool call to the correct Python function. Returns JSON string."""
    try:
        dispatch = {
            "get_user_profile":     _tool_get_user_profile,
            "search_threats":       _tool_search_threats,
            "get_completed_actions": _tool_get_completed_actions,
            "get_score_summary":    _tool_get_score_summary,
            "get_local_threats":    _tool_get_local_threats,
        }
        fn = dispatch.get(name)
        if not fn:
            logger.warning(f"Unknown tool requested by model: {name!r}")
            return json.dumps({"error": f"Unknown tool: {name}"})

        result = fn(**arguments)
        return json.dumps(result)

    except Exception as e:
        logger.error(
            f"Tool execution error — {name}({arguments}): {type(e).__name__}: {e}",
            exc_info=True,
        )
        return json.dumps({"error": str(e), "tool": name})


def _tool_get_user_profile(client_id: str) -> dict:
    from database import get_db
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM user_profiles WHERE client_id = ?", (client_id,))
        row = cursor.fetchone()
        if not row:
            return {"found": False, "client_id": client_id}
        profile = dict(row)
        try:
            profile["services"] = json.loads(profile.get("services") or "[]")
        except Exception:
            profile["services"] = []
        profile["found"] = True
        return profile
    finally:
        conn.close()


def _tool_search_threats(query=None, location=None, type=None, severity=None, limit=None) -> dict:
    from database import get_db, VALID_TYPES, VALID_SEVERITIES
    limit = min(int(limit or 5), 20)
    normalized_query = _normalize_search_query(query or "")
    inferred_type = type if type in VALID_TYPES else _infer_type_from_query(query or "")
    conn = get_db()
    try:
        cursor = conn.cursor()
        base = "SELECT id, title, type, severity, status, location, description FROM threats WHERE 1=1"

        def _run(include_query: bool) -> list[dict]:
            q = base
            params = []
            if include_query and normalized_query:
                q += " AND (title LIKE ? OR description LIKE ? OR location LIKE ?)"
                like = f"%{normalized_query}%"
                params.extend([like, like, like])
            if location:
                q += " AND location LIKE ?"
                params.append(f"%{location}%")
            if inferred_type:
                q += " AND type = ?"
                params.append(inferred_type)
            if severity and severity in VALID_SEVERITIES:
                q += " AND severity = ?"
                params.append(severity)
            q += (
                " ORDER BY CASE severity "
                "WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT ?"
            )
            params.append(limit)
            cursor.execute(q, params)
            return [dict(row) for row in cursor.fetchall()]

        threats = _run(include_query=True)
        # If natural language query over-constrains results, retry with type/location only.
        if not threats and normalized_query and inferred_type:
            threats = _run(include_query=False)

        return {
            "threats": threats,
            "count": len(threats),
            "normalized_query": normalized_query,
            "inferred_type": inferred_type,
        }
    finally:
        conn.close()


def _tool_get_completed_actions(client_id: str, threat_id=None) -> dict:
    from database import get_db
    conn = get_db()
    try:
        cursor = conn.cursor()
        if threat_id:
            cursor.execute(
                "SELECT action_index, action_step, completed_at FROM completed_actions "
                "WHERE client_id = ? AND threat_id = ? ORDER BY action_index",
                (client_id, threat_id),
            )
        else:
            cursor.execute(
                "SELECT threat_id, action_index, action_step, completed_at FROM completed_actions "
                "WHERE client_id = ? ORDER BY completed_at DESC LIMIT 20",
                (client_id,),
            )
        actions = [dict(row) for row in cursor.fetchall()]
        return {"completed_actions": actions, "count": len(actions)}
    finally:
        conn.close()


def _tool_get_score_summary(client_id: str) -> dict:
    from database import get_db
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT total, digital_hygiene, local_awareness, rating, answers, calculated_at "
            "FROM safety_scores WHERE client_id = ? ORDER BY calculated_at DESC LIMIT 1",
            (client_id,),
        )
        row = cursor.fetchone()
        if not row:
            return {"found": False, "client_id": client_id}

        score = dict(row)
        try:
            answers = json.loads(score.get("answers") or "{}")
        except Exception:
            answers = {}

        # Identify weakest areas (scored below 50% of max)
        score_weights = {
            "password_habits":   {"unique": 25, "mixed": 15, "reused": 0},
            "two_factor_auth":   {"all": 20,    "some": 12,  "none": 0},
            "software_updates":  {"current": 15, "sometimes": 8, "rarely": 0},
            "local_awareness":   {"high": 15,   "medium": 10, "low": 0},
            "physical_security": {"high": 15,   "medium": 10, "low": 0},
            "emergency_prep":    {"prepared": 10, "partial": 6, "unprepared": 0},
        }
        weakest = []
        for field, options in score_weights.items():
            answer = answers.get(field, "")
            earned = options.get(answer, 0)
            max_pts = max(options.values())
            if max_pts > 0 and (earned / max_pts) < 0.5:
                weakest.append(field)

        score["weakest_areas"] = weakest
        score["answers"] = answers
        score["found"] = True
        return score
    finally:
        conn.close()


def _tool_get_local_threats(location: str, type=None, limit=None) -> dict:
    from database import get_db, VALID_TYPES
    limit = min(int(limit or 10), 20)
    conn = get_db()
    try:
        cursor = conn.cursor()
        q = (
            "SELECT id, title, type, severity, status, location, description "
            "FROM threats WHERE status != 'resolved' AND location LIKE ?"
        )
        params = [f"%{location}%"]
        if type and type in VALID_TYPES:
            q += " AND type = ?"
            params.append(type)
        q += " ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT ?"
        params.append(limit)
        cursor.execute(q, params)
        threats = [dict(row) for row in cursor.fetchall()]
        return {"threats": threats, "count": len(threats), "location": location}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Central agent runner
# ---------------------------------------------------------------------------

def _run_agent(
    instructions: str,
    user_input: list,
    tools: list = None,
    timeout: float = 30.0,
    max_tool_calls: int = MAX_TOOL_CALLS,
) -> str:
    """
    Run the Responses API agent loop.

    The model may call tools multiple times before producing a final text response.
    We execute each tool call and feed results back until the model stops calling tools.

    Args:
        instructions: System prompt for this task
        user_input:   List of message/content dicts for the Responses API
        tools:        Tool subset to expose (None = all TOOLS)
        timeout:      Per-API-call timeout in seconds

    Returns:
        Final output_text from the model

    Raises:
        Any exception — callers catch and handle fallback
    """
    client = _get_client()
    active_tools = tools if tools is not None else TOOLS
    input_list = list(user_input)
    tool_call_count = 0

    while True:
        response = client.responses.create(
            model=_model(),
            instructions=instructions,
            input=input_list,
            tools=active_tools,
            text={"verbosity": "low"},
            timeout=timeout,
        )

        function_calls = [item for item in response.output if item.type == "function_call"]

        if not function_calls:
            # Model finished — return final text
            return response.output_text

        # Carry all output items (incl. reasoning) into the next turn
        input_list += response.output

        for call in function_calls:
            if tool_call_count >= max_tool_calls:
                logger.warning(
                    f"Max tool calls ({max_tool_calls}) reached — breaking agent loop early. "
                    f"Last attempted: {call.name}"
                )
                break

            tool_call_count += 1
            try:
                args = json.loads(call.arguments) if isinstance(call.arguments, str) else call.arguments
            except json.JSONDecodeError as e:
                logger.error(f"Could not parse tool arguments for {call.name}: {e} — raw: {call.arguments!r}")
                args = {}

            logger.info(f"Tool call [{tool_call_count}/{max_tool_calls}]: {call.name}({args})")
            result = _execute_tool(call.name, args)
            preview = result[:300] + ("..." if len(result) > 300 else "")
            logger.info(f"Tool result: {call.name} → {preview}")

            input_list.append({
                "type": "function_call_output",
                "call_id": call.call_id,
                "output": result,
            })


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_intent(text: str = None, image_b64: str = None, client_id: str = None) -> tuple[dict, bool]:
    """
    Detect what the user wants from a unified search bar input.
    Accepts text, image, or both. Optionally fetches user profile for context.

    Returns:
        (result, is_ai_generated)
        result: { intent, query, context, route_to }
        intent: "search" | "scam_check" | "digest" | "score" | "unknown"
    """
    if _force_fallback():
        return {"intent": "search", "query": text or "", "context": "fallback mode", "route_to": "threats"}, False

    if not text and not image_b64:
        return {"intent": "unknown", "query": "", "context": "No input provided", "route_to": "threats"}, False

    try:
        content = []
        if text:
            content.append({"type": "input_text", "text": text})
        if image_b64:
            content.append(_build_image_content(image_b64))

        user_input = [{"role": "user", "content": content}]

        tools = [t for t in TOOLS if t["name"] in ("get_user_profile", "search_threats")]

        instructions = (
            f"{SYSTEM_PERSONA}\n\n"
            "Your task: Determine what the user wants based on their input (text and/or image).\n"
            f"{'Call get_user_profile to understand their context. client_id=' + client_id if client_id else ''}\n"
            "If the input looks like suspicious content to check (email, SMS, link, screenshot of a message), "
            "classify as scam_check. If it's a general query about threats or locations, classify as search. "
            "If they ask about their safety score, classify as score. If they want a digest or summary, classify as digest.\n\n"
            "Return ONLY this JSON:\n"
            '{"intent": "search|scam_check|digest|score|unknown", '
            '"query": "cleaned search query or empty string", '
            '"context": "one sentence explaining your reasoning", '
            '"route_to": "threats|digest|score"}'
        )

        intent_timeout = float(os.getenv("OPENAI_INTENT_TIMEOUT", "8"))
        result_text = _run_agent(
            instructions,
            user_input,
            tools,
            timeout=intent_timeout,
            max_tool_calls=2,
        )
        result = _extract_json(result_text)

        intent = (result.get("intent") or "").strip()
        if intent in ("scam_check", "search", "unknown"):
            result["route_to"] = "threats"
        elif intent == "score":
            result["route_to"] = "score"
        elif intent == "digest":
            result["route_to"] = "digest"
        else:
            result["route_to"] = "threats"

        return result, True

    except Exception as e:
        logger.error(
            f"detect_intent → fallback | input_len={len(text or '')} has_image={bool(image_b64)} "
            f"client_id={client_id} | {type(e).__name__}: {e}",
            exc_info=True,
        )
        return {"intent": "search", "query": text or "", "context": "AI unavailable", "route_to": "threats"}, False


def generate_actions(threat: dict, client_id: str = None) -> tuple[dict, bool]:
    """
    Generate a personalized action plan for a threat.
    Pre-fetches all context in Python, then makes a single direct API call (no agent loop).

    Returns:
        (result, is_ai_generated)
        result: { why_this_matters, actions[] }
    """
    if _force_fallback():
        logger.info(f"generate_actions — FORCE_FALLBACK active, using template for type={threat.get('type')}")
        return _get_template(threat["type"]), False

    try:
        # Pre-fetch all context in Python — no tool calls in the API call
        profile = {}
        completed = {}
        if client_id:
            profile = _tool_get_user_profile(client_id)
            completed = _tool_get_completed_actions(client_id, threat.get("id"))

        context_parts = [
            f"Threat: {threat['title']}",
            f"Type: {threat['type']} | Severity: {threat['severity']} | Location: {threat['location']}",
            f"Description: {threat['description']}",
        ]
        if profile and not profile.get("error"):
            context_parts.append(f"User profile: {profile}")
        if completed.get("completed_actions"):
            already_done = [a["action_step"] for a in completed["completed_actions"]]
            context_parts.append(f"Steps already completed (skip these): {already_done}")

        context = "\n".join(context_parts)

        instructions = (
            f"{SYSTEM_PERSONA}\n\n"
            "Generate a calm, personalized protective action plan for this threat. "
            "3 to 5 steps, ordered by priority. Each step must be immediately actionable. "
            "Adjust complexity to the user's tech literacy if known. "
            "Assign points (3–5) per step based on impact.\n\n"
            "Return ONLY this JSON:\n"
            '{"why_this_matters":"2-3 calm sentences on relevance and what they can do",'
            '"actions":[{"step":"actionable step","time_estimate":"X min","tooltip":"brief tip","points":4}]}'
        )

        client_ai = _get_client()
        timeout = float(os.getenv("OPENAI_ACTIONS_TIMEOUT", "25"))
        response = client_ai.responses.create(
            model=_model(),
            instructions=instructions,
            input=[{"role": "user", "content": f"Generate protective actions.\n\nContext:\n{context}"}],
            text={"format": {"type": "text"}},
            timeout=timeout,
        )

        result = _extract_json(response.output_text)

        if not isinstance(result.get("actions"), list) or not result["actions"]:
            raise ValueError("AI returned empty or invalid actions list")

        return result, True

    except Exception as e:
        logger.error(
            f"generate_actions → fallback | threat_id={threat.get('id')} type={threat.get('type')} "
            f"client_id={client_id} | {type(e).__name__}: {e}",
            exc_info=True,
        )
        return _get_template(threat["type"]), False


def analyze_scam(text: str = None, image_b64: str = None, client_id: str = None) -> tuple[dict, bool]:
    """
    Analyze suspicious text or image for scam/phishing indicators.
    Agent fetches user profile and completed actions for personalized, context-aware analysis.

    Accepts text, image, or both. If neither provided, returns error.

    Returns:
        (result, is_ai_generated)
        result: { verdict, confidence, risk_level, explanation, red_flags, actions }
        verdict: "scam" | "legitimate" | "unclear"
    """
    if _force_fallback():
        logger.info("analyze_scam — FORCE_FALLBACK active, returning scam fallback")
        return _get_scam_fallback(), False

    if not text and not image_b64:
        return {"error": "No text or image provided to analyze"}, False

    # Truncate long text
    truncated = False
    if text and len(text) > 5000:
        text = text[:5000]
        truncated = True
        logger.info("analyze_scam — input text truncated to 5000 chars")

    try:
        content = []
        if text:
            content.append({"type": "input_text", "text": f"Analyze this content for scam/phishing indicators:\n\n{text}"})
        if image_b64:
            content.append(_build_image_content(image_b64))
            if not text:
                content.insert(0, {"type": "input_text", "text": "Analyze this image for scam, phishing, or fraud indicators:"})

        if truncated:
            content.append({"type": "input_text", "text": "[Note: Input text was truncated to 5000 characters]"})

        if client_id:
            content.append({
                "type": "input_text",
                "text": (
                    f"User client_id: {client_id}\n"
                    f"Call get_user_profile('{client_id}') to understand what services this user uses — "
                    "this affects risk level (e.g. if they use Venmo and this looks like a Venmo scam, risk is higher). "
                    f"Call get_completed_actions('{client_id}', null) to skip steps they've already taken."
                ),
            })

        tools = [t for t in TOOLS if t["name"] in ("get_user_profile", "search_threats", "get_completed_actions")]

        instructions = (
            f"{SYSTEM_PERSONA}\n\n"
            "Analyze the user's input for scam, phishing, or social engineering indicators. "
            "Use available tools to personalize your assessment. "
            "If confidence is below 0.6, verdict MUST be 'unclear'. "
            "Calm tone throughout — even high-risk findings presented without panic.\n\n"
            "Return ONLY this JSON:\n"
            '{"verdict": "scam|legitimate|unclear", '
            '"confidence": 0.85, '
            '"risk_level": "high|medium|low", '
            '"explanation": "calm 2-3 sentence explanation", '
            '"red_flags": ["specific indicator found"], '
            '"actions": [{"step": "...", "time_estimate": "X min", "tooltip": "..."}]}'
        )

        result_text = _run_agent(instructions, [{"role": "user", "content": content}], tools)
        result = _extract_json(result_text)

        required = {"verdict", "confidence", "risk_level", "explanation", "actions"}
        missing = required - result.keys()
        if missing:
            raise ValueError(f"AI response missing required fields: {missing}")

        if result["verdict"] not in ("scam", "legitimate", "unclear"):
            raise ValueError(f"Invalid verdict: {result['verdict']!r}")

        if float(result.get("confidence", 1.0)) < 0.6:
            result["verdict"] = "unclear"

        result["text_truncated"] = truncated
        return result, True

    except Exception as e:
        logger.error(
            f"analyze_scam → fallback | has_text={bool(text)} has_image={bool(image_b64)} "
            f"client_id={client_id} | {type(e).__name__}: {e}",
            exc_info=True,
        )
        return _get_scam_fallback(), False


def generate_search_guidance(query: str = None, image_b64: str = None, client_id: str = None) -> tuple[dict, bool]:
    """
    Generate AI guidance for unified-search queries classified as intent='search'.
    Pre-fetches all DB data in Python first, then makes a single direct AI call (no tool loop).
    This avoids multi-round-trip timeouts.
    """
    text = (query or "").strip()
    if _force_fallback():
        logger.info("generate_search_guidance — FORCE_FALLBACK active")
        return _get_search_guidance_fallback(text), False

    if not text and not image_b64:
        return _get_search_guidance_fallback(""), False

    truncated = False
    if text and len(text) > 5000:
        text = text[:5000]
        truncated = True
        logger.info("generate_search_guidance — input text truncated to 5000 chars")

    try:
        # Pre-fetch all context in Python — no tool calls needed
        profile_ctx = ""
        score_ctx = ""
        threats_ctx = ""

        if client_id:
            try:
                profile = _tool_get_user_profile(client_id)
                if profile.get("found"):
                    profile_ctx = (
                        f"User profile: location={profile.get('location') or 'unknown'}, "
                        f"tech_literacy={profile.get('tech_literacy') or 'intermediate'}, "
                        f"services={profile.get('services') or []}."
                    )
            except Exception:
                pass

            try:
                score = _tool_get_score_summary(client_id)
                if score.get("found"):
                    score_ctx = (
                        f"Safety score: {score.get('total')}/100 ({score.get('rating')}). "
                        f"Weakest areas: {score.get('weakest_areas') or []}."
                    )
            except Exception:
                pass

        if text:
            try:
                threats_data = _tool_search_threats(query=text, location=None, type=None, severity=None, limit=5)
                threats_list = threats_data.get("threats", [])
                if threats_list:
                    threats_ctx = "Relevant threats in DB: " + "; ".join(
                        f"{t['title']} ({t['severity']}, {t['location']})"
                        for t in threats_list[:3]
                    )
            except Exception:
                pass

        context_parts = []
        if profile_ctx:
            context_parts.append(profile_ctx)
        if score_ctx:
            context_parts.append(score_ctx)
        if threats_ctx:
            context_parts.append(threats_ctx)

        context_block = "\n".join(context_parts)

        prompt_text = (
            f"User question: {text}\n\n"
            + (f"Context:\n{context_block}\n\n" if context_block else "")
            + "Answer the question directly and calmly. Tailor language to the user's tech literacy if known."
        )

        content = []
        if text or context_block:
            content.append({"type": "input_text", "text": prompt_text})
        if image_b64:
            if not text:
                content.append({"type": "input_text", "text": "Analyze this image for safety context, then provide practical next steps."})
            content.append(_build_image_content(image_b64))
        if truncated:
            content.append({"type": "input_text", "text": "[Note: Input text was truncated to 5000 characters]"})

        instructions = (
            f"{SYSTEM_PERSONA}\n\n"
            "Answer the user's safety question directly and calmly. "
            "Provide 2-3 actions, each with 2-4 checkable steps. Keep it brief.\n\n"
            "Return ONLY this JSON:\n"
            '{"answer":"2-3 calm sentences",'
            '"actions":[{"title":"action title","why":"1 sentence why it matters",'
            '"steps":[{"step":"checkable step","time":"X min","points":3}]}]}'
        )

        # Single direct API call — no tools, no loop
        client_ai = _get_client()
        timeout = float(os.getenv("OPENAI_SEARCH_TIMEOUT", "25"))
        response = client_ai.responses.create(
            model=_model(),
            instructions=instructions,
            input=[{"role": "user", "content": content}],
            text={"verbosity": "low"},
            timeout=timeout,
        )
        result_text = response.output_text
        result = _extract_json(result_text)

        answer = (result.get("answer") or "").strip()
        if not answer:
            raise ValueError("AI response missing answer")

        actions = []
        for raw in (result.get("actions") or [])[:3]:
            if not isinstance(raw, dict):
                continue
            title = (raw.get("title") or "").strip()
            if not title:
                continue
            steps = []
            for s in (raw.get("steps") or [])[:4]:
                if not isinstance(s, dict) or not s.get("step"):
                    continue
                try:
                    points = max(0, min(int(s.get("points", 0)), 25))
                except Exception:
                    points = 0
                steps.append({
                    "step": s["step"].strip(),
                    "time": (s.get("time") or "").strip(),
                    "points": points,
                })
            if steps:
                actions.append({
                    "title": title,
                    "why": (raw.get("why") or "").strip(),
                    "steps": steps,
                    "total_points": sum(s["points"] for s in steps),
                })

        if not actions:
            actions = _get_search_guidance_fallback(text).get("actions", [])

        return {"answer": answer, "actions": actions, "text_truncated": truncated}, True

    except Exception as e:
        logger.error(
            f"generate_search_guidance → fallback | query_len={len(text)} has_image={bool(image_b64)} "
            f"client_id={client_id} | {type(e).__name__}: {e}",
            exc_info=True,
        )
        return _get_search_guidance_fallback(text), False


def generate_digest(client_id: str = None, location: str = None, interests: str = "both") -> tuple[dict, bool]:
    """
    Generate a personalized weekly safety digest.
    Pre-fetches all context in Python, then makes a single direct API call (no agent loop).

    Returns:
        (result, is_ai_generated)
        result: { headline, summary, top_priority, categories, positive_note }
    """
    if _force_fallback():
        logger.info("generate_digest — FORCE_FALLBACK active, using template digest")
        return _get_template_digest_fallback(location or "your area"), False

    try:
        # Pre-fetch all context in Python — no tool calls in the API call
        profile = {}
        score = {}
        threats_data = {}

        if client_id:
            profile = _tool_get_user_profile(client_id)
            score = _tool_get_score_summary(client_id)
            user_location = profile.get("location") or location or ""
        else:
            user_location = location or ""

        if user_location:
            threats_data = _tool_get_local_threats(location=user_location, limit=10)
        else:
            threats_data = _tool_search_threats(limit=10)

        # Build context string
        context_parts = []
        if profile and not profile.get("error"):
            context_parts.append(f"User profile: {profile}")
        if score and not score.get("error"):
            context_parts.append(f"Security score summary: {score}")
        if threats_data.get("threats"):
            context_parts.append(f"Local threats ({len(threats_data['threats'])} found): {threats_data['threats'][:8]}")
        if interests != "both":
            context_parts.append(f"User interests: {interests} threats only.")

        context = "\n".join(context_parts) if context_parts else "No specific user data available."

        instructions = (
            f"{SYSTEM_PERSONA}\n\n"
            "Generate a calm, personalized weekly safety digest. Keep it brief and encouraging.\n\n"
            "Return ONLY this JSON:\n"
            '{"headline":"one calm informative headline",'
            '"summary":"2-3 sentences on the safety landscape this week",'
            '"top_priority":{"title":"most important thing to address","action":"one specific actionable step"},'
            '"categories":{"digital":0,"physical":0,"resolved":0},'
            '"positive_note":"one genuinely encouraging observation"}'
        )

        client_ai = _get_client()
        timeout = float(os.getenv("OPENAI_DIGEST_TIMEOUT", "25"))
        response = client_ai.responses.create(
            model=_model(),
            instructions=instructions,
            input=[{"role": "user", "content": f"Generate my safety digest.\n\nContext:\n{context}"}],
            text={"format": {"type": "text"}},
            timeout=timeout,
        )

        result_text = response.output_text
        result = _extract_json(result_text)
        result["generated_at"] = datetime.now(timezone.utc).isoformat()
        return result, True

    except Exception as e:
        logger.error(
            f"generate_digest → fallback | client_id={client_id} location={location} "
            f"interests={interests} | {type(e).__name__}: {e}",
            exc_info=True,
        )
        return _get_template_digest_fallback(location or "your area"), False


def generate_score_recommendations(client_id: str, location: str = None) -> tuple[dict, bool]:
    """
    Generate 2-3 AI micro-action recommendations based on user's weakest score areas
    and active local threats.

    Returns:
        (result, is_ai_generated)
        result: { recommendations: [{ action, score_impact, time_estimate, reason }] }
    """
    if _force_fallback():
        logger.info("generate_score_recommendations — FORCE_FALLBACK active")
        return _get_score_recommendations_fallback(), False

    try:
        user_input = [{
            "role": "user",
            "content": [{
                "type": "input_text",
                "text": (
                    f"Generate 2-3 personalized safety micro-actions for client_id={client_id}.\n"
                    f"1. Call get_score_summary('{client_id}') to find their weakest areas.\n"
                    f"2. Call get_user_profile('{client_id}') for their location and tech literacy.\n"
                    + (f"3. Call get_local_threats(location='{location}', type=null, limit=5) for local context.\n" if location else "")
                    + "4. Suggest 2-3 small, immediately achievable actions that target their weakest areas.\n"
                    "   Each should have a realistic score impact (+3 to +15 points).\n\n"
                    "Return ONLY this JSON:\n"
                    '{"recommendations": ['
                    '{"action": "specific step", "score_impact": "+5 points", '
                    '"time_estimate": "3 min", "reason": "why this helps them specifically"}'
                    "]}"
                ),
            }],
        }]

        tools = [t for t in TOOLS if t["name"] in ("get_user_profile", "get_score_summary", "get_local_threats")]
        result_text = _run_agent(SYSTEM_PERSONA, user_input, tools)
        result = _extract_json(result_text)
        return result, True

    except Exception as e:
        logger.error(
            f"generate_score_recommendations → fallback | client_id={client_id} "
            f"location={location} | {type(e).__name__}: {e}",
            exc_info=True,
        )
        return _get_score_recommendations_fallback(), False


# ---------------------------------------------------------------------------
# Safety Score — pure rule-based, no AI needed
# ---------------------------------------------------------------------------

_SCORE_WEIGHTS = {
    "password_habits":   {"unique": 25, "mixed": 15, "reused": 0},
    "two_factor_auth":   {"all": 20,    "some": 12,  "none": 0},
    "software_updates":  {"current": 15, "sometimes": 8, "rarely": 0},
    "local_awareness":   {"high": 15,   "medium": 10, "low": 0},
    "physical_security": {"high": 15,   "medium": 10, "low": 0},
    "emergency_prep":    {"prepared": 10, "partial": 6, "unprepared": 0},
}
_SCORE_MAX = {k: max(v.values()) for k, v in _SCORE_WEIGHTS.items()}


def calculate_score(answers: dict) -> dict:
    """
    Calculate safety score from questionnaire answers.
    Purely rule-based — deterministic, instant, no AI.

    Returns score breakdown: total (0-100), digital_hygiene (0-60),
    local_awareness (0-40), rating, and per-question details.
    """
    details = {}
    digital_score = 0
    local_score = 0

    digital_fields = {"password_habits", "two_factor_auth", "software_updates"}
    local_fields   = {"local_awareness", "physical_security", "emergency_prep"}

    for field, options in _SCORE_WEIGHTS.items():
        answer = answers.get(field, "")
        earned = options.get(answer, 0)
        max_pts = _SCORE_MAX[field]
        details[field] = {
            "answer":     answer,
            "score":      earned,
            "max":        max_pts,
            "percentage": round((earned / max_pts) * 100) if max_pts else 0,
        }
        if field in digital_fields:
            digital_score += earned
        elif field in local_fields:
            local_score += earned

    total = digital_score + local_score

    if total >= 80:
        rating, rating_label = "good", "Good"
    elif total >= 50:
        rating, rating_label = "fair", "Fair"
    else:
        rating, rating_label = "needs_attention", "Needs Attention"

    return {
        "total":               total,
        "digital_hygiene":     digital_score,
        "digital_hygiene_max": 60,
        "local_awareness":     local_score,
        "local_awareness_max": 40,
        "rating":              rating,
        "rating_label":        rating_label,
        "details":             details,
        "calculated_at":       datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Fallback helpers 
# ---------------------------------------------------------------------------

def _get_scam_fallback() -> dict:
    return {
        "verdict":     "unclear",
        "confidence":  0.0,
        "risk_level":  "medium",
        "explanation": (
            "We were unable to complete an AI analysis at this time. "
            "As a precaution, treat this content carefully and follow the standard protective steps below."
        ),
        "red_flags": [],
        "actions":   _templates.get("digital_scam", {}).get("actions", [
            {"step": "Do not click any links or reply to the message", "time_estimate": "Immediate", "tooltip": "When in doubt, do not engage"},
            {"step": "Report the message to your provider or platform", "time_estimate": "1 min",     "tooltip": "Helps protect others"},
            {"step": "Change your password if you entered any credentials", "time_estimate": "5 min",  "tooltip": "Immediate damage control"},
        ]),
        "ai_unavailable": True,
    }


def _get_search_guidance_fallback(query: str) -> dict:
    q_lower = (query or "").lower()

    if any(t in q_lower for t in ("home network", "wifi", "wi-fi", "router")):
        answer = "Secure your home network by hardening your router first. Use WPA2/WPA3 encryption, a strong unique Wi-Fi password, and keep firmware updated."
        actions = [
            {"title": "Harden your router settings", "why": "Router defaults are the most common weak point in home security.",
             "steps": [
                 {"step": "Change the router admin password", "time": "3 min", "points": 4},
                 {"step": "Set Wi-Fi security to WPA2 or WPA3", "time": "2 min", "points": 3},
                 {"step": "Disable WPS", "time": "1 min", "points": 2},
             ]},
            {"title": "Reduce unauthorized device access", "why": "Unknown devices on your network increase account and privacy risk.",
             "steps": [
                 {"step": "Install router firmware updates", "time": "5 min", "points": 4},
                 {"step": "Remove unknown connected devices", "time": "3 min", "points": 3},
             ]},
        ]
    elif any(t in q_lower for t in ("data breach", "breach", "leak", "leaked")):
        answer = "Act quickly to secure accounts tied to your email and phone. Prioritize password resets and account protections first."
        actions = [
            {"title": "Secure critical accounts", "why": "Email and banking are the highest-impact takeover targets after a breach.",
             "steps": [
                 {"step": "Change passwords for email and banking accounts", "time": "8 min", "points": 5},
                 {"step": "Enable two-factor authentication", "time": "4 min", "points": 4},
             ]},
            {"title": "Check for signs of misuse", "why": "Early detection reduces fraud impact and speeds recovery.",
             "steps": [
                 {"step": "Review recent sign-ins and transactions", "time": "5 min", "points": 3},
                 {"step": "Place a credit freeze if sensitive data was exposed", "time": "5 min", "points": 4},
             ]},
        ]
    else:
        answer = "Here is a practical safety plan based on your question. Start with the first step to reduce risk without overreacting."
        actions = [
            {"title": "Apply baseline protections", "why": "These defaults are safe and effective across most situations.",
             "steps": [
                 {"step": "Pause before clicking links or sharing sensitive info", "time": "1 min", "points": 2},
                 {"step": "Verify requests through official channels", "time": "3 min", "points": 3},
                 {"step": "Enable two-factor authentication on key accounts", "time": "5 min", "points": 4},
             ]},
        ]

    for action in actions:
        action["total_points"] = sum(s["points"] for s in action["steps"])

    return {"answer": answer, "actions": actions, "ai_unavailable": True}


def _get_template_digest_fallback(location: str) -> dict:
    from database import get_db
    threats = []
    try:
        conn = get_db()
        try:
            cursor = conn.cursor()
            q = "SELECT * FROM threats WHERE status != 'resolved'"
            params = []
            if location and location != "your area":
                q += " AND location LIKE ?"
                params.append(f"%{location}%")
            q += " ORDER BY created_at DESC LIMIT 20"
            cursor.execute(q, params)
            threats = [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()
    except Exception as e:
        logger.error(f"_get_template_digest_fallback — DB error: {e}", exc_info=True)

    active   = [t for t in threats if t.get("status") != "resolved"]
    resolved = len(threats) - len(active)
    digital  = sum(1 for t in active if t.get("type") in ("digital_scam", "cyber_threat"))
    physical = sum(1 for t in active if t.get("type") in ("physical_hazard", "weather", "crime_alert"))

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    top = min(active, key=lambda t: severity_order.get(t.get("severity", "low"), 3)) if active else None

    return {
        "headline": f"Your area has {len(active)} active safety alert{'s' if len(active) != 1 else ''} this week.",
        "summary": (
            f"There {'are' if len(active) != 1 else 'is'} {len(active)} active alert{'s' if len(active) != 1 else ''}, "
            f"including {digital} digital and {physical} physical safety concern{'s' if physical != 1 else ''}. "
            "Most threats have clear action steps available."
        ),
        "top_priority": {
            "title":  top["title"] if top else "Review your current safety posture",
            "action": f"Review and address: {top['title']}" if top else "Complete your safety questionnaire",
        },
        "categories":   {"digital": digital, "physical": physical, "resolved": resolved},
        "positive_note": (
            f"{resolved} alert{'s have' if resolved != 1 else ' has'} been resolved — staying informed is the first step to staying safe."
            if resolved > 0
            else "Being informed and prepared puts you ahead of most people."
        ),
        "generated_at":  datetime.now(timezone.utc).isoformat(),
        "ai_unavailable": True,
    }


def _get_score_recommendations_fallback() -> dict:
    return {
        "recommendations": [
            {"action": "Enable two-factor authentication on your email account", "score_impact": "+20 points", "time_estimate": "5 min", "reason": "Email access is the key to all your other accounts"},
            {"action": "Use a password manager to generate a unique password for one account", "score_impact": "+15 points", "time_estimate": "10 min", "reason": "Password reuse is the most common attack vector"},
            {"action": "Check that your phone OS and apps are up to date", "score_impact": "+8 points", "time_estimate": "5 min", "reason": "Updates patch known security vulnerabilities"},
        ],
        "ai_unavailable": True,
    }
