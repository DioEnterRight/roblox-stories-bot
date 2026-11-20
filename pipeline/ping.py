"""Tiny connection test for the FreeLLMAPI tunnel: one real request, nothing else."""
from . import llm
from .common import log


def main():
    llm.check()
    reply = llm.chat("Reply with exactly this JSON and nothing else: {\"ok\": true}", "ping", max_tokens=50)
    log(f"FreeLLMAPI answered: {reply.strip()[:200]}")


if __name__ == "__main__":
    main()
