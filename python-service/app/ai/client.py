import os

from anthropic import Anthropic

_client: Anthropic | None = None

# Good balance of judgment quality and cost for short classification /
# extraction calls like these. Override with ANTHROPIC_MODEL (e.g. to move to
# a newer model) without touching code.
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")


def get_client() -> Anthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Add it to python-service/.env "
                "to enable AI semantic comparison and explanations."
            )
        _client = Anthropic(api_key=api_key)
    return _client
