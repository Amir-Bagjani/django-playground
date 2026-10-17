#!/usr/bin/env python3
"""Validate Academy authoring structures (NOT exercise correctness or runtime).

Run from any directory. Requires pip install PyYAML jsonschema.

Examples:
  python scripts/validate_content.py
  python scripts/validate_content.py --lesson DB-03-005
"""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
import re
import sys

try:
    import yaml
    from jsonschema import Draft202012Validator
except ImportError:
    raise SystemExit("Install authoring dev deps: pip install PyYAML jsonschema")

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []
warnings: list[str] = []


def fail(reason: str) -> None:
    errors.append(reason)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"{path}: invalid JSON: {exc}")
        return None


def check_schema(data, name: str, location: str):
    if data is None:
        return
    schema = load_json(ROOT / "schemas" / name)
    if schema is None:
        return
    for e in Draft202012Validator(schema).iter_errors(data):
        fail(f"{location}: {'.'.join(str(p) for p in e.absolute_path)}: {e.message}")


def parse_frontmatter(path: Path):
    source = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\s*\n(.*?)\n---\s*\n", source, re.S)
    if not match:
        fail(f"{path}: requires YAML frontmatter delimited by ---")
        return None
    try:
        result = yaml.safe_load(match.group(1))
        if not isinstance(result, dict):
            fail(f"{path}: frontmatter must be a map")
            return None
        return result
    except yaml.YAMLError as exc:
        fail(f"{path}: bad YAML frontmatter: {exc}")
        return None


def safe_relative(container: Path, filename: str, allow_parent: bool = False):
    path = Path(filename)
    if not filename or path.is_absolute() or "\\" in filename or "\x00" in filename:
        return None
    if not allow_parent and any(x == ".." for x in path.parts):
        return None
    candidate = (container / path).resolve()
    if allow_parent:
        if not candidate.is_relative_to(ROOT):
            return None
    elif not candidate.is_relative_to(container.resolve()):
        return None
    return candidate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lesson", help="Check only authored content for a specific lesson ID, plus global curriculum validity")
    args = parser.parse_args()

    try:
        cur = yaml.safe_load((ROOT / "curriculum" / "curriculum.yaml").read_text(encoding="utf-8"))
        inventory = yaml.safe_load((ROOT / "curriculum" / "concepts.yaml").read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise SystemExit(f"Cannot load curriculum: {exc}")

    check_schema(cur, "curriculum.schema.json", "curriculum/curriculum.yaml")
    module_ids = set()
    lessons = {}
    lesson_module = {}
    slugs = set()
    for module in cur.get("modules", []):
        mid = module.get("id")
        if mid in module_ids:
            fail(f"duplicate module ID {mid}")
        module_ids.add(mid)
        for lesson in module.get("lessons", []):
            lid = lesson.get("id")
            if lid in lessons:
                fail(f"duplicate lesson ID {lid}")
            lessons[lid] = lesson
            lesson_module[lid] = mid
            if not str(lid).startswith(str(mid) + "-"):
                fail(f"lesson {lid} belongs to wrong module {mid}")
            if (mid,lesson.get('slug')) in slugs:
                fail(f"duplicate lesson slug in {mid}: {lesson.get('slug')}")
            slugs.add((mid, lesson.get('slug')))

    group_targets = {}
    if isinstance(inventory, dict):
        seen_groups = set()
        for group in inventory.get("coverage_groups", []):
            gid=group.get("id")
            if gid in seen_groups:
                fail(f"duplicate coverage_group {gid}")
            seen_groups.add(gid)
            targets = set()
            for ref in group.get("target_modules", []):
                if ref not in module_ids:
                    fail(f"coverage group {gid} references unknown module {ref}")
                targets.add(ref)
            group_targets[gid] = targets
    else:
        fail("concepts.yaml must be a map")

    coverage_file = ROOT / "curriculum" / "coverage-map.csv"
    if not coverage_file.is_file():
        fail("missing curriculum/coverage-map.csv")
    else:
        with coverage_file.open("r", encoding="utf-8-sig", newline="") as f:
            mapped = list(csv.DictReader(f))
        required = {(g["id"], topic) for g in inventory.get("coverage_groups", []) for topic in g.get("topics", [])}
        found = set()
        manual_review = 0
        for row in mapped:
            gid = row.get("coverage_group")
            key = (gid, row.get("topic"))
            if key in found:
                fail(f"coverage-map.csv: duplicate topic {key}")
            found.add(key)
            primary = row.get("primary_lesson_id")
            if primary not in lessons:
                fail(f"coverage-map.csv: missing target lesson {primary}")
            elif gid in group_targets and lesson_module.get(primary) not in group_targets[gid]:
                fail(f"coverage-map.csv: {key}: primary lesson {primary} is in module "
                     f"{lesson_module.get(primary)}, outside target_modules {sorted(group_targets[gid])}")
            for sec in str(row.get("secondary_lesson_ids", "") or "").split(";"):
                sec = sec.strip()
                if not sec:
                    continue
                if sec not in lessons:
                    fail(f"coverage-map.csv: {key}: unknown secondary lesson {sec}")
            review = row.get("mapping_review")
            if review not in {"verified", "needs-manual-review"}:
                fail(f"coverage-map.csv: {key}: mapping_review must be 'verified' or "
                     f"'needs-manual-review', got {review!r}")
            elif review == "needs-manual-review":
                manual_review += 1
        for missing in sorted(required - found):
            fail(f"coverage-map.csv: missing inventory topic {missing}")
        for extra in sorted(found - required):
            fail(f"coverage-map.csv: unknown topic not in inventory {extra}")
        warnings.append(f"coverage-map.csv: {manual_review} topic(s) marked needs-manual-review "
                        f"(mapping is structural, not semantically auto-verifiable)")

    for p in sorted((ROOT / 'projects').glob('*.json')):
        obj = load_json(p)
        check_schema(obj, 'project.schema.json', str(p))
        if obj:
            ms = [m for m in obj.get('milestones', []) if isinstance(m, dict)]
            ids = [m['id'] for m in ms if 'id' in m]
            if len(ids) != len(set(ids)):
                fail(f"{p}: duplicate milestone ID")
            known = set(ids)
            cps = [m.get('checkpoint_id') for m in ms if m.get('checkpoint_id')]
            if len(cps) != len(set(cps)):
                fail(f"{p}: duplicate checkpoint_id")
            order = {mid: i for i, mid in enumerate(ids)}
            for m in ms:
                for dep in m.get('depends_on', []):
                    if dep not in known:
                        fail(f"{p}: milestone {m.get('id')} depends_on unknown milestone {dep}")
                    elif order.get(dep, 0) >= order.get(m.get('id'), 0):
                        fail(f"{p}: milestone {m.get('id')} depends_on non-earlier milestone {dep}")
                if not m.get('stage_kind'):
                    continue
                # Executable milestone (PRD-05): authored instructions + starter
                # must exist, mirroring the exercise content checks.
                mdir = p.parent / obj['id'] / 'milestones' / m['id']
                instructions = m.get('instructions_file')
                starters = m.get('starter_files', [])
                if not instructions or not starters:
                    fail(f"{p}: executable milestone {m['id']} needs instructions_file and starter_files")
                for fname in [instructions, *starters, *( [m['example_file']] if m.get('example_file') else [] )]:
                    target = safe_relative(mdir, fname) if fname else None
                    if target is None or not target.is_file():
                        fail(f"{p}: milestone {m['id']} missing or unsafe file {fname!r}")
                validator = m.get('validator', {})
                criteria_file = validator.get('criteria_file', '')
                f = safe_relative(mdir, criteria_file, allow_parent=True)
                if f is None or not f.is_file():
                    fail(f"{p}: milestone {m['id']} missing instructor criteria file {criteria_file!r}")
                criterion_ids = [c.get('id') for c in m.get('criteria', []) if isinstance(c, dict)]
                if len(criterion_ids) != len(set(criterion_ids)):
                    fail(f"{p}: milestone {m['id']} duplicate criterion IDs")

    paths = sorted(ROOT.rglob("lesson.fa.md"))
    checked = 0
    for path in paths:
        meta = parse_frontmatter(path)
        if meta is None:
            continue
        lid = meta.get("id")
        if args.lesson and lid != args.lesson:
            continue
        checked += 1
        check_schema(meta, "lesson.schema.json", str(path))
        if lid not in lessons:
            fail(f"{path}: lesson ID {lid} missing in curriculum")
        for ref in meta.get('prerequisites', []):
            if ref not in lessons:
                fail(f"{path}: unknown prerequisite {ref}")
        declared = set(meta.get("exercise_ids", []))
        observed = set()
        for manifest in sorted((path.parent / "exercises").rglob("exercise.json")):
            obj = load_json(manifest)
            check_schema(obj, "exercise.schema.json", str(manifest))
            if obj is None:
                continue
            eid = obj.get("id")
            observed.add(eid)
            if obj.get("lesson_id") != lid:
                fail(f"{manifest}: wrong lesson_id")
            edir = manifest.parent
            relative_files = [obj.get("instructions_file", ""), *obj.get("starter_files", [])]
            if obj.get("example_file"):
                relative_files.append(obj["example_file"])
            for fname in relative_files:
                target = safe_relative(edir, fname)
                if target is None or not target.is_file():
                    fail(f"{manifest}: unsafe or missing file {fname}")
            validator=obj.get('validator',{})
            criteria_file=validator.get('criteria_file','')
            f=safe_relative(edir, criteria_file, allow_parent=True)
            if f is None or not f.is_file():
                fail(f"{manifest}: missing instructor criteria specification {criteria_file}")
            criteria=[x.get('id') for x in obj.get('criteria',[]) if isinstance(x,dict)]
            if len(criteria)!=len(set(criteria)):
                fail(f"{manifest}: duplicate criterion IDs")
        if declared != observed:
            fail(f"{path}: exercise manifest mismatch: expected {sorted(declared)}, found {sorted(observed)}")

    if args.lesson and args.lesson not in lessons:
        fail(f"--lesson: {args.lesson} not in curriculum")
    if args.lesson and checked == 0 and args.lesson in lessons:
        fail(f"--lesson: {args.lesson} is planned, but no authored lesson.fa.md exists in this package")

    for w in warnings: print('WARN:',w)
    if errors:
        for e in errors: print('ERROR:',e, file=sys.stderr)
        print(f"Validation failed: {len(errors)} issue(s).",file=sys.stderr)
        sys.exit(1)
    print(f"STATIC VALIDATION PASSED: {len(module_ids)} modules, {len(lessons)} planned lessons; {checked} authored lesson(s) checked" + (' (filtered)' if args.lesson else ''))
    print('NOTE: this does NOT test pedagogical quality or execute Django/MySQL exercise validators.')

if __name__ == "__main__":
    main()
