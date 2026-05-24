from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from llm.core.interface import AuthenticationError, ContextLengthError, RateLimitError
from llm.core.types import LLMInput, Message, ProviderType, Role
from llm.providers.openai import OpenAIProvider


class _FakeChatCompletions:
    def __init__(self, response: SimpleNamespace) -> None:
        self._response = response

    def create(self, **_params: object) -> SimpleNamespace:
        return self._response


class _FakeChat:
    def __init__(self, response: SimpleNamespace) -> None:
        self.completions = _FakeChatCompletions(response)


class _FakeClient:
    def __init__(self, response: SimpleNamespace) -> None:
        self.chat = _FakeChat(response)
        self.api_key = "test-key"


def _make_provider(response: SimpleNamespace) -> OpenAIProvider:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="test-key")
    provider.client = _FakeClient(response)
    return provider


def _make_response(
    content: str = "Hello",
    tool_calls=None,
    finish_reason: str = "stop",
    model: str = "gpt-4o-mini",
) -> SimpleNamespace:
    choice = SimpleNamespace(
        message=SimpleNamespace(content=content, tool_calls=tool_calls),
        finish_reason=finish_reason,
    )
    return SimpleNamespace(
        choices=[choice],
        model=model,
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5, total_tokens=15),
    )


@pytest.mark.unit
def test_generate_returns_content() -> None:
    provider = _make_provider(_make_response("Hello, world!"))
    output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="Hi")]))
    assert output.content == "Hello, world!"
    assert output.tool_calls is None
    assert output.model == "gpt-4o-mini"


@pytest.mark.unit
def test_generate_includes_usage() -> None:
    provider = _make_provider(_make_response("Response"))
    output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="Hi")]))
    assert output.usage["prompt_tokens"] == 10
    assert output.usage["completion_tokens"] == 5
    assert output.usage["total_tokens"] == 15


@pytest.mark.unit
def test_generate_includes_stop_reason() -> None:
    provider = _make_provider(_make_response("Done", finish_reason="stop"))
    output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="Hi")]))
    assert output.stop_reason == "stop"


@pytest.mark.unit
def test_generate_tool_calls_parsed() -> None:
    tool_call = SimpleNamespace(
        id="call_abc",
        function=SimpleNamespace(name="search", arguments='{"query": "test"}'),
    )
    provider = _make_provider(_make_response("", tool_calls=[tool_call], finish_reason="tool_calls"))
    output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="search")]))
    assert output.tool_calls is not None
    assert len(output.tool_calls) == 1
    assert output.tool_calls[0].id == "call_abc"
    assert output.tool_calls[0].name == "search"
    assert output.tool_calls[0].arguments == {"query": "test"}


@pytest.mark.unit
def test_generate_multiple_tool_calls() -> None:
    tool_calls = [
        SimpleNamespace(id="c1", function=SimpleNamespace(name="search", arguments='{"q":"a"}')),
        SimpleNamespace(id="c2", function=SimpleNamespace(name="read", arguments='{"path":"x"}')),
    ]
    provider = _make_provider(_make_response("", tool_calls=tool_calls))
    output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="use tools")]))
    assert len(output.tool_calls or []) == 2
    assert output.tool_calls[0].id == "c1"
    assert output.tool_calls[1].id == "c2"


@pytest.mark.unit
def test_generate_no_tool_calls_returns_none() -> None:
    provider = _make_provider(_make_response("text only", tool_calls=None))
    output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))
    assert output.tool_calls is None


@pytest.mark.unit
def test_generate_authentication_error() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="bad")

    class RaisingClient:
        api_key = "bad"

        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    raise Exception("401 authentication failed")

    provider.client = RaisingClient()
    with pytest.raises(AuthenticationError):
        provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))


@pytest.mark.unit
def test_generate_rate_limit_error() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="k")

    class RaisingClient:
        api_key = "k"

        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    raise Exception("429 rate_limit exceeded")

    provider.client = RaisingClient()
    with pytest.raises(RateLimitError):
        provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))


@pytest.mark.unit
def test_generate_context_length_error() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="k")

    class RaisingClient:
        api_key = "k"

        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    raise Exception("context length exceeded maximum")

    provider.client = RaisingClient()
    with pytest.raises(ContextLengthError):
        provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))


@pytest.mark.unit
def test_list_models_returns_four_models() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="k")
    models = provider.list_models()
    assert len(models) == 4
    names = {m.name for m in models}
    assert {"gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"} == names


@pytest.mark.unit
def test_list_models_returns_copy() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="k")
    models1 = provider.list_models()
    models1.clear()
    models2 = provider.list_models()
    assert len(models2) == 4


@pytest.mark.unit
def test_validate_config_true_with_api_key() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="k")
    provider.client = SimpleNamespace(api_key="real-key")
    assert provider.validate_config() is True


@pytest.mark.unit
def test_validate_config_false_without_api_key() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="k")
    provider.client = SimpleNamespace(api_key="")
    assert provider.validate_config() is False


@pytest.mark.unit
def test_get_default_model() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="k")
    assert provider.get_default_model() == "gpt-4o-mini"


@pytest.mark.unit
def test_provider_type_is_openai() -> None:
    with patch("llm.providers.openai.OpenAI"):
        provider = OpenAIProvider(api_key="k")
    assert provider.provider_type == ProviderType.OPENAI
