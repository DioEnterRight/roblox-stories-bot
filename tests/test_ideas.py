from pipeline import ideas


def test_reworded_idea_is_a_duplicate():
    a = "A CEO's calendar is full of meetings with himself that he cancels himself"
    b = "The founder cancels every meeting in his calendar because they are all with himself"
    assert ideas.similarity(a, b) >= 0.5


def test_different_jokes_are_not():
    a = "A CEO's calendar is full of meetings with himself that he cancels himself"
    b = "A founder's premium office is actually a cafe"
    assert ideas.similarity(a, b) < 0.5


def test_choose_ranks_and_rejects():
    cands = [{"canonical_en": "office is a cafe", "hook": "h", "twist": "t", "scores": {"funny": 9}},
             {"canonical_en": "office is a cafe again", "hook": "h", "twist": "t", "scores": {"funny": 5}},
             {"canonical_en": "incomplete"}]
    best, rejected = ideas.choose(cands, [], 0.5)
    assert best["scores"]["funny"] == 9
    assert len(rejected) == 2
