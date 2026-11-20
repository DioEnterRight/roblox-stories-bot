"""Re-queue videos that exist as GitHub Releases but are missing from data/history.json.

Needed when a run made a video but failed to save its state (the poster only looks at history.json).
Run it from Actions > "Recover queue".
"""
import json
import tempfile
from pathlib import Path

from .common import IST, load_history, log, parse_time, run, save_history


def missing_tags(release_tags, history):
    known = {v.get("tag") for v in history["videos"]}
    return sorted(t for t in release_tags if t.startswith("vid-") and t not in known)


def main():
    res = run(["gh", "release", "list", "--limit", "100", "--json", "tagName,createdAt"], capture=True)
    releases = {r["tagName"]: r["createdAt"] for r in json.loads(res.stdout)}
    history = load_history()
    todo = missing_tags(releases, history)
    if not todo:
        log("Nothing to recover: every video release is already in history.")
        return
    for tag in todo:
        with tempfile.TemporaryDirectory() as tmp:
            run(["gh", "release", "download", tag, "-p", "meta.json", "-D", tmp])
            meta = json.loads((Path(tmp) / "meta.json").read_text(encoding="utf-8"))
        created = parse_time(releases[tag].replace("Z", "+00:00")).astimezone(IST)
        history["videos"].append({"id": meta["id"], "title": meta["title"], "rule": meta["rule"], "tag": tag,
                                  "duration": meta["duration"], "status": "queued",
                                  "created": created.isoformat(timespec="minutes")})
        log(f"Re-queued {tag}: {meta['title']}")
    save_history(history)


if __name__ == "__main__":
    main()
