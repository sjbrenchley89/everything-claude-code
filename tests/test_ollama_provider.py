from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from llm.core.interface import AuthenticationError, ContextLengthError, RateLimitError
from llm.core.types import LLMInput, Message, ProviderType, Role
from llm.providers.ollama import OllamaProvider


def _fake_urlopen_ctx(response_data: dict):
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(response_data).encode("utf-8")
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_response)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    return mock_ctx


def _ollama_response(
    content: str = "Hello",
    done_reason: str = "stop",
    tool_calls=None,
) -> dict:
    msg: dict = {"content": content}
    if tool_calls is not None:
        msg["tool_calls"] = tool_calls
    return {"message": msg, "done_reason": done_reason}


@pytest.mark.unit
def test_generate_returns_content() -> None:
    provider = OllamaProvider()
    with patch("urllib.request.urlopen", return_value=_fake_urlopen_ctx(_ollama_response("Hello from Ollama"))):
        output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="Hi")]))
    assert output.content == "Hello from Ollama"
    assert output.tool_calls is None


@pytest.mark.unit
def test_generate_uses_default_model() -> None:
    provider = OllamaProvider(default_model="mistral")
    with patch("urllib.request.urlopen", return_value=_fake_urlopen_ctx(_ollama_response())) as mock_urlopen:
        provider.generate(LLMInput(messages=[Message(role=Role.USER, content="test")]))
    request_obj = mock_urlopen.call_args[0][0]
    data = json.loads(request_obj.data.decode("utf-8"))
    assert data["model"] == "mistral"


@pytest.mark.unit
def test_generate_uses_input_model_override() -> None:
    provider = OllamaProvider(default_model="llama3.2")
    with patch("urllib.request.urlopen", return_value=_fake_urlopen_ctx(_ollama_response())) as mock_urlopen:
        provider.generate(LLMInput(messages=[Message(role=Role.USER, content="test")], model="codellama"))
    request_obj = mock_urlopen.call_args[0][0]
    data = json.loads(request_obj.data.decode("utf-8"))
    assert data["model"] == "codellama"


@pytest.mark.unit
def test_generate_sends_stream_false() -> None:
    provider = OllamaProvider()
    with patch("urllib.request.urlopen", return_value=_fake_urlopen_ctx(_ollama_response())) as mock_urlopen:
        provider.generate(LLMInput(messages=[Message(role=Role.USER, content="test")]))
    request_obj = mock_urlopen.call_args[0][0]
    data = json.loads(request_obj.data.decode("utf-8"))
    assert data["stream"] is False


@pytest.mark.unit
def test_generate_tool_calls_parsed() -> None:
    tool_calls_data = [
        {"id": "tc1", "function": {"name": "search", "arguments": {"query": "test"}}}
    ]
    provider = OllamaProvider()
    with patch(
        "urllib.request.urlopen",
        return_value=_fake_urlopen_ctx(_ollama_response("Using tools", tool_calls=tool_calls_data)),
    ):
        output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="search")]))
    assert output.tool_calls is not None
    assert len(output.tool_calls) == 1
    assert output.tool_calls[0].id == "tc1"
    assert output.tool_calls[0].name == "search"
    assert output.tool_calls[0].arguments == {"query": "test"}


@pytest.mark.unit
def test_generate_no_tool_calls_returns_none() -> None:
    provider = OllamaProvider()
    with patch("urllib.request.urlopen", return_value=_fake_urlopen_ctx(_ollama_response("text only"))):
        output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))
    assert output.tool_calls is None


@pytest.mark.unit
def test_generate_connection_error_raises_authentication_error() -> None:
    provider = OllamaProvider()
    with patch("urllib.request.urlopen", side_effect=Exception("connection refused")):
        with pytest.raises(AuthenticationError):
            provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))


@pytest.mark.unit
def test_generate_401_raises_authentication_error() -> None:
    provider = OllamaProvider()
    with patch("urllib.request.urlopen", side_effect=Exception("HTTP Error 401: Unauthorized")):
        with pytest.raises(AuthenticationError):
            provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))


@pytest.mark.unit
def test_generate_rate_limit_error() -> None:
    provider = OllamaProvider()
    with patch("urllib.request.urlopen", side_effect=Exception("429 rate_limit exceeded")):
        with pytest.raises(RateLimitError):
            provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))


@pytest.mark.unit
def test_generate_context_length_error() -> None:
    provider = OllamaProvider()
    with patch("urllib.request.urlopen", side_effect=Exception("context length exceeded")):
        with pytest.raises(ContextLengthError):
            provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))


@pytest.mark.unit
def test_list_models_returns_three_models() -> None:
    provider = OllamaProvider()
    models = provider.list_models()
    assert len(models) == 3
    names = {m.name for m in models}
    assert "llama3.2" in names
    assert "mistral" in names
    assert "codellama" in names


@pytest.mark.unit
def test_list_models_returns_copy() -> None:
    provider = OllamaProvider()
    models1 = provider.list_models()
    models1.clear()
    models2 = provider.list_models()
    assert len(models2) == 3


@pytest.mark.unit
def test_validate_config_true_when_url_set() -> None:
    provider = OllamaProvider(base_url="http://localhost:11434")
    assert provider.validate_config() is True


@pytest.mark.unit
def test_validate_config_false_when_url_empty() -> None:
    provider = OllamaProvider()
    provider.base_url = ""
    assert provider.validate_config() is False


@pytest.mark.unit
def test_get_default_model_returns_configured() -> None:
    provider = OllamaProvider(default_model="codellama")
    assert provider.get_default_model() == "codellama"


@pytest.mark.unit
def test_provider_type_is_ollama() -> None:
    provider = OllamaProvider()
    assert provider.provider_type == ProviderType.OLLAMA


@pytest.mark.unit
def test_generate_sets_model_on_output() -> None:
    provider = OllamaProvider(default_model="llama3.2")
    with patch("urllib.request.urlopen", return_value=_fake_urlopen_ctx(_ollama_response())):
        output = provider.generate(LLMInput(messages=[Message(role=Role.USER, content="hi")]))
    assert output.model == "llama3.2"
