"""Configuration for the LLM Council."""

import os
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Council members - list of OpenRouter model identifiers
COUNCIL_MODELS = [
    "openai/gpt-5.1",
    "google/gemini-3-pro-preview",
    "anthropic/claude-sonnet-4.5",
    "x-ai/grok-4",
]

# Chairman model - synthesizes final response
CHAIRMAN_MODEL = "google/gemini-3-pro-preview"

# Model used for short helper tasks (e.g. conversation titles)
TITLE_MODEL = "google/gemini-2.5-flash"

# Provider: "codex" uses the locally installed Codex CLI (your ChatGPT login, no API key);
# "openrouter" uses OPENROUTER_API_KEY.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "codex")
CODEX_BIN = os.getenv("CODEX_BIN", "codex")

# These lists only seed the very first council, before data/councils.json exists.
# The real seats come from the UI (or the auto-configuration, which lists the models each
# CLI reports), so stale names here do not break a configured install.
if LLM_PROVIDER == "codex":
    # Codex only serves OpenAI models available to your ChatGPT plan
    COUNCIL_MODELS = [
        "gpt-6.1-sol",
        "gpt-6-astra",
        "gpt-5.6-terra",
        "gpt-5.5",
    ]
    CHAIRMAN_MODEL = "gpt-6.1-sol"
    TITLE_MODEL = "gpt-6-luna"

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"
