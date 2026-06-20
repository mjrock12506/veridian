"""Tests for the Phase 5 AI copilot.

The LLM itself is mocked so these run deterministically and offline: the real
value under test is the orchestration (tool dispatch, message threading,
grounding, guardrails), not the provider. Tool and retrieval layers are
exercised against the real models and the committed knowledge corpus (no vector
DB or embedding model — see :mod:`ai.rag`).
"""

from __future__ import annotations

import json
from types import SimpleNamespace as NS

import pytest

from ai import copilot, llm, rag, tools


# --------------------------------------------------------------------------- #
# Helpers: build LiteLLM-shaped fake responses
# --------------------------------------------------------------------------- #
def _tool_call(name: str, arguments: dict):
    return NS(id="call_1", function=NS(name=name, arguments=json.dumps(arguments)))


def _response(content=None, tool_calls=None, tokens=11):
    return NS(choices=[NS(message=NS(content=content, tool_calls=tool_calls))],
              usage=NS(total_tokens=tokens))


def _scripted_chat(responses):
    """Return a chat() stand-in that yields the given responses in order."""
    seq = list(responses)

    def _chat(messages, tools=None, **kwargs):
        return seq.pop(0)

    return _chat


# --------------------------------------------------------------------------- #
# Tools — real models, no LLM
# --------------------------------------------------------------------------- #
def test_tool_returns_calibrated_probability():
    out = tools.call_tool("predict_delay", {
        "estimated_delivery_days": 8, "customer_seller_distance_km": 2000,
        "customer_state": "AM", "main_seller_state": "SP",
    })
    assert 0.0 <= out["probability"] <= 1.0
    assert out["model"] == "delay"
    assert set(out) >= {"probability", "decision_threshold", "flag", "risk_level"}
    assert isinstance(out["flag"], bool)


def test_unknown_tool_returns_error_not_raises():
    out = tools.call_tool("predict_unicorns", {})
    assert "error" in out


def test_available_tools_lists_loaded_models():
    assert "predict_delay" in tools.available_tools()
    assert "predict_low_review" in tools.available_tools()


# --------------------------------------------------------------------------- #
# RAG — committed corpus, no vector DB / embedding model
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def indexed():
    try:
        rag.build_index()
    except Exception as exc:  # pragma: no cover - source docs unavailable
        pytest.skip(f"corpus unavailable: {exc}")
    return True


def test_retrieval_is_grounded(indexed):
    """The default ('direct') backend grounds the prompt in the whole corpus."""
    passages = rag.retrieve("What ROC-AUC does the delay model achieve?")
    assert passages, "expected at least one grounded passage"
    sources = {p.source for p in passages}
    assert any("metrics_delay" in s or "MODEL_CARD" in s for s in sources)


def test_direct_backend_returns_whole_corpus(indexed, monkeypatch):
    monkeypatch.setattr(rag.config, "RAG_BACKEND", "direct")
    passages = rag.retrieve("anything")
    # 'direct' ignores k and returns the entire (small) corpus for in-prompt use.
    assert len(passages) == len(rag._load_corpus())


def test_tfidf_backend_ranks_relevant_passage_first(indexed, monkeypatch):
    monkeypatch.setattr(rag.config, "RAG_BACKEND", "tfidf")
    passages = rag.retrieve("delay model ROC-AUC and PR-AUC", k=3)
    assert passages, "expected ranked passages"
    assert len(passages) <= 3
    assert any("metrics_delay" in p.source for p in passages)


# --------------------------------------------------------------------------- #
# Copilot orchestration — mocked LLM
# --------------------------------------------------------------------------- #
def test_copilot_calls_real_model_for_prediction(monkeypatch):
    """A risk question must trigger a tool call whose number is the real model's."""
    real = tools.call_tool("predict_delay", {"estimated_delivery_days": 8,
                                              "customer_seller_distance_km": 2000})
    scripted = _scripted_chat([
        _response(tool_calls=[_tool_call("predict_delay", {
            "estimated_delivery_days": 8, "customer_seller_distance_km": 2000})]),
        _response(content="The delay risk is moderate based on the model."),
    ])
    monkeypatch.setattr(copilot.llm, "chat", scripted)

    res = copilot.answer("What's the delay risk?")
    assert res.model_results, "copilot should have called a prediction tool"
    assert res.model_results[0]["model"] == "delay"
    # The number reported is the real model's, not invented.
    assert res.model_results[0]["probability"] == real["probability"]
    assert res.error is None


def test_copilot_returns_plain_answer_without_tool(monkeypatch):
    monkeypatch.setattr(copilot.llm, "chat",
                        _scripted_chat([_response(content="The dataset is Olist.")]))
    res = copilot.answer("What dataset is used?")
    assert res.answer == "The dataset is Olist."
    assert res.model_results == []


def test_copilot_empty_question_short_circuits(monkeypatch):
    # Should never reach the LLM for an empty question.
    def _boom(*a, **k):
        raise AssertionError("LLM should not be called")

    monkeypatch.setattr(copilot.llm, "chat", _boom)
    res = copilot.answer("   ")
    assert "ask a question" in res.answer.lower()


def test_copilot_handles_llm_unavailable_gracefully(monkeypatch):
    def _unavailable(*a, **k):
        raise llm.LLMUnavailable("no credits")

    monkeypatch.setattr(copilot.llm, "chat", _unavailable)
    res = copilot.answer("What's the delay risk?")
    assert res.error is not None
    assert "unavailable" in res.answer.lower()
    # Never fabricates a model result when the LLM is down.
    assert res.model_results == []


# --------------------------------------------------------------------------- #
# /ask endpoint
# --------------------------------------------------------------------------- #
def test_ask_endpoint_returns_grounded_answer(monkeypatch):
    from api.main import app
    from fastapi.testclient import TestClient

    def fake_answer(question, order=None):
        return copilot.CopilotResult(
            answer="ROC-AUC is 0.785.",
            model_results=[{"model": "delay", "probability": 0.29}],
            sources=["reports/metrics_delay.json"],
            tokens=20,
        )

    monkeypatch.setattr("ai.copilot.answer", fake_answer)
    with TestClient(app) as client:
        r = client.post("/ask", json={"question": "delay ROC-AUC?"})
        assert r.status_code == 200
        body = r.json()
        assert body["answer"] == "ROC-AUC is 0.785."
        assert body["sources"] == ["reports/metrics_delay.json"]
        assert body["model_results"][0]["model"] == "delay"


def test_ask_endpoint_rejects_unknown_fields():
    from api.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        r = client.post("/ask", json={"question": "hi", "unexpected": 1})
        assert r.status_code == 422
