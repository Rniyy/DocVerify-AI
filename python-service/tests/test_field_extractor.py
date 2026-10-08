from app.ai.field_extractor import SYSTEM_PROMPT, parse_model_json


def test_parses_plain_json():
    raw = '{"documentFields": {"invoiceNumber": "0310", "totalAmount": 55}, "lineItems": [{"description": "Customs clearance", "quantity": 1}]}'
    result = parse_model_json(raw)
    assert result["documentFields"] == {"invoiceNumber": "0310", "totalAmount": 55}
    assert result["lineItems"] == [{"description": "Customs clearance", "quantity": 1}]


def test_tolerates_markdown_fences_and_chatter():
    raw = 'Here you go:\n```json\n{"documentFields": {"currency": "USD"}, "lineItems": []}\n```\nHope that helps!'
    assert parse_model_json(raw)["documentFields"] == {"currency": "USD"}


def test_garbage_yields_empty_result_instead_of_raising():
    for raw in ["", "I could not read this document.", "{not json}", "[1, 2, 3]"]:
        assert parse_model_json(raw) == {"documentFields": {}, "lineItems": []}


def test_wrong_shapes_are_discarded():
    raw = '{"documentFields": ["oops"], "lineItems": [{"description": "ok"}, "stray string", 7]}'
    result = parse_model_json(raw)
    assert result["documentFields"] == {}
    assert result["lineItems"] == [{"description": "ok"}]


def test_prompt_contains_real_newlines_and_every_field():
    assert "\\n" not in SYSTEM_PROMPT  # no literal backslash-n sequences
    for key in ("invoiceNumber", "totalAmount", "lineItems", "hsCode"):
        assert key in SYSTEM_PROMPT
