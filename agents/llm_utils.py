"""
agents/llm_utils.py
--------------------
Shared LLM helpers: factory, retry, think-tag stripping, JSON extraction.

FIX 1 — Gemini 429 / RESOURCE_EXHAUSTED:
  The free tier has two limits:
    - RPM  (requests per minute) → recoverable with a short sleep + retry
    - Daily quota exhausted      → recover by switching to a different model

  Strategy:
    1. Try the configured primary model (Groq > Gemini preference)
    2. On Gemini 429: retry up to 3 times with exponential backoff (10s, 30s, 60s)
    3. If all retries fail: automatically fall back through the model chain:
         gemini-2.0-flash → gemini-1.5-flash → gemini-2.0-flash-lite
    4. If all Gemini models exhausted and no Groq key: raise with clear message

FIX 2 — <think> tag stripping:
  Qwen3-32b / DeepSeek-R1 / o1 wrap responses in <think>...</think>.
  get_text_from_llm() and parse_json_from_llm() both strip these first.
"""

import os
import re
import json
import time
from dotenv import load_dotenv

load_dotenv()

# Groq model fallback chain (active models on Groq)
_GROQ_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "groq/compound-mini",
]

# Gemini model fallback chain (tried in order on quota exhaustion)
_GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-2.0-flash-lite",
]

# How long to wait between retries (seconds)
_RETRY_DELAYS = [3, 8]


# ── LLM factory ───────────────────────────────────────────────────────────────

def get_llm(temperature: float = 0.3, model_override: str = None):
    """
    Returns the best available LLM client.

    Priority:
      1. GROQ_API_KEY → ChatGroq (openai/gpt-oss-120b, fast & no quota issues)
      2. GOOGLE_API_KEY → ChatGoogleGenerativeAI (gemini-2.0-flash)
    """
    groq_key   = os.getenv("GROQ_API_KEY", "").strip()
    google_key = os.getenv("GOOGLE_API_KEY", "").strip()

    if groq_key:
        from langchain_groq import ChatGroq
        model = model_override or os.getenv("GROQ_MODEL", _GROQ_MODELS[0]).strip()
        print(f"[LLM] Using Groq → {model}")
        return ChatGroq(model=model, temperature=temperature, api_key=groq_key)

    if google_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        model = model_override or _GEMINI_MODELS[0]
        print(f"[LLM] Using Gemini → {model}")
        return ChatGoogleGenerativeAI(
            model=model,
            temperature=temperature,
            google_api_key=google_key,
        )

    raise RuntimeError(
        "No LLM API key found in .env.\n"
        "  Option A (recommended — no daily quota): set GROQ_API_KEY\n"
        "    Get a free key at https://console.groq.com\n"
        "  Option B: set GOOGLE_API_KEY\n"
        "    Get a free key at https://aistudio.google.com"
    )


def _is_quota_error(e: Exception) -> bool:
    """Return True if the exception is a rate-limit / quota error."""
    msg = str(e).lower()
    return any(x in msg for x in [
        "resource_exhausted", "429", "quota", "rate limit", "ratelimit"
    ])


def call_llm(messages: list, temperature: float = 0.3) -> str:
    """
    Call the LLM with automatic retry + model fallback.
    Tries Groq models first, then falls back to Gemini if configured.
    """
    groq_key   = os.getenv("GROQ_API_KEY", "").strip()
    google_key = os.getenv("GOOGLE_API_KEY", "").strip()

    # ── Groq path with fallback models ───────────────────────────────────────
    if groq_key:
        from langchain_groq import ChatGroq
        configured_model = os.getenv("GROQ_MODEL", "").strip()
        models_to_try = [configured_model] if configured_model else []
        for m in _GROQ_MODELS:
            if m not in models_to_try:
                models_to_try.append(m)

        for model in models_to_try:
            try:
                llm = ChatGroq(model=model, temperature=temperature, api_key=groq_key)
                resp = llm.invoke(messages)
                content = resp.content or ""
                if content:
                    return content
            except Exception as e:
                print(f"[LLM] Groq {model} error: {type(e).__name__}: {e}")
                continue

    # ── Gemini path (retry + model fallback) ──────────────────────────────────
    if not google_key:
        print("[LLM] No API key configured.")
        return ""

    from langchain_google_genai import ChatGoogleGenerativeAI

    for model in _GEMINI_MODELS:
        for attempt, delay in enumerate(_RETRY_DELAYS, start=1):
            try:
                llm = ChatGoogleGenerativeAI(
                    model=model,
                    temperature=temperature,
                    google_api_key=google_key,
                )
                resp = llm.invoke(messages)
                raw = resp.content or ""
                if raw:
                    if attempt > 1:
                        print(f"[LLM] Gemini {model} succeeded on attempt {attempt}")
                    return raw

            except Exception as e:
                if _is_quota_error(e):
                    print(
                        f"[LLM] Gemini {model} quota/rate-limit error "
                        f"(attempt {attempt}/{len(_RETRY_DELAYS)}): {e}"
                    )
                    if attempt < len(_RETRY_DELAYS):
                        print(f"[LLM] Waiting {delay}s before retry...")
                        time.sleep(delay)
                    else:
                        print(f"[LLM] All retries exhausted for {model}, trying next model...")
                        break   # move to next model in chain
                else:
                    # Non-quota error — don't retry this model
                    print(f"[LLM] Gemini {model} error: {type(e).__name__}: {e}")
                    break

    print(
        "[LLM] All Gemini models exhausted.\n"
        "  → Your daily free-tier quota is used up.\n"
        "  → Options:\n"
        "      1. Set GROQ_API_KEY in .env (free, generous limits)\n"
        "      2. Wait until tomorrow for Gemini quota reset\n"
        "      3. Add billing to your Google AI project"
    )
    return ""


# ── streaming (real token-by-token output, for live UI display) ──────────────

def stream_llm_text(messages: list, temperature: float = 0.3, callbacks=None):
    """
    Generator that yields the LLM's response text as it arrives, chunk by
    chunk, using the model's native streaming interface (llm.stream()).

    `callbacks` is an optional list of LangChain BaseCallbackHandler
    instances. When provided, it's passed through to the underlying
    streaming call so each chunk also fires the handler's on_llm_new_token
    in real time.

    Reliability: if streaming raises for ANY reason (transient network
    error, etc.), this falls back to the original, battle-tested
    call_llm() — which has its own retry-with-backoff — and yields its
    result as a single chunk.
    """
    got_any = False
    try:
        llm = get_llm(temperature=temperature)
        stream_config = {"callbacks": callbacks} if callbacks else None
        for chunk in llm.stream(messages, config=stream_config):
            piece = getattr(chunk, "content", "") or ""
            if piece:
                got_any = True
                yield piece
    except Exception as e:
        if got_any:
            print(f"[LLM] Streaming interrupted mid-response: {type(e).__name__}: {e}")
            return
        print(f"[LLM] Streaming failed before any output ({type(e).__name__}: {e}) — falling back to call_llm().")
        text = call_llm(messages, temperature=temperature)
        if text:
            yield text
        return

    if not got_any:
        print("[LLM] Streaming produced no content — falling back to call_llm().")
        text = call_llm(messages, temperature=temperature)
        if text:
            yield text


# ── think-tag and noise stripping ────────────────────────────────────────────

def strip_think_tags(text: str) -> str:
    """Remove <think>...</think> blocks from reasoning models (Qwen3, DeepSeek, o1)."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def clean_llm_output(text: str) -> str:
    """Strip <think> blocks and markdown code fences."""
    text = strip_think_tags(text)
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```", "", text)
    return text.strip()


# ── JSON extraction ───────────────────────────────────────────────────────────

def extract_json_object(text: str) -> str:
    """
    Find the first complete JSON object or array in text.
    Handles models that add explanation text around JSON.
    """
    cleaned = clean_llm_output(text)

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        return match.group(0).strip()

    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if match:
        return match.group(0).strip()

    return cleaned


def parse_json_from_llm(raw: str, label: str = "LLM") -> dict | list | None:
    """Strip noise -> extract JSON -> parse with fallback repair. Logs previews for debugging."""
    preview = raw.strip()[:200].replace("\n", " ")
    print(f"[{label}] Raw (first 200): {preview!r}")

    json_str = extract_json_object(raw)
    print(f"[{label}] Extracted (first 200): {json_str[:200].replace(chr(10),' ')!r}")

    # Attempt 1: strict parse
    try:
        parsed = json.loads(json_str)
        print(f"[{label}] Parsed OK -- type={type(parsed).__name__}")
        return parsed
    except json.JSONDecodeError as e:
        print(f"[{label}] JSON parse failed: {e} -- attempting repair...")

    # Attempt 2: json_repair (handles trailing commas, unescaped chars, truncation, etc.)
    try:
        from json_repair import repair_json
        repaired = repair_json(json_str, return_objects=True)
        if repaired:
            print(f"[{label}] json_repair succeeded -- type={type(repaired).__name__}")
            return repaired
    except Exception as repair_err:
        print(f"[{label}] json_repair also failed: {repair_err}")

    print(f"[{label}] All parse attempts failed -- returning None")
    return None


def get_text_from_llm(raw: str) -> str:
    """For free-text responses: strip think tags and return clean text."""
    return strip_think_tags(raw).strip()