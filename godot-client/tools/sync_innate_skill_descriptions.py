#!/usr/bin/env python3
"""Sync and validate innate tactical-skill descriptions from formula catalog.

This is a formal project entrypoint. By default it runs in check mode and
fails when player-facing Chinese descriptions drift from
shared/domain/tacticalSkillFormulaCatalog.ts. Use --write to refresh the Godot
profile preview JSON and the 27-general roster draft.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = REPO_ROOT / "godot-client" / "data" / "ui" / "general_profile_preview.json"
DOC_PATH = REPO_ROOT / "docs" / "templates" / "GENERAL_PROFILE_ROSTER_DRAFT_27.md"
EXPECTED_INNATE_COUNT = 27

TSX_FORMULA_QUERY = (
    "import { listRepresentativeTacticalSkillFormulas } from './shared/domain/tacticalSkillFormulaCatalog';"
    "console.log(JSON.stringify(listRepresentativeTacticalSkillFormulas()"
    ".filter((formula) => formula.id.startsWith('innate_'))"
    ".map((formula) => ({"
    "id: formula.id,"
    "name: formula.name,"
    "type: formula.type,"
    "targetSelector: formula.targetSelector,"
    "activationRate: formula.activationRate,"
    "damageKind: formula.damageKind,"
    "damageRate: formula.damageRate,"
    "breakDamageRate: formula.breakDamageRate,"
    "speedBonusRate: formula.speedBonusRate,"
    "burnRate: formula.burnRate,"
    "burnTurns: formula.burnTurns,"
    "healingRate: formula.healingRate,"
    "damageReduction: formula.damageReduction,"
    "attributeModifiers: formula.attributeModifiers,"
    "commandDamageKind: formula.commandDamageKind,"
    "commandDamageRate: formula.commandDamageRate,"
    "commandDamageRepeatCount: formula.commandDamageRepeatCount,"
    "commandDamageRequiredPosition: formula.commandDamageRequiredPosition,"
    "commandDamageTargetSelector: formula.commandDamageTargetSelector,"
    "commandRecoveryRateScale: formula.commandRecoveryRateScale,"
    "controlCleanseCharges: formula.controlCleanseCharges,"
    "evasionChargesAgainst: formula.evasionChargesAgainst,"
    "damageTakenDamageRateScale: formula.damageTakenDamageRateScale,"
    "damageTakenDamageRateMaxBonus: formula.damageTakenDamageRateMaxBonus,"
    "damageTakenDamageRateMinRound: formula.damageTakenDamageRateMinRound,"
    "})), null, 2));"
)

TYPE_LABEL = {
    "command": "指挥",
    "active": "主动",
    "passive": "被动",
    "chase": "追击",
}
ATTR_LABEL = {
    "force": "攻击",
    "command": "统率",
    "intelligence": "谋略",
    "charisma": "魅力",
    "speed": "速度",
}
TARGET_LABEL = {
    "self": "自身",
    "ally_team": "我军全体3名武将",
    "ally_commander": "我军主将",
    "ally_lowest_2": "我军兵力最低2名武将",
    "enemy_team": "敌军全体3名武将",
    "enemy_group_2": "敌军群体2名武将",
    "enemy_commander": "敌军主将",
    "enemy_lowest_1": "敌军兵力最低单体",
    "enemy_random_1": "敌军随机单体",
    "normal_attack_target": "普攻目标",
}
DESCRIPTION_TARGET_LABEL = {
    **TARGET_LABEL,
    "ally_team": "我军全体",
    "ally_lowest_2": "我军兵力最低2人",
    "enemy_team": "敌军全体",
    "enemy_group_2": "敌军2人",
}
DAMAGE_KIND_LABEL = {
    "physical": "攻击",
    "strategy": "谋略",
}
DAMAGE_INFLUENCE = {
    "physical": "伤害受攻击、当前兵力、机动影响",
    "strategy": "伤害受谋略、当前兵力、补给影响",
}


def pct(value: float) -> str:
    raw = round(value * 100, 2)
    if abs(raw - round(raw)) < 0.00001:
        return str(int(round(raw)))
    return f"{raw:.2f}".rstrip("0").rstrip(".")


def selector_text(selector: str | None, *, compact: bool = False) -> str:
    labels = DESCRIPTION_TARGET_LABEL if compact else TARGET_LABEL
    return labels.get(selector or "", selector or "目标")


def modifier_text(attribute_modifiers: dict[str, float] | None) -> str | None:
    if not attribute_modifiers:
        return None
    parts: list[str] = []
    for key, value in attribute_modifiers.items():
        sign = "+" if value >= 0 else ""
        parts.append(f"{ATTR_LABEL.get(key, key)}{sign}{pct(value)}%")
    return "、".join(parts)


def build_trigger(formula: dict[str, Any]) -> str:
    formula_type = str(formula["type"])
    if formula_type in {"command", "passive"}:
        return "第1回合战斗开始时自动生效。"
    if formula_type == "chase":
        return f"普攻后有{int(formula.get('activationRate', 100))}%概率发动。"
    return f"战斗回合行动时有{int(formula.get('activationRate', 100))}%概率发动。"


def damage_text(formula: dict[str, Any], selector: str | None = None) -> str | None:
    damage_kind = formula.get("damageKind")
    damage_rate = formula.get("damageRate")
    if not damage_kind or damage_rate is None:
        return None
    target = selector_text(selector or formula.get("targetSelector"), compact=True)
    kind_label = DAMAGE_KIND_LABEL.get(damage_kind, str(damage_kind))
    text = f"对{target}造成{pct(float(damage_rate))}%{kind_label}伤害"
    break_rate = formula.get("breakDamageRate")
    if break_rate is not None:
        text += f"；若攻击高于目标统率，改为{pct(float(break_rate))}%伤害率"
    speed_bonus = formula.get("speedBonusRate")
    if speed_bonus is not None:
        text += f"；若速度高于目标，追加{pct(float(speed_bonus))}%伤害率"
    taken_max = formula.get("damageTakenDamageRateMaxBonus")
    if formula.get("damageTakenDamageRateScale") is not None and taken_max is not None:
        min_round = formula.get("damageTakenDamageRateMinRound")
        round_text = f"第{min_round}回合起，" if min_round is not None else ""
        text += f"；{round_text}自身已损兵力会提高伤害率，最多+{pct(float(taken_max))}%"
    text += f"，{DAMAGE_INFLUENCE.get(damage_kind, '伤害受对应属性影响')}"
    return text


def burn_text(formula: dict[str, Any]) -> str | None:
    burn_rate = formula.get("burnRate")
    burn_turns = formula.get("burnTurns")
    if burn_rate is None or burn_turns is None:
        return None
    return (
        f"并附加燃烧{burn_turns}回合，每回合{pct(float(burn_rate))}%谋略伤害，"
        "伤害受谋略、当前兵力、补给影响"
    )


def command_damage_text(formula: dict[str, Any]) -> str | None:
    kind = formula.get("commandDamageKind")
    rate = formula.get("commandDamageRate")
    selector = formula.get("commandDamageTargetSelector")
    if kind is None or rate is None or selector is None:
        return None
    target = selector_text(selector, compact=True)
    repeat = int(formula.get("commandDamageRepeatCount") or 1)
    repeat_text = f"{repeat}次" if repeat > 1 else ""
    kind_label = DAMAGE_KIND_LABEL.get(kind, str(kind))
    position = "若自身位于前排，" if formula.get("commandDamageRequiredPosition") == "front" else ""
    return (
        f"{position}对{target}造成{repeat_text}{pct(float(rate))}%{kind_label}小伤害，"
        f"{DAMAGE_INFLUENCE.get(kind, '伤害受对应属性影响')}"
    )


def healing_text(formula: dict[str, Any], actor_name: str | None) -> str | None:
    healing_rate = formula.get("healingRate")
    if healing_rate is None:
        return None
    source = actor_name or ""
    influence = f"治疗量受{source}谋略、当前兵力、补给影响"
    if formula.get("type") == "command" and formula.get("commandRecoveryRateScale") is not None:
        return (
            f"受伤后按{pct(float(healing_rate))}%恢复模板x"
            f"{pct(float(formula['commandRecoveryRateScale']))}%小额恢复，{influence}"
        )
    return f"恢复{selector_text(formula.get('targetSelector'), compact=True)}兵力，基础治疗率{pct(float(healing_rate))}%，{influence}"


def build_description(formula: dict[str, Any], hero_name: str | None) -> str:
    formula_type = formula["type"]
    selector = formula.get("targetSelector")
    prefix = ""
    if formula_type == "active":
        prefix = f"{formula.get('activationRate', 100)}%发动，"
    elif formula_type == "chase":
        prefix = f"普攻后{formula.get('activationRate', 100)}%发动，"
    elif formula_type in {"command", "passive"}:
        prefix = "战斗开始时，"

    parts: list[str] = []
    mod = modifier_text(formula.get("attributeModifiers"))
    if mod:
        if formula.get("damageReduction") is not None:
            parts.append(f"{selector_text(selector, compact=True)}{mod}、获得{pct(float(formula['damageReduction']))}%伤害减免")
        else:
            parts.append(f"{selector_text(selector, compact=True)}{mod}")
    elif formula.get("damageReduction") is not None:
        parts.append(f"{selector_text(selector, compact=True)}获得{pct(float(formula['damageReduction']))}%伤害减免")
    if formula.get("controlCleanseCharges") is not None:
        parts.append(f"我军获得{int(formula['controlCleanseCharges'])}次控制净化")
    if formula.get("evasionChargesAgainst"):
        readable = "、".join(TYPE_LABEL.get(item, item) for item in formula["evasionChargesAgainst"])
        parts.append(f"我军获得1次规避{readable}战法伤害")
    command_damage = command_damage_text(formula)
    if command_damage:
        parts.append(command_damage)
    healing = healing_text(formula, hero_name)
    if healing:
        parts.append(healing)
    damage = damage_text(formula)
    if damage:
        parts.append(damage)
    burn = burn_text(formula)
    if burn:
        parts.append(burn)
    if not parts:
        parts.append("按战斗公式生效")
    return prefix + "；".join(parts) + "。"


def build_effect(formula: dict[str, Any]) -> str:
    selector = formula.get("targetSelector")
    parts: list[str] = []
    mod = modifier_text(formula.get("attributeModifiers"))
    if mod:
        if formula.get("damageReduction") is not None:
            parts.append(f"{selector_text(selector, compact=True)}{mod}、减伤{pct(float(formula['damageReduction']))}%")
        else:
            parts.append(f"{selector_text(selector, compact=True)}{mod}")
    elif formula.get("damageReduction") is not None:
        parts.append(f"{selector_text(selector, compact=True)}减伤{pct(float(formula['damageReduction']))}%")
    if formula.get("controlCleanseCharges") is not None:
        parts.append(f"控制净化+{int(formula['controlCleanseCharges'])}")
    if formula.get("evasionChargesAgainst"):
        readable = "、".join(TYPE_LABEL.get(item, item) for item in formula["evasionChargesAgainst"])
        parts.append(f"规避{readable}+1")
    if formula.get("commandDamageRate") is not None:
        target = selector_text(formula.get("commandDamageTargetSelector"), compact=True)
        repeat = int(formula.get("commandDamageRepeatCount") or 1)
        repeat_text = f"{repeat}次" if repeat > 1 else ""
        kind = DAMAGE_KIND_LABEL.get(formula.get("commandDamageKind"), str(formula.get("commandDamageKind")))
        position = "前排：" if formula.get("commandDamageRequiredPosition") == "front" else ""
        parts.append(f"{position}{target}{repeat_text}{pct(float(formula['commandDamageRate']))}%{kind}小伤害")
    if formula.get("healingRate") is not None:
        if formula.get("type") == "command" and formula.get("commandRecoveryRateScale") is not None:
            parts.append(f"受伤恢复{pct(float(formula['healingRate']))}%x{pct(float(formula['commandRecoveryRateScale']))}%")
        else:
            parts.append(f"{selector_text(selector, compact=True)}恢复{pct(float(formula['healingRate']))}%")
    if formula.get("damageRate") is not None:
        kind = DAMAGE_KIND_LABEL.get(formula.get("damageKind"), str(formula.get("damageKind")))
        parts.append(f"{formula.get('activationRate', 100)}%发动，{selector_text(selector, compact=True)}{pct(float(formula['damageRate']))}%{kind}伤害")
    if formula.get("breakDamageRate") is not None:
        parts.append(f"破防时{pct(float(formula['breakDamageRate']))}%")
    if formula.get("speedBonusRate") is not None:
        parts.append(f"速度高于目标+{pct(float(formula['speedBonusRate']))}%伤害率")
    if formula.get("damageTakenDamageRateMaxBonus") is not None:
        parts.append(f"已损兵力增伤最多+{pct(float(formula['damageTakenDamageRateMaxBonus']))}%")
    if formula.get("burnRate") is not None:
        parts.append(f"燃烧{formula.get('burnTurns', 1)}回合x{pct(float(formula['burnRate']))}%谋略")
    return "；".join(parts) + "。"


def build_attribute_effects(formula: dict[str, Any]) -> dict[str, str]:
    effects: dict[str, str] = {}
    for key, value in (formula.get("attributeModifiers") or {}).items():
        sign = "+" if value >= 0 else ""
        effects[key] = f"{sign}{pct(float(value))}%"
    if formula.get("damageReduction") is not None:
        effects["damage_reduction"] = f"{pct(float(formula['damageReduction']))}%"
    if formula.get("controlCleanseCharges") is not None:
        effects["control_cleanse"] = str(int(formula["controlCleanseCharges"]))
    if formula.get("evasionChargesAgainst"):
        effects["evasion_against"] = "、".join(TYPE_LABEL.get(item, item) for item in formula["evasionChargesAgainst"])
    if formula.get("damageRate") is not None:
        kind = DAMAGE_KIND_LABEL.get(formula.get("damageKind"), str(formula.get("damageKind")))
        effects["damage"] = f"{pct(float(formula['damageRate']))}%{kind}"
    if formula.get("breakDamageRate") is not None:
        effects["break_damage"] = f"{pct(float(formula['breakDamageRate']))}%"
    if formula.get("speedBonusRate") is not None:
        effects["speed_bonus_damage"] = f"+{pct(float(formula['speedBonusRate']))}%"
    if formula.get("damageTakenDamageRateMaxBonus") is not None:
        effects["lost_strength_damage_bonus_cap"] = f"+{pct(float(formula['damageTakenDamageRateMaxBonus']))}%"
    if formula.get("burnRate") is not None:
        effects["burn"] = f"{pct(float(formula['burnRate']))}% x {formula.get('burnTurns', 1)}"
    if formula.get("healingRate") is not None:
        effects["healing"] = f"{pct(float(formula['healingRate']))}%"
    if formula.get("commandRecoveryRateScale") is not None:
        effects["command_recovery"] = f"{pct(float(formula['commandRecoveryRateScale']))}%"
    if formula.get("commandDamageRate") is not None:
        repeat = int(formula.get("commandDamageRepeatCount") or 1)
        repeat_text = f" x {repeat}" if repeat > 1 else ""
        kind = DAMAGE_KIND_LABEL.get(formula.get("commandDamageKind"), str(formula.get("commandDamageKind")))
        effects["command_damage"] = f"{pct(float(formula['commandDamageRate']))}%{kind}{repeat_text}"
    return effects


def resolve_npx() -> str:
    candidates = ["npx.cmd", "npx"] if os.name == "nt" else ["npx", "npx.cmd"]
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return candidates[0]


def load_formulas() -> list[dict[str, Any]]:
    output = subprocess.check_output(
        [resolve_npx(), "tsx", "-e", TSX_FORMULA_QUERY],
        cwd=REPO_ROOT,
        text=True,
        encoding="utf-8",
    )
    formulas = json.loads(output)
    if len(formulas) != EXPECTED_INNATE_COUNT:
        raise ValueError(f"expected {EXPECTED_INNATE_COUNT} innate formulas, got {len(formulas)}")
    return formulas


def build_expected_profile_data(
    profile_data: dict[str, Any],
    formulas_by_id: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[str], dict[str, str]]:
    expected = json.loads(json.dumps(profile_data, ensure_ascii=False))
    hero_profiles = expected.get("hero_profiles", {})
    if not isinstance(hero_profiles, dict):
        raise ValueError("hero_profiles must be an object")
    if len(hero_profiles) != EXPECTED_INNATE_COUNT:
        raise ValueError(f"expected {EXPECTED_INNATE_COUNT} hero profiles, got {len(hero_profiles)}")

    errors: list[str] = []
    doc_line_by_skill_name: dict[str, str] = {}
    for hero_id, profile in hero_profiles.items():
        skills = profile.get("skills", [])
        if not isinstance(skills, list) or len(skills) != 1:
            errors.append(f"hero_profiles[{hero_id}].skills must contain exactly one innate skill")
            continue
        skill = skills[0]
        skill_id = str(skill.get("id", ""))
        formula = formulas_by_id.get(skill_id)
        if formula is None:
            errors.append(f"missing formula for {skill_id}")
            continue
        hero_name = str(profile.get("name", ""))
        description = build_description(formula, hero_name)
        skill["name"] = formula["name"]
        skill["type"] = TYPE_LABEL[formula["type"]]
        skill["description"] = description
        skill["trigger"] = build_trigger(formula)
        skill["target"] = selector_text(formula.get("targetSelector"))
        skill["effect"] = build_effect(formula)
        skill["attribute_effects"] = build_attribute_effects(formula)
        doc_line_by_skill_name[formula["name"]] = (
            f"  - `{formula['name']}`：S / {TYPE_LABEL[formula['type']]} / Lv.10；{description}"
        )
    return expected, errors, doc_line_by_skill_name


def build_expected_doc_text(doc_text: str, doc_line_by_skill_name: dict[str, str]) -> tuple[str, list[str]]:
    lines = doc_text.splitlines()
    skill_line_pattern = re.compile(r"^\s+- `([^`]+)`：S / .*")
    replaced = 0
    for index, line in enumerate(lines):
        match = skill_line_pattern.match(line)
        if not match:
            continue
        replacement = doc_line_by_skill_name.get(match.group(1))
        if replacement is None:
            continue
        lines[index] = replacement
        replaced += 1
    errors: list[str] = []
    if replaced != EXPECTED_INNATE_COUNT:
        errors.append(f"expected to replace {EXPECTED_INNATE_COUNT} doc skill lines, got {replaced}")
    return "\n".join(lines) + "\n", errors


def compare_profile(actual: dict[str, Any], expected: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    actual_profiles = actual.get("hero_profiles", {})
    expected_profiles = expected.get("hero_profiles", {})
    for hero_id, expected_profile in expected_profiles.items():
        actual_profile = actual_profiles.get(hero_id, {})
        expected_skill = expected_profile.get("skills", [{}])[0]
        actual_skill = actual_profile.get("skills", [{}])[0] if isinstance(actual_profile.get("skills"), list) else {}
        for field in ["name", "type", "description", "trigger", "target", "effect", "attribute_effects"]:
            if actual_skill.get(field) != expected_skill.get(field):
                errors.append(f"{expected_skill.get('id', hero_id)} field drift: {field}")
    return errors


def run(write: bool) -> dict[str, Any]:
    formulas = load_formulas()
    formulas_by_id = {str(formula["id"]): formula for formula in formulas}
    profile_data = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    doc_text = DOC_PATH.read_text(encoding="utf-8")

    expected_profile, profile_build_errors, doc_line_by_skill_name = build_expected_profile_data(profile_data, formulas_by_id)
    expected_doc_text, doc_build_errors = build_expected_doc_text(doc_text, doc_line_by_skill_name)
    profile_drift = compare_profile(profile_data, expected_profile)
    doc_drift = [] if doc_text == expected_doc_text else ["docs/templates/GENERAL_PROFILE_ROSTER_DRAFT_27.md drift"]

    errors = profile_build_errors + doc_build_errors + profile_drift + doc_drift
    if write:
        PROFILE_PATH.write_text(json.dumps(expected_profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        DOC_PATH.write_text(expected_doc_text, encoding="utf-8")
        errors = []

    hero_profiles = expected_profile.get("hero_profiles", {})
    descriptions = [
        str(skill.get("description", ""))
        for profile in hero_profiles.values()
        for skill in profile.get("skills", [])
        if isinstance(skill, dict)
    ]
    effects = [
        str(skill.get("effect", ""))
        for profile in hero_profiles.values()
        for skill in profile.get("skills", [])
        if isinstance(skill, dict)
    ]
    return {
        "ok": not errors,
        "mode": "write" if write else "check",
        "formulaCount": len(formulas),
        "heroCount": len(hero_profiles) if isinstance(hero_profiles, dict) else 0,
        "maxDescriptionLength": max((len(item) for item in descriptions), default=0),
        "maxEffectLength": max((len(item) for item in effects), default=0),
        "updatedFiles": [str(PROFILE_PATH.relative_to(REPO_ROOT)), str(DOC_PATH.relative_to(REPO_ROOT))] if write else [],
        "errorCount": len(errors),
        "errors": errors,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate or sync formula-derived innate skill descriptions.")
    parser.add_argument("--check", action="store_true", help="Check only; this is the default.")
    parser.add_argument("--write", action="store_true", help="Rewrite JSON/doc descriptions from the formula catalog.")
    parser.add_argument("--json", action="store_true", help="Print a machine-readable JSON report.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = run(write=bool(args.write))
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("innate_skill_description_sync")
        print(f"mode={report['mode']}")
        print(f"formulaCount={report['formulaCount']}")
        print(f"heroCount={report['heroCount']}")
        print(f"maxDescriptionLength={report['maxDescriptionLength']}")
        print(f"maxEffectLength={report['maxEffectLength']}")
        print(f"validation={'PASSED' if report['ok'] else 'FAILED'}")
        for error in report["errors"]:
            print(f"ERROR: {error}")
    return 0 if bool(report["ok"]) else 1


if __name__ == "__main__":
    sys.exit(main())
