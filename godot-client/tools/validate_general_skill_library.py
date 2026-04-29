#!/usr/bin/env python3
"""Validate the Godot native UI general skill library preview data.

This is a reusable project validation helper, not a one-off tmp script.
It intentionally stays under godot-client/tools because it validates Godot UI
preview data only and does not touch server/shared authority code.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
SKILL_LIBRARY_PATH = REPO_ROOT / "godot-client" / "data" / "ui" / "general_skill_library_preview.json"
GENERAL_PROFILE_PATH = REPO_ROOT / "godot-client" / "data" / "ui" / "general_profile_preview.json"

REQUIRED_SKILL_FIELDS = {
    "id",
    "name",
    "grade",
    "type",
    "level",
    "description",
    "trigger",
    "target",
    "effect",
    "attribute_effects",
    "source",
    "unlock_hint",
    "compatible_troops",
    "recommended_slot",
    "combat_role",
    "tags",
}
ALLOWED_GRADES = {"S", "A", "B"}
ALLOWED_TYPES = {"\u6307\u6325", "\u4e3b\u52a8", "\u88ab\u52a8", "\u8ffd\u51fb"}
ALLOWED_TROOPS = {"\u9a91\u5175", "\u6b65\u5175", "\u5f13\u5175"}
ALLOWED_PROFILE_TROOP_TYPES = {"cavalry", "infantry", "archer"}
ALLOWED_RECOMMENDED_SLOTS = {"\u4efb\u610f"}
ALLOWED_SOURCE_POOLS = {"\u62db\u52df"}
ALLOWED_TAGS = {
    "\u65b0\u624b",
    "\u4f4e\u6210\u672c",
    "\u5f00\u5c40",
    "\u540e\u53d1",
    "\u51c6\u5907",
    "\u4e3b\u52a8",
    "\u8ffd\u51fb",
    "\u666e\u653b",
    "\u8fde\u51fb",
    "\u5355\u4f53",
    "\u7fa4\u4f53",
    "\u653b\u51fb\u4f24\u5bb3",
    "\u8c0b\u7565\u4f24\u5bb3",
    "\u71c3\u70e7",
    "\u7834\u9632",
    "\u964d\u901f",
    "\u63a7\u5236",
    "\u51cf\u4f24",
    "\u6062\u590d",
    "\u81ea\u4fdd",
    "\u6297\u63a7",
    "\u5168\u961f",
    "\u4e3b\u5c06\u4fdd\u62a4",
    "\u9a91\u5175",
    "\u6b65\u5175",
    "\u5f13\u5175",
    "\u901f\u5ea6",
    "\u589e\u4f24",
    "\u4f4e\u5175\u529b",
}
SOURCE_KIND = "general_skill_library_preview"
ACQUISITION_ENTRY = "\u6b66\u5c06\u62db\u52df"
ACQUISITION_DRAW_MODES = {"\u5355\u62db", "\u4e94\u8fde"}
RECRUIT_PREVIEW_CARD_CLASSES = {"hero_card", "skill_card"}
RECRUIT_PREVIEW_RARITY_IDS = {"hero_s", "skill_s", "skill_a", "skill_b"}
RECRUIT_WEIGHT_RANGES = {
    "skill_card": (65, 75),
    "hero_card": (25, 35),
    "hero_s": (25, 35),
    "skill_s": (8, 12),
    "skill_a": (25, 35),
    "skill_b": (25, 35),
}
ID_PATTERN = re.compile(r"^lib_[sab]_[a-z0-9_]+$")
NUMERIC_SIGNAL_PATTERN = re.compile(r"\d+(?:\.\d+)?%?")


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _is_non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _numeric_signal_count(skill: dict[str, Any]) -> int:
    attribute_effects = skill.get("attribute_effects", {})
    attribute_text = " ".join(str(value) for value in attribute_effects.values()) if isinstance(attribute_effects, dict) else ""
    text = " ".join(
        [
            str(skill.get("description", "")),
            str(skill.get("trigger", "")),
            str(skill.get("target", "")),
            str(skill.get("effect", "")),
            attribute_text,
        ]
    )
    return len(NUMERIC_SIGNAL_PATTERN.findall(text))


def _weight_sum(items: Any) -> float:
    if not isinstance(items, list):
        return 0.0
    total = 0.0
    for item in items:
        if isinstance(item, dict):
            total += float(item.get("weight", 0))
    return total


def _weights_by_id(items: Any) -> dict[str, float]:
    if not isinstance(items, list):
        return {}
    result: dict[str, float] = {}
    for item in items:
        if isinstance(item, dict):
            result[str(item.get("id", ""))] = float(item.get("weight", 0))
    return result


def _validate_weight_range(weights: dict[str, float], weight_id: str, errors: list[str]) -> None:
    low, high = RECRUIT_WEIGHT_RANGES[weight_id]
    value = weights.get(weight_id)
    if value is None:
        errors.append(f"recruit_probability_preview {weight_id} weight must be present")
    elif not (low <= value <= high):
        errors.append(f"recruit_probability_preview {weight_id} weight must stay in {low}-{high}")


def _validate_recruit_probability_preview(probability_preview: Any, errors: list[str]) -> dict[str, Any]:
    if not isinstance(probability_preview, dict):
        errors.append("recruit_probability_preview must be an object")
        return {"item_type_weights": [], "rarity_weights": []}
    if probability_preview.get("preview_only") is not True:
        errors.append("recruit_probability_preview.preview_only must be true")
    if probability_preview.get("no_inventory_write") is not True:
        errors.append("recruit_probability_preview.no_inventory_write must be true")
    draw_modes = probability_preview.get("draw_modes", [])
    if not isinstance(draw_modes, list) or set(draw_modes) != ACQUISITION_DRAW_MODES:
        errors.append("recruit_probability_preview.draw_modes must be 单招/五连")
    card_classes = probability_preview.get("card_classes", [])
    if not isinstance(card_classes, list):
        errors.append("recruit_probability_preview.card_classes must be an array")
    else:
        class_ids = {str(item.get("id", "")) for item in card_classes if isinstance(item, dict)}
        if class_ids != RECRUIT_PREVIEW_CARD_CLASSES:
            errors.append("recruit_probability_preview.card_classes must define hero_card and skill_card")
    item_type_weights = probability_preview.get("item_type_weights", [])
    if abs(_weight_sum(item_type_weights) - 100.0) > 0.001:
        errors.append("recruit_probability_preview.item_type_weights must sum to 100")
    item_type_by_id = _weights_by_id(item_type_weights)
    for weight_id in ["skill_card", "hero_card"]:
        _validate_weight_range(item_type_by_id, weight_id, errors)
    rarity_weights = probability_preview.get("rarity_weights", [])
    if abs(_weight_sum(rarity_weights) - 100.0) > 0.001:
        errors.append("recruit_probability_preview.rarity_weights must sum to 100")
    rarity_by_id = _weights_by_id(rarity_weights)
    if set(rarity_by_id.keys()) != RECRUIT_PREVIEW_RARITY_IDS:
        errors.append("recruit_probability_preview.rarity_weights must define hero_s/skill_s/skill_a/skill_b only")
    for weight_id in ["hero_s", "skill_s", "skill_a", "skill_b"]:
        _validate_weight_range(rarity_by_id, weight_id, errors)
    for field in [
        "pool_id",
        "pool_name",
        "five_draw_preview_rule",
        "pity_preview_note",
        "probability_note",
        "single_draw_preview_note",
        "five_draw_probability_note",
    ]:
        if not _is_non_empty_string(probability_preview.get(field)):
            errors.append(f"recruit_probability_preview.{field} must be a non-empty string")
    guarantee_preview = probability_preview.get("guarantee_preview", {})
    if not isinstance(guarantee_preview, dict):
        errors.append("recruit_probability_preview.guarantee_preview must be an object")
    elif guarantee_preview.get("enabled") is not False:
        errors.append("recruit_probability_preview.guarantee_preview.enabled must stay false before inventory chain exists")
    display_notes = probability_preview.get("display_notes", [])
    if not isinstance(display_notes, list) or len(display_notes) < 2:
        errors.append("recruit_probability_preview.display_notes must document preview-only boundaries")
    depletion_preview = probability_preview.get("pool_depletion_preview", {})
    if not isinstance(depletion_preview, dict):
        errors.append("recruit_probability_preview.pool_depletion_preview must be an object")
    else:
        if depletion_preview.get("preview_only") is not True:
            errors.append("recruit_probability_preview.pool_depletion_preview.preview_only must be true")
        if depletion_preview.get("no_inventory_write") is not True:
            errors.append("recruit_probability_preview.pool_depletion_preview.no_inventory_write must be true")
        if depletion_preview.get("skill_card_remove_on_draw") is not True:
            errors.append("recruit_probability_preview.pool_depletion_preview.skill_card_remove_on_draw must be true")
        if not _is_non_empty_string(depletion_preview.get("depletion_rule")):
            errors.append("recruit_probability_preview.pool_depletion_preview.depletion_rule must be a non-empty string")
    return {
        "item_type_weights": item_type_weights if isinstance(item_type_weights, list) else [],
        "rarity_weights": rarity_weights if isinstance(rarity_weights, list) else [],
        "pool_depletion_preview": depletion_preview if isinstance(depletion_preview, dict) else {},
    }


def _validate_skill(skill: dict[str, Any], index: int, seen_ids: set[str], errors: list[str]) -> None:
    skill_id = str(skill.get("id", "")).strip()
    missing = sorted(REQUIRED_SKILL_FIELDS - set(skill.keys()))
    if missing:
        errors.append(f"skills[{index}] {skill_id or '<missing id>'}: missing fields {missing}")
    if not _is_non_empty_string(skill_id):
        errors.append(f"skills[{index}]: id must be a non-empty string")
    elif not ID_PATTERN.match(skill_id):
        errors.append(f"skills[{index}] {skill_id}: id must match lib_<grade>_<name>")
    elif skill_id in seen_ids:
        errors.append(f"skills[{index}] {skill_id}: duplicate id")
    seen_ids.add(skill_id)
    if skill_id.startswith("innate_"):
        errors.append(f"skills[{index}] {skill_id}: library skill must not use innate_ prefix")

    for field in ["name", "description", "trigger", "target", "effect", "unlock_hint"]:
        if not _is_non_empty_string(skill.get(field)):
            errors.append(f"skills[{index}] {skill_id}: {field} must be a non-empty string")

    if skill.get("grade") not in ALLOWED_GRADES:
        errors.append(f"skills[{index}] {skill_id}: grade must be one of S/A/B")
    elif skill_id.startswith("lib_") and len(skill_id) >= 5:
        grade_prefix = skill_id.split("_", 2)[1].upper()
        if grade_prefix != str(skill.get("grade")):
            errors.append(f"skills[{index}] {skill_id}: id grade prefix must match grade")
    if skill.get("type") not in ALLOWED_TYPES:
        errors.append(f"skills[{index}] {skill_id}: type must be command/active/passive/chase")
    if not isinstance(skill.get("level"), int) or int(skill.get("level", 0)) < 1:
        errors.append(f"skills[{index}] {skill_id}: level must be a positive integer")
    if not isinstance(skill.get("attribute_effects"), dict) or not skill.get("attribute_effects"):
        errors.append(f"skills[{index}] {skill_id}: attribute_effects must be a non-empty object")
    if _numeric_signal_count(skill) < 2:
        errors.append(f"skills[{index}] {skill_id}: description/trigger/effect must contain at least two numeric signals")
    if skill.get("recommended_slot") not in ALLOWED_RECOMMENDED_SLOTS:
        errors.append(f"skills[{index}] {skill_id}: recommended_slot must be 任意 in the first library version")
    if not _is_non_empty_string(skill.get("combat_role")):
        errors.append(f"skills[{index}] {skill_id}: combat_role must be a non-empty string")

    source = skill.get("source")
    if not isinstance(source, dict):
        errors.append(f"skills[{index}] {skill_id}: source must be an object")
    else:
        if source.get("kind") != SOURCE_KIND:
            errors.append(f"skills[{index}] {skill_id}: source.kind must be {SOURCE_KIND}")
        for source_field in ["pool", "unlock_method", "bind_rule"]:
            if not _is_non_empty_string(source.get(source_field)):
                errors.append(f"skills[{index}] {skill_id}: source.{source_field} must be a non-empty string")
        source_pool = source.get("pool")
        if _is_non_empty_string(source_pool) and source_pool not in ALLOWED_SOURCE_POOLS:
            errors.append(f"skills[{index}] {skill_id}: source.pool is not in allowed pool enum")
        bind_rule = str(source.get("bind_rule", ""))
        if "hero_profiles[*].skills[0]" not in bind_rule:
            errors.append(f"skills[{index}] {skill_id}: source.bind_rule must mention hero_profiles[*].skills[0]")

    troops = skill.get("compatible_troops")
    if not isinstance(troops, list) or not troops:
        errors.append(f"skills[{index}] {skill_id}: compatible_troops must be a non-empty array")
    else:
        for troop in troops:
            if troop not in ALLOWED_TROOPS:
                errors.append(f"skills[{index}] {skill_id}: unsupported troop {troop!r}")

    tags = skill.get("tags")
    if not isinstance(tags, list) or not tags:
        errors.append(f"skills[{index}] {skill_id}: tags must be a non-empty array")
    else:
        for tag in tags:
            if not _is_non_empty_string(tag):
                errors.append(f"skills[{index}] {skill_id}: tags must contain non-empty strings")
            elif tag not in ALLOWED_TAGS:
                errors.append(f"skills[{index}] {skill_id}: tag {tag!r} is not in allowed tag enum")


def _build_report(errors: list[str], summary: dict[str, Any]) -> dict[str, Any]:
    report = dict(summary)
    report["validation"] = "FAILED" if errors else "PASSED"
    report["error_count"] = len(errors)
    report["errors"] = errors
    return report


def _print_text_report(report: dict[str, Any]) -> None:
    print("general_skill_library_validation")
    for key in [
        "skill_count",
        "grade_counts",
        "type_counts",
        "troop_counts",
        "recommended_slot_counts",
        "source_pool_counts",
        "recruit_probability_item_type_weights",
        "recruit_probability_rarity_weights",
        "top_tag_counts",
        "hero_count",
        "hero_skill_counts",
    ]:
        print(f"{key}={report.get(key)}")
    print(f"validation={report.get('validation')}")
    for error in report.get("errors", []):
        print(f"ERROR: {error}")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate Godot native UI general skill library preview data.")
    parser.add_argument("--json", action="store_true", help="Print a machine-readable JSON validation report.")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    errors: list[str] = []
    library = _load_json(SKILL_LIBRARY_PATH)
    profiles = _load_json(GENERAL_PROFILE_PATH)

    skills = library.get("skills", [])
    if not isinstance(skills, list):
        errors.append("skills must be an array")
        skills = []
    if not (20 <= len(skills) <= 50):
        errors.append(f"skills count must be 20-50, got {len(skills)}")
    supported_troops = library.get("supported_troops", [])
    if supported_troops and (not isinstance(supported_troops, list) or set(supported_troops) != ALLOWED_TROOPS):
        errors.append("supported_troops must be exactly cavalry/infantry/archer labels")
    supported_recommended_slots = library.get("supported_recommended_slots", [])
    if supported_recommended_slots and (
        not isinstance(supported_recommended_slots, list) or set(supported_recommended_slots) != ALLOWED_RECOMMENDED_SLOTS
    ):
        errors.append("supported_recommended_slots must contain only 任意")
    supported_source_pools = library.get("supported_source_pools", [])
    if supported_source_pools and (
        not isinstance(supported_source_pools, list) or set(supported_source_pools) != ALLOWED_SOURCE_POOLS
    ):
        errors.append("supported_source_pools must match the narrowed source pool enum")
    supported_tags = library.get("supported_tags", [])
    if supported_tags and (not isinstance(supported_tags, list) or set(supported_tags) != ALLOWED_TAGS):
        errors.append("supported_tags must match the narrowed tag enum")
    acquisition_model = library.get("acquisition_model", {})
    if not isinstance(acquisition_model, dict):
        errors.append("acquisition_model must describe the recruit-pool acquisition model")
        acquisition_model = {}
    else:
        if acquisition_model.get("entry") != ACQUISITION_ENTRY:
            errors.append("acquisition_model.entry must be 武将招募")
        draw_modes = acquisition_model.get("draw_modes", [])
        if not isinstance(draw_modes, list) or set(draw_modes) != ACQUISITION_DRAW_MODES:
            errors.append("acquisition_model.draw_modes must be 单招/五连")
        inventory_rule = str(acquisition_model.get("inventory_rule", ""))
        if "hero_profiles[*].skills[0]" not in inventory_rule:
            errors.append("acquisition_model.inventory_rule must mention hero_profiles[*].skills[0]")
    probability_summary = _validate_recruit_probability_preview(library.get("recruit_probability_preview", {}), errors)

    seen_ids: set[str] = set()
    for index, raw_skill in enumerate(skills):
        if not isinstance(raw_skill, dict):
            errors.append(f"skills[{index}] must be an object")
            continue
        _validate_skill(raw_skill, index, seen_ids, errors)

    hero_profiles = profiles.get("hero_profiles", {})
    if not isinstance(hero_profiles, dict):
        errors.append("hero_profiles must be an object")
        hero_profiles = {}
    hero_skill_counts = Counter()
    for hero_id, raw_profile in hero_profiles.items():
        if not isinstance(raw_profile, dict):
            errors.append(f"hero_profiles[{hero_id}] must be an object")
            continue
        if "troop_aptitudes" in raw_profile:
            errors.append(f"hero_profiles[{hero_id}] must not define troop_aptitudes; each hero has one fixed troop_type")
        troop_type = str(raw_profile.get("troop_type", ""))
        if troop_type not in ALLOWED_PROFILE_TROOP_TYPES:
            errors.append(f"hero_profiles[{hero_id}].troop_type must be one of cavalry/infantry/archer")
        hero_skills = raw_profile.get("skills", [])
        if not isinstance(hero_skills, list) or len(hero_skills) != 1:
            errors.append(f"hero_profiles[{hero_id}].skills must contain exactly one innate skill")
        else:
            hero_skill_counts[len(hero_skills)] += 1
            innate_id = str(hero_skills[0].get("id", "")) if isinstance(hero_skills[0], dict) else ""
            if not innate_id.startswith("innate_"):
                errors.append(f"hero_profiles[{hero_id}].skills[0].id must use innate_ prefix")

    grade_counts = Counter(str(skill.get("grade", "")) for skill in skills if isinstance(skill, dict))
    type_counts = Counter(str(skill.get("type", "")) for skill in skills if isinstance(skill, dict))
    troop_counts = Counter(
        str(troop)
        for skill in skills
        if isinstance(skill, dict)
        for troop in skill.get("compatible_troops", [])
    )
    slot_counts = Counter(str(skill.get("recommended_slot", "")) for skill in skills if isinstance(skill, dict))
    source_pool_counts = Counter(
        str(skill.get("source", {}).get("pool", ""))
        for skill in skills
        if isinstance(skill, dict) and isinstance(skill.get("source"), dict)
    )
    tag_counts = Counter(
        str(tag)
        for skill in skills
        if isinstance(skill, dict)
        for tag in skill.get("tags", [])
    )
    for grade in sorted(ALLOWED_GRADES):
        if grade_counts.get(grade, 0) <= 0:
            errors.append(f"library must include at least one {grade} grade skill")
    for skill_type in sorted(ALLOWED_TYPES):
        if type_counts.get(skill_type, 0) <= 0:
            errors.append(f"library must include at least one skill type {skill_type}")
    for troop in sorted(ALLOWED_TROOPS):
        if troop_counts.get(troop, 0) <= 0:
            errors.append(f"library must include at least one compatible troop {troop}")

    summary = {
        "skill_count": len(skills),
        "grade_counts": dict(grade_counts),
        "type_counts": dict(type_counts),
        "troop_counts": dict(troop_counts),
        "recommended_slot_counts": dict(slot_counts),
        "source_pool_counts": dict(source_pool_counts),
        "recruit_probability_item_type_weights": probability_summary["item_type_weights"],
        "recruit_probability_rarity_weights": probability_summary["rarity_weights"],
        "recruit_probability_pool_depletion_preview": probability_summary["pool_depletion_preview"],
        "top_tag_counts": dict(tag_counts.most_common(12)),
        "hero_count": len(hero_profiles),
        "hero_skill_counts": {str(key): value for key, value in hero_skill_counts.items()},
    }
    report = _build_report(errors, summary)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        _print_text_report(report)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
