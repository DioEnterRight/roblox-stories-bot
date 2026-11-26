import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture
def cfg():
    from pipeline.common import load_config
    return load_config()


def fake_words(script, wps=2.6, gap=0.25):
    """words.json-like timings for a script (no audio needed)."""
    t, lines = 0.12, []
    for i, l in enumerate(script["lines"]):
        ws = []
        for w in l["caption"].split():
            ws.append({"w": w, "s": round(t, 3), "e": round(t + 1 / wps - 0.04, 3)})
            t += 1 / wps
        lines.append({"id": f"l{i + 1}", "speaker": "NARRATOR", "text": l["caption"], "start": ws[0]["s"], "end": ws[-1]["e"], "words": ws})
        t += gap
    return {"duration": round(t + 0.3, 3), "lines": lines, "words": [w for l in lines for w in l["words"]]}
