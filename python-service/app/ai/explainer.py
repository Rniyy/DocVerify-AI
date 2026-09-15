import json

from app.ai.client import MODEL, get_client

SYSTEM_PROMPT = (
    "You write one short, plain-language sentence explaining a discrepancy "
    "found between business documents (invoices, packing lists, purchase "
    "orders, bills of lading) for a logistics/finance reviewer. Use ONLY "
    "the facts given to you in the JSON — never invent document names, "
    "values, or reasons the discrepancy might exist. End by suggesting the "
    "reviewer verify the correct value. Respond with ONLY the sentence — "
    "no preamble, no quotes, no markdown."
)


def explain_discrepancy(context: dict) -> str:
    """Turns a structured discrepancy record into one grounded sentence.

    The model is only ever shown facts already computed by Stage 7/8's
    plain TypeScript logic (field name, values, expected vs actual, etc.)
    — it explains, it doesn't decide what the discrepancy is.
    """
    client = get_client()

    response = client.messages.create(
        model=MODEL,
        max_tokens=150,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Facts: {json.dumps(context)}"}],
    )

    return "".join(block.text for block in response.content if block.type == "text").strip()
