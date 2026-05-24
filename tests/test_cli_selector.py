from __future__ import annotations

import os

import pytest
from unittest.mock import patch

from llm.cli.selector import Color, save_config, select_model, select_provider


@pytest.mark.unit
def test_select_provider_empty_list() -> None:
    result = select_provider([])
    assert result is None


@pytest.mark.unit
def test_select_provider_valid_first() -> None:
    providers = [("claude", "Anthropic"), ("openai", "OpenAI")]
    with patch("builtins.input", return_value="1"):
        result = select_provider(providers)
    assert result == "claude"


@pytest.mark.unit
def test_select_provider_valid_last() -> None:
    providers = [("claude", "Anthropic"), ("openai", "OpenAI"), ("ollama", "Local")]
    with patch("builtins.input", return_value="3"):
        result = select_provider(providers)
    assert result == "ollama"


@pytest.mark.unit
def test_select_provider_empty_input_returns_none() -> None:
    providers = [("claude", "Anthropic")]
    with patch("builtins.input", return_value=""):
        result = select_provider(providers)
    assert result is None


@pytest.mark.unit
def test_select_provider_invalid_then_valid() -> None:
    providers = [("claude", "Anthropic"), ("openai", "OpenAI")]
    with patch("builtins.input", side_effect=["99", "abc", "2"]):
        result = select_provider(providers)
    assert result == "openai"


@pytest.mark.unit
def test_select_provider_out_of_range_then_valid() -> None:
    providers = [("claude", "Anthropic")]
    with patch("builtins.input", side_effect=["0", "5", "1"]):
        result = select_provider(providers)
    assert result == "claude"


@pytest.mark.unit
def test_select_model_empty_list() -> None:
    result = select_model([])
    assert result is None


@pytest.mark.unit
def test_select_model_valid() -> None:
    models = [("gpt-4o", "Most capable"), ("gpt-4o-mini", "Fast")]
    with patch("builtins.input", return_value="2"):
        result = select_model(models)
    assert result == "gpt-4o-mini"


@pytest.mark.unit
def test_select_model_empty_input_returns_none() -> None:
    models = [("llama3.2", "General")]
    with patch("builtins.input", return_value=""):
        result = select_model(models)
    assert result is None


@pytest.mark.unit
def test_select_model_invalid_then_valid() -> None:
    models = [("llama3.2", "General"), ("mistral", "Fast")]
    with patch("builtins.input", side_effect=["abc", "10", "1"]):
        result = select_model(models)
    assert result == "llama3.2"


@pytest.mark.unit
def test_save_config_writes_env_vars(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    save_config("ollama", "llama3.2")
    env_file = tmp_path / ".llm.env"
    assert env_file.exists()
    content = env_file.read_text()
    assert "LLM_PROVIDER=ollama" in content
    assert "LLM_MODEL=llama3.2" in content


@pytest.mark.unit
def test_save_config_overwrites_previous(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    save_config("claude", "claude-opus-4-5")
    save_config("openai", "gpt-4o")
    content = (tmp_path / ".llm.env").read_text()
    assert "LLM_PROVIDER=openai" in content
    assert "LLM_MODEL=gpt-4o" in content
    assert "claude" not in content


@pytest.mark.unit
def test_save_config_persist_sets_env(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    save_config("openai", "gpt-4o-mini", persist=True)
    assert os.environ["LLM_PROVIDER"] == "openai"
    assert os.environ["LLM_MODEL"] == "gpt-4o-mini"


@pytest.mark.unit
def test_color_reset_is_ansi_code() -> None:
    assert Color.RESET.value == "\033[0m"


@pytest.mark.unit
def test_color_values_start_with_escape() -> None:
    for color in Color:
        assert color.value.startswith("\033["), f"{color.name} does not start with ESC sequence"
