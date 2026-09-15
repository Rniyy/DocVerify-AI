import json

from app.ai.client import MODEL, get_client

SYSTEM_PROMPT = (
    "You compare short product/business descriptions from trade documents "
    "(invoices, packing lists, purchase orders) to judge whether they refer "
    "to the same real-world item, even if worded differently (word order, "
    "abbreviations, singular vs plural, etc). Respond with ONLY a JSON "
    'object, no other text: {"match": true or false, "explanation": '
    '"one short sentence"}'
)


def compare_descriptions_semantically(values: list[str]) -> dict:
    """Asks the model whether a set of text values describe the same thing.

    Never called for numeric fields, and its result is only ever used to
    *upgrade* an exact-match "mismatch" to a semantic match — it can't
    override a genuine numeric discrepancy, per the architecture rule.
    """
    client = get_client()
    user_content = "Do these descriptions refer to the same item?\n" + "\n".join(
        f'{i + 1}. "{value}"' for i, value in enumerate(values)
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=200,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    raw_text = "".join(block.text for block in response.content if block.type == "text").strip()

    try:
        parsed = json.loads(raw_text)
        return {
            "match": bool(parsed.get("match")),
            "explanation": str(parsed.get("explanation", "")),
        }
    except (json.JSONDecodeError, AttributeError):
        return {
            "match": False,
            "explanation": "Could not interpret the AI's response; treating as no semantic match.",
        }
