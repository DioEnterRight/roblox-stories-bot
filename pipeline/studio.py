"""STUDIO: voice-over -> shot list -> checks -> stills -> judge -> (revise) -> final render.

  v1   the director's shot list (or the auto director when no model answers), repaired by the compiler
  look stills from the middle of every shot (half size) -> engine guards + contact sheet
  judge a vision model scores the sheet; under `studio.good_enough` the director gets the judge's fixes, the compiler
       repairs and the guards, and makes v2 (up to `studio.revise_rounds` times)
  keep the version with the best score (guards cost points), render it full size, QA, done.

Every version is kept in out/<video>/versions/vN/ (shots.json, plan.json, sheet.jpg, judge.json) — the run uploads them.
"""
import json
import shutil

from . import branding, compiler, director, engine, judge, music
from .common import log, write_json


def _mid_times(shots, words, max_n):
    end = compiler.reel_end(words) + 0.35
    mids = []
    for i, s in enumerate(shots):
        t1 = shots[i + 1]["_t"] if i + 1 < len(shots) else end
        mids.append((i, round(s["_t"] + (t1 - s["_t"]) * 0.55, 2)))
    if len(mids) > max_n:   # keep the first, the last and an even spread
        step = (len(mids) - 1) / (max_n - 1)
        mids = [mids[round(k * step)] for k in range(max_n)]
    return mids


def _version(cfg, n, shots_raw, script, words, look, punch, slug, vdir, session):
    """Check + compile + stills + judge one shot list. -> dict(score, shots, plan, guards, repairs, judge)."""
    shots, repairs = compiler.check_shots(branding.force_outro_shot(shots_raw, script), words, look)
    plan = compiler.compile_plan(shots, words, script, look, punch, cfg)
    engine.write_plan(slug, plan)
    ok, problems = engine.check_plan(slug)
    if not ok:
        raise RuntimeError(f"engine refused v{n}: {problems[:4]}")
    d = vdir / f"v{n}"
    d.mkdir(parents=True, exist_ok=True)
    write_json(d / "shots.json", [{k: v for k, v in s.items()} for s in shots])
    write_json(d / "plan.json", plan)
    mids = _mid_times(shots, words, int(cfg["studio"].get("max_stills", 12)))
    paths, guards = engine.stills(slug, [t for _, t in mids], scale=0.5)
    labels = [f"{i + 1} {t:.1f}s {shots[i]['location']}/{shots[i]['spot']} {shots[i]['framing']}" for i, t in mids]
    sheet = engine.contact_sheet(paths, labels, d / "sheet.jpg")
    verdict = judge.score(session, script, compiler.summary(shots), sheet, guards)
    if verdict:
        write_json(d / "judge.json", verdict)
        score = float(verdict["scores"]["overall"])
    else:   # no judge: guards and repairs are the only signal
        score = 6.0 - 0.5 * len(guards) - 0.1 * len(repairs)
    (d / "notes.txt").write_text("repairs:\n" + "\n".join(repairs) + "\n\nguards:\n" + "\n".join(guards), encoding="utf-8")
    log(f"v{n}: {len(shots)} shots, score {score:.1f}, {len(guards)} guard(s), {len(repairs)} repair(s)")
    return {"n": n, "score": score, "shots": shots, "plan": plan, "guards": guards, "repairs": repairs, "judge": verdict}


def make(cfg, script, words, look, slug, work, session, preview=False):
    """-> (master mp4 path, report dict). session None = no model (test mode / outage): the auto director decides.
    preview: stop before the slow final render (the contact sheets in work/versions show the shots)."""
    st = cfg["studio"]
    music.ensure_sfx()
    pdir = engine.project_dir(slug)
    m = look["music"]
    music.bed(m["style"], words["duration"] + 1.0, m["bpm"], m["key"], m["seed"], pdir / "music.wav")
    punch = compiler.punchline_ref(script, words)
    vdir = work / "versions"
    vdir.mkdir(parents=True, exist_ok=True)
    auto = compiler.auto_director(script, words, look)
    first, who = auto, "auto"
    if session is not None:
        try:
            first, who = director.direct(session, script, words, look), "model"
        except Exception as e:  # noqa: BLE001 - the auto director always works
            log(f"director failed ({str(e)[:200]}); the auto director takes over", "WARN")
    try:
        best = _version(cfg, 1, first, script, words, look, punch, slug, vdir, session)
    except (ValueError, RuntimeError) as e:
        if who == "auto":
            raise
        log(f"v1 from the model could not be used ({str(e)[:200]}); auto director", "WARN")
        best, who = _version(cfg, 1, auto, script, words, look, punch, slug, vdir, session), "auto"
    best["director"] = who
    versions = [best]
    good = float(st.get("good_enough", 7.5))
    for rnd in range(int(st.get("revise_rounds", 1))):
        if session is None or (best["score"] >= good and not best["guards"]):
            break
        notes = list(best["guards"]) + list(best["repairs"])[:6] + ((best["judge"] or {}).get("fixes") or [])
        if not notes:
            break
        try:
            raw = director.revise(session, script, words, look, best["shots"], notes)
            cand = _version(cfg, len(versions) + 1, raw, script, words, look, punch, slug, vdir, session)
            cand["director"] = "model"
        except Exception as e:  # noqa: BLE001 - keep what we have
            log(f"revision {rnd + 1} failed ({str(e)[:200]}); keeping v{best['n']}", "WARN")
            break
        versions.append(cand)
        if cand["score"] > best["score"]:
            best = cand
    log(f"chosen: v{best['n']} (score {best['score']:.1f}, director {best['director']}) of {len(versions)} version(s)")
    engine.write_plan(slug, best["plan"])
    ok, problems = engine.check_plan(slug)
    if not ok:
        raise RuntimeError(f"engine refused the chosen plan: {problems[:4]}")
    if preview:
        return None, {"version": best["n"], "score": best["score"], "director": best["director"]}
    master, guards = engine.render_final(slug, int(st.get("render_timeout_minutes", 150)))
    qa = engine.qa(slug)
    final = work / "final.mp4"
    shutil.copy(master, final)
    report = {"version": best["n"], "score": best["score"], "director": best["director"], "shots": len(best["shots"]),
              "judge": best["judge"], "guards": guards, "repairs": best["repairs"], "qa_issues": qa.get("issues", []),
              "versions": [{"n": v["n"], "score": v["score"], "guards": len(v["guards"])} for v in versions]}
    (work / "studio.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return final, report
