from backend.council import (
    calculate_aggregate_rankings,
    format_history,
    parse_ranking_from_text,
    response_label,
    with_history,
)


def test_response_label_goes_past_z():
    assert [response_label(i) for i in (0, 1, 25, 26, 27, 51, 52)] == [
        "Response A", "Response B", "Response Z", "Response AA", "Response AB", "Response AZ", "Response BA",
    ]


def test_parse_numbered_ranking():
    text = "Response A is fine. Response B is great.\n\nFINAL RANKING:\n1. Response B\n2. Response A\n3. Response C"
    assert parse_ranking_from_text(text) == ["Response B", "Response A", "Response C"]


def test_parse_ranking_with_bold_and_double_letters():
    text = "FINAL RANKING:\n1. **Response AA**\n2. **Response B**\n3. Response A"
    assert parse_ranking_from_text(text) == ["Response AA", "Response B", "Response A"]


def test_parse_uses_last_final_ranking_header():
    text = 'I will end with "FINAL RANKING:" as asked.\nResponse C is weak.\n\nFINAL RANKING:\n1. Response A\n2. Response C'
    assert parse_ranking_from_text(text) == ["Response A", "Response C"]


def test_parse_fallback_without_header_keeps_first_mentions():
    text = "Response B is best, Response A next. Response B again."
    assert parse_ranking_from_text(text) == ["Response B", "Response A"]


def test_parse_unnumbered_section():
    assert parse_ranking_from_text("FINAL RANKING:\nResponse C, Response A") == ["Response C", "Response A"]


def test_aggregate_rankings_average_and_order():
    label_to_model = {"Response A": "alpha", "Response B": "beta"}
    stage2 = [
        {"ranking": "FINAL RANKING:\n1. Response A\n2. Response B"},
        {"ranking": "FINAL RANKING:\n1. Response B\n2. Response A"},
        {"ranking": "FINAL RANKING:\n1. Response A\n2. Response B"},
    ]
    result = calculate_aggregate_rankings(stage2, label_to_model)
    assert [r["model"] for r in result] == ["alpha", "beta"]
    assert result[0] == {"model": "alpha", "average_rank": 1.33, "rankings_count": 3}


def test_aggregate_ignores_unknown_labels():
    result = calculate_aggregate_rankings(
        [{"ranking": "FINAL RANKING:\n1. Response Z\n2. Response A"}], {"Response A": "alpha"}
    )
    assert result == [{"model": "alpha", "average_rank": 2.0, "rankings_count": 1}]


def test_history_keeps_last_turns_and_skips_errors():
    messages = []
    for i in range(5):
        messages.append({"role": "user", "content": f"q{i}"})
        messages.append({"role": "assistant", "stage3": {"response": f"a{i}"}})
    messages.append({"role": "user", "content": "failed q"})
    messages.append({"role": "assistant", "stage3": {"response": "Error: nenhum membro respondeu"}})
    history = format_history(messages)
    assert "q1" not in history and "q2" in history and "a4" in history
    assert "failed q" not in history


def test_history_truncates_long_answers():
    history = format_history([
        {"role": "user", "content": "q"},
        {"role": "assistant", "stage3": {"response": "x" * 10000}},
    ])
    assert len(history) < 3200 and history.endswith("[…]")


def test_with_history():
    assert with_history("q", "") == "q"
    combined = with_history("now?", "User: before")
    assert combined.index("User: before") < combined.index("now?")
