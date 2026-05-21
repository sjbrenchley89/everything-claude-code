from __future__ import annotations

import pytest

from llm.core.interface import (
    AuthenticationError,
    ContextLengthError,
    LLMError,
    LLMProvider,
    ModelNotFoundError,
    RateLimitError,
    ToolExecutionError,
)
from llm.core.types import LLMInput, LLMOutput, ModelInfo, ProviderType


@pytest.mark.unit
def test_llm_error_is_exception() -> None:
    err = LLMError("something failed")
    assert isinstance(err, Exception)
    assert err.message == "something failed"
    assert str(err) == "something failed"


@pytest.mark.unit
def test_llm_error_attributes() -> None:
    err = LLMError(
        "bad token",
        provider=ProviderType.CLAUDE,
        code="auth_failure",
        details={"retry": False},
    )
    assert err.provider == ProviderType.CLAUDE
    assert err.code == "auth_failure"
    assert err.details == {"retry": False}


@pytest.mark.unit
def test_llm_error_defaults() -> None:
    err = LLMError("minimal")
    assert err.provider is None
    assert err.code is None
    assert err.details == {}


@pytest.mark.unit
def test_authentication_error_is_llm_error() -> None:
    err = AuthenticationError("bad key")
    assert isinstance(err, LLMError)
    assert isinstance(err, Exception)


@pytest.mark.unit
def test_rate_limit_error_is_llm_error() -> None:
    err = RateLimitError("too many requests")
    assert isinstance(err, LLMError)


@pytest.mark.unit
def test_context_length_error_is_llm_error() -> None:
    err = ContextLengthError("context too long")
    assert isinstance(err, LLMError)


@pytest.mark.unit
def test_model_not_found_error_is_llm_error() -> None:
    err = ModelNotFoundError("unknown model")
    assert isinstance(err, LLMError)


@pytest.mark.unit
def test_tool_execution_error_is_llm_error() -> None:
    err = ToolExecutionError("tool failed")
    assert isinstance(err, LLMError)


@pytest.mark.unit
def test_error_subclasses_preserve_attributes() -> None:
    err = AuthenticationError("denied", provider=ProviderType.OPENAI, code="401")
    assert err.provider == ProviderType.OPENAI
    assert err.code == "401"


@pytest.mark.unit
def test_all_error_subclasses_are_distinct() -> None:
    classes = [AuthenticationError, RateLimitError, ContextLengthError, ModelNotFoundError, ToolExecutionError]
    for cls in classes:
        err = cls("msg")
        assert type(err) is cls


@pytest.mark.unit
def test_llm_provider_supports_tools_default() -> None:
    class MinimalProvider(LLMProvider):
        provider_type = ProviderType.CLAUDE

        def generate(self, input: LLMInput) -> LLMOutput:  # type: ignore[return]
            ...

        def list_models(self) -> list[ModelInfo]:
            return []

        def validate_config(self) -> bool:
            return True

    assert MinimalProvider().supports_tools() is True


@pytest.mark.unit
def test_llm_provider_supports_vision_default() -> None:
    class MinimalProvider(LLMProvider):
        provider_type = ProviderType.CLAUDE

        def generate(self, input: LLMInput) -> LLMOutput:  # type: ignore[return]
            ...

        def list_models(self) -> list[ModelInfo]:
            return []

        def validate_config(self) -> bool:
            return True

    assert MinimalProvider().supports_vision() is False


@pytest.mark.unit
def test_llm_provider_get_default_model_raises() -> None:
    class MinimalProvider(LLMProvider):
        provider_type = ProviderType.CLAUDE

        def generate(self, input: LLMInput) -> LLMOutput:  # type: ignore[return]
            ...

        def list_models(self) -> list[ModelInfo]:
            return []

        def validate_config(self) -> bool:
            return True

    with pytest.raises(NotImplementedError):
        MinimalProvider().get_default_model()
