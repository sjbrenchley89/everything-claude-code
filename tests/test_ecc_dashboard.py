from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

import pytest

# Stub out GUI and platform-specific dependencies before importing the dashboard module
for _mod in ("tkinter", "tkinter.ttk", "tkinter.scrolledtext", "tkinter.messagebox"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

for _mod in ("scripts", "scripts.lib"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

sys.modules["scripts.lib.ecc_dashboard_runtime"] = MagicMock()

from ecc_dashboard import (  # noqa: E402
    get_project_path,
    load_agents,
    load_commands,
    load_rules,
    load_skills,
)


@pytest.mark.unit
def test_get_project_path_returns_absolute() -> None:
    result = get_project_path()
    assert os.path.isabs(result)


@pytest.mark.unit
def test_load_agents_fallback_when_dir_missing(tmp_path) -> None:
    agents = load_agents(str(tmp_path / "nonexistent"))
    assert len(agents) > 0
    assert all("name" in a for a in agents)
    assert all("purpose" in a for a in agents)


@pytest.mark.unit
def test_load_agents_reads_md_files(tmp_path) -> None:
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "planner.md").write_text("# Planner")
    (agents_dir / "reviewer.md").write_text("# Reviewer")
    agents = load_agents(str(tmp_path))
    names = [a["name"] for a in agents]
    assert "planner" in names
    assert "reviewer" in names


@pytest.mark.unit
def test_load_agents_parses_frontmatter(tmp_path) -> None:
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "tdd-guide.md").write_text(
        "---\nname: tdd-guide\ndescription: Test-driven development\n---\n# Body"
    )
    agents = load_agents(str(tmp_path))
    tdd = next(a for a in agents if a["name"] == "tdd-guide")
    assert tdd["purpose"] == "Test-driven development"


@pytest.mark.unit
def test_load_agents_ignores_non_md_files(tmp_path) -> None:
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "agent.md").write_text("---\nname: agent\n---")
    (agents_dir / "README.txt").write_text("ignore me")
    agents = load_agents(str(tmp_path))
    assert all(a["name"] != "README" for a in agents)


@pytest.mark.unit
def test_load_skills_fallback_when_dir_missing(tmp_path) -> None:
    skills = load_skills(str(tmp_path / "nonexistent"))
    assert len(skills) > 0
    assert all("name" in s for s in skills)
    assert all("category" in s for s in skills)


@pytest.mark.unit
def test_load_skills_reads_directories(tmp_path) -> None:
    skills_dir = tmp_path / "skills"
    skills_dir.mkdir()
    (skills_dir / "tdd-workflow").mkdir()
    (skills_dir / "security-review").mkdir()
    skills = load_skills(str(tmp_path))
    names = [s["name"] for s in skills]
    assert "tdd-workflow" in names
    assert "security-review" in names


@pytest.mark.unit
def test_load_skills_categorizes_python(tmp_path) -> None:
    skills_dir = tmp_path / "skills"
    skills_dir.mkdir()
    (skills_dir / "python-patterns").mkdir()
    skills = load_skills(str(tmp_path))
    py = next(s for s in skills if s["name"] == "python-patterns")
    assert py["category"] == "Python"


@pytest.mark.unit
def test_load_skills_reads_skill_md(tmp_path) -> None:
    skills_dir = tmp_path / "skills"
    skills_dir.mkdir()
    skill_dir = skills_dir / "my-skill"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text("# My Skill\nDoes something useful")
    skills = load_skills(str(tmp_path))
    skill = next(s for s in skills if s["name"] == "my-skill")
    assert skill["description"] == "My Skill"


@pytest.mark.unit
def test_load_commands_fallback_when_dir_missing(tmp_path) -> None:
    commands = load_commands(str(tmp_path / "nonexistent"))
    assert len(commands) > 0
    assert all("name" in c for c in commands)


@pytest.mark.unit
def test_load_commands_reads_md_files(tmp_path) -> None:
    cmds_dir = tmp_path / "commands"
    cmds_dir.mkdir()
    (cmds_dir / "plan.md").write_text("# Plan\nCreate an implementation plan")
    commands = load_commands(str(tmp_path))
    names = [c["name"] for c in commands]
    assert "plan" in names


@pytest.mark.unit
def test_load_commands_extracts_h1_description(tmp_path) -> None:
    cmds_dir = tmp_path / "commands"
    cmds_dir.mkdir()
    (cmds_dir / "review.md").write_text("# Code Review\nReview the code")
    commands = load_commands(str(tmp_path))
    review = next(c for c in commands if c["name"] == "review")
    assert review["description"] == "Code Review"


@pytest.mark.unit
def test_load_rules_fallback_when_dir_missing(tmp_path) -> None:
    rules = load_rules(str(tmp_path / "nonexistent"))
    assert len(rules) > 0
    assert all("name" in r for r in rules)
    assert all("language" in r for r in rules)


@pytest.mark.unit
def test_load_rules_reads_common_subdirectory(tmp_path) -> None:
    rules_dir = tmp_path / "rules"
    common_dir = rules_dir / "common"
    common_dir.mkdir(parents=True)
    (common_dir / "coding-style.md").write_text("# Coding style rules")
    rules = load_rules(str(tmp_path))
    names = [r["name"] for r in rules]
    assert "coding-style" in names


@pytest.mark.unit
def test_load_rules_assigns_language_from_directory(tmp_path) -> None:
    rules_dir = tmp_path / "rules"
    python_dir = rules_dir / "python"
    python_dir.mkdir(parents=True)
    (python_dir / "patterns.md").write_text("# Python patterns")
    rules = load_rules(str(tmp_path))
    py_rules = [r for r in rules if r["language"] == "Python"]
    assert any(r["name"] == "patterns" for r in py_rules)


@pytest.mark.unit
def test_load_rules_common_language_label(tmp_path) -> None:
    rules_dir = tmp_path / "rules"
    common_dir = rules_dir / "common"
    common_dir.mkdir(parents=True)
    (common_dir / "git-workflow.md").write_text("# Git workflow")
    rules = load_rules(str(tmp_path))
    common_rules = [r for r in rules if r["language"] == "Common"]
    assert any(r["name"] == "git-workflow" for r in common_rules)
