import yaml

from pipeline.common import ROOT

WF = ROOT / ".github" / "workflows"


def _load(name):
    return yaml.safe_load((WF / name).read_text())


def test_every_job_has_a_timeout_and_least_privilege():
    for f in WF.glob("*.yml"):
        wf = yaml.safe_load(f.read_text())
        assert "permissions" in wf, f.name
        for name, job in wf["jobs"].items():
            assert "timeout-minutes" in job, (f.name, name)


def test_secrets_only_reach_the_steps_that_need_them():
    for f in WF.glob("*.yml"):
        wf = yaml.safe_load(f.read_text())
        for job in wf["jobs"].values():
            assert "secrets." not in yaml.safe_dump(job.get("env", {})), f"{f.name}: secrets in job-level env"
            for step in job.get("steps", []):
                env = yaml.safe_dump(step.get("env", {}))
                if "FREELLMAPI_KEYS" in env:
                    assert "start_freellmapi" in step.get("run", ""), f.name


def test_make_and_post_have_separate_queues():
    assert _load("make-video.yml")["concurrency"]["group"] != _load("post-video.yml")["concurrency"]["group"]
