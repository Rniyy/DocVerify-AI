import json
import re

from app.ai.client import MODEL, get_client

# Keep in sync with backend/src/types/fields.ts (ExtractedFields).
DOCUMENT_FIELDS = {
    "invoiceNumber": "string",
    "poNumber": "string",
    "supplier": "string",
    "customer": "string",
    "date": "string",
    "currency": "string",
    "subtotal": "number",
    "tax": "number",
    "totalAmount": "number",
    "grossWeight": "number",
    "netWeight": "number",
    "containerNumber": "string",
    "shippingTerms": "string",
}
LINE_ITEM_FIELDS = {
    "description": "string",
    "quantity": "number",
    "unit": "string",
    "unitPrice": "number",
    "totalAmount": "number",
    "hsCode": "string",
}

# Long enough for a multi-page invoice, short enough to keep calls cheap.
MAX_SOURCE_CHARS = 15000

SYSTEM_PROMPT = (
    "You read the raw text of a logistics/trade document (invoice, packing "
    "list, delivery note, purchase order, bill of lading) and copy its key "
    "fields into JSON. The text comes from a PDF, so reading order may be "
    "scrambled: a label can appear lines away from its value, and the "
    "document may mix English with Khmer or other scripts. Rules:\n"
    "1. Copy values EXACTLY as printed in the text. Never calculate, "
    "convert, reformat dates, translate, or infer a value that isn't there.\n"
    "2. If a field isn't clearly present, omit it. An omitted field is "
    "always better than a guess.\n"
    "3. Numbers are plain JSON numbers (no currency symbols or thousands "
    "separators). currency is the 3-letter code if one is printed.\n"
    "4. List every product row in lineItems, in the order printed.\n"
    "Respond with ONLY a JSON object, no other text: "
    f'{{"documentFields": {{{", ".join(DOCUMENT_FIELDS)}}}, '
    f'"lineItems": [{{{", ".join(LINE_ITEM_FIELDS)}}}]}} '
    "using only the keys listed."
)


def parse_model_json(raw: str) -> dict:
    """Parses the model's reply into {documentFields, lineItems}.

    Tolerates markdown fences and leading/trailing chatter. Returns an empty
    result (never raises) if nothing usable is found — the caller treats
    that as "AI found nothing".
    """
    empty: dict = {"documentFields": {}, "lineItems": []}

    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return empty

    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return empty
    if not isinstance(parsed, dict):
        return empty

    doc_fields = parsed.get("documentFields")
    line_items = parsed.get("lineItems")
    return {
        "documentFields": doc_fields if isinstance(doc_fields, dict) else {},
        "lineItems": [item for item in line_items if isinstance(item, dict)]
        if isinstance(line_items, list)
        else [],
    }


def extract_fields(text: str) -> dict:
    """Asks the model to read structured fields out of raw document text.

    The result is only a *candidate*: the Node backend verifies every value
    against the source text before using it, and rule-based extraction always
    takes precedence over anything returned here.
    """
    client = get_client()

    response = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Document text:\n\n{text[:MAX_SOURCE_CHARS]}"}],
    )

    raw = "".join(block.text for block in response.content if block.type == "text")
    return parse_model_json(raw)
