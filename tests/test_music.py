import hashlib

from pipeline import music


def test_bed_is_deterministic(tmp_path):
    a, b = tmp_path / "a.wav", tmp_path / "b.wav"
    music.bed("corporate", 3.0, 104, 2, 5, a)
    music.bed("corporate", 3.0, 104, 2, 5, b)
    assert hashlib.sha256(a.read_bytes()).hexdigest() == hashlib.sha256(b.read_bytes()).hexdigest()


def test_sfx_exist():
    d = music.ensure_sfx()
    for n in ("pop", "thud", "ding", "whoosh", "scratch"):
        assert (d / f"{n}.wav").stat().st_size > 1000
