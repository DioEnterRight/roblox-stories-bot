from pipeline import voice


def test_align_words_spreads_unmatched_numbers():
    words = ["I", "woke", "at", "5:00", "today."]
    marks = [(0.0, 0.1, "I"), (0.12, 0.4, "woke"), (0.42, 0.5, "at"), (0.52, 0.7, "five"), (0.72, 0.9, "o'clock"), (0.95, 1.3, "today")]
    spans = voice.align_words(words, marks, 1.4)
    assert len(spans) == 5
    assert all(a <= b for a, b in spans)
    assert all(spans[i][0] <= spans[i + 1][0] for i in range(4))


def test_caption_words_one_to_one_and_spread():
    spoken = [("मैं", 0.0, 0.2), ("CEO", 0.2, 0.5), ("हूँ", 0.5, 0.7)]
    assert [w for w, _, _ in voice.caption_words("main CEO hoon", spoken)] == ["main", "CEO", "hoon"]
    spread = voice.caption_words("main to CEO hoon", spoken)
    assert len(spread) == 4 and spread[0][1] == 0.0 and spread[-1][2] <= 0.7
