"""Download the free Kokoro backup voice once (cached by GitHub Actions). A failed download only warns: the main voice
(edge-tts) does not need it, and a run where both fail stops with a clear message in voice.py."""
import urllib.request

from .common import MODELS, log

BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = {"kokoro.onnx": "kokoro-v1.0.int8.onnx", "voices.bin": "voices-v1.0.bin"}


def main():
    MODELS.mkdir(exist_ok=True)
    for local, remote in FILES.items():
        dest = MODELS / local
        if dest.exists() and dest.stat().st_size > 1_000_000:
            log(f"{local} already here")
            continue
        tmp = dest.with_suffix(".part")
        try:
            log(f"Downloading {remote}")
            urllib.request.urlretrieve(BASE + remote, tmp)
            tmp.replace(dest)
        except OSError as e:
            tmp.unlink(missing_ok=True)
            log(f"Kokoro download failed ({e}); the backup voice is unavailable this run", "WARN")


if __name__ == "__main__":
    main()
