#!/usr/bin/env python3
"""Generate the Academy web content bundle from the curriculum source files.

The web app (PRD-01) must not parse YAML or reach outside its own build
context at runtime. This bridge reads the authoritative sources under
``academy-planning/`` and emits a single JSON file consumed by the Next.js
Academy routes.

Sources:
  curriculum/curriculum.yaml          -> course outline (modules + lessons)
  content-samples/**/lesson.fa.md     -> authored lesson bodies + frontmatter
  content-samples/**/exercises/*.json -> public exercise metadata for the lab

Output:
  ../web/lib/academy-content.json

Fails loudly (non-zero exit) on duplicate lesson IDs, duplicate module IDs, or
an authored lesson whose ID is missing from the curriculum, so broken content
cannot be silently published.

Only exercises whose lesson is authored *and* approved are embedded as lab
capability; instructor-only validators never leave the academy-runner.

Usage:
  python academy-planning/scripts/generate_web_content.py
Requires: PyYAML.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    raise SystemExit("Install authoring dev deps: pip install PyYAML")

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "curriculum" / "curriculum.yaml"
CONTENT_SAMPLES = ROOT / "content-samples"
OUT = ROOT.parent / "web" / "lib" / "academy-content.json"

FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)

errors: list[str] = []


def fail(reason: str) -> None:
    errors.append(reason)


def load_authored_lessons(known_ids: set[str]) -> dict:
    authored: dict[str, dict] = {}
    for path in sorted(CONTENT_SAMPLES.rglob("lesson.fa.md")):
        source = path.read_text(encoding="utf-8")
        match = FRONTMATTER.match(source)
        if not match:
            fail(f"{path}: missing YAML frontmatter")
            continue
        try:
            meta = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError as exc:
            fail(f"{path}: invalid frontmatter: {exc}")
            continue
        lid = meta.get("id")
        if not lid:
            fail(f"{path}: frontmatter has no id")
            continue
        if lid not in known_ids:
            fail(f"{path}: lesson id {lid} is not declared in curriculum.yaml")
            continue
        if lid in authored:
            fail(f"{path}: duplicate authored lesson id {lid}")
            continue
        body = source[match.end():]
        authored[lid] = {
            "id": lid,
            "slug": meta.get("slug", ""),
            "title_fa": meta.get("title_fa", ""),
            "status": meta.get("status", "draft"),
            "objectives": meta.get("objectives", []),
            "references": meta.get("references", []),
            "estimated_minutes": meta.get("estimated_minutes"),
            "markdown": body,
        }
    return authored


LEVEL_ORDER = {"practice": 0, "problem-solving": 1, "mastery": 2}


def _first_heading(markdown: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return ""


def load_lab_exercises(authored: dict) -> dict[str, list]:
    """Embed public metadata for exercises of approved, authored lessons.

    The lab UI renders instructions/starter/criteria offline; only execution
    (execute/check/reset) is delegated to the academy-runner. Validator
    reference files are never included here.
    """
    labs: dict[str, list] = {}
    for manifest in sorted(CONTENT_SAMPLES.rglob("exercises/*/exercise.json")):
        try:
            obj = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            fail(f"{manifest}: cannot read exercise manifest: {exc}")
            continue
        lid = obj.get("lesson_id")
        lesson = authored.get(lid)
        if lesson is None or lesson.get("status") != "approved":
            continue
        edir = manifest.parent
        try:
            instructions = (edir / obj["instructions_file"]).read_text(encoding="utf-8")
        except (OSError, KeyError) as exc:
            fail(f"{manifest}: cannot read instructions: {exc}")
            continue
        starters = []
        for fname in obj.get("starter_files", []):
            try:
                content = (edir / fname).read_text(encoding="utf-8")
            except OSError as exc:
                fail(f"{manifest}: cannot read starter {fname}: {exc}")
                continue
            starters.append({
                "name": fname,
                "language": "sql" if fname.endswith(".sql") else "python",
                "content": content,
            })
        labs.setdefault(lid, []).append({
            "id": obj.get("id"),
            "lesson_id": lid,
            "level": obj.get("level"),
            "kind": obj.get("kind"),
            "title_fa": _first_heading(instructions),
            "instructions_markdown": instructions,
            "starter": starters,
            "criteria": [c for c in obj.get("criteria", []) if c.get("visibility") == "public"],
            "hints": obj.get("hints", []),
            "time_limit_seconds": obj.get("time_limit_seconds"),
        })

    for exercises in labs.values():
        exercises.sort(key=lambda e: (LEVEL_ORDER.get(e["level"], 99), e["id"]))
    return labs


def main() -> int:
    try:
        cur = yaml.safe_load(CURRICULUM.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise SystemExit(f"Cannot load curriculum: {exc}")

    modules_out = []
    known_ids: set[str] = set()
    seen_modules: set[str] = set()
    for module in cur.get("modules", []):
        mid = module.get("id")
        if not mid:
            fail("module without id")
            continue
        if mid in seen_modules:
            fail(f"duplicate module id {mid}")
            continue
        seen_modules.add(mid)
        lessons_out = []
        for lesson in module.get("lessons", []):
            lid = lesson.get("id")
            if not lid:
                fail(f"module {mid}: lesson without id")
                continue
            if lid in known_ids:
                fail(f"duplicate lesson id {lid}")
                continue
            known_ids.add(lid)
            lessons_out.append({
                "id": lid,
                "slug": lesson.get("slug", ""),
                "title_fa": lesson.get("title_fa", ""),
                "outcome_fa": lesson.get("outcome_fa", ""),
                "status": lesson.get("status", "planned"),
                "parity": lesson.get("parity"),
                "tracks": lesson.get("tracks", []),
            })
        modules_out.append({
            "id": mid,
            "slug": module.get("slug", ""),
            "title_fa": module.get("title_fa", ""),
            "status": module.get("status", "planned"),
            "focus": module.get("focus"),
            "lessons": lessons_out,
        })

    authored = load_authored_lessons(known_ids)
    lab_lessons = load_lab_exercises(authored)

    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        print(f"Content generation failed: {len(errors)} issue(s).", file=sys.stderr)
        return 1

    bundle = {
        "source": "academy-planning/curriculum/curriculum.yaml",
        "course": {
            "id": cur.get("course_id"),
            "title_en": "Database & ORM Academy",
            "title_fa": "آکادمی پایگاه داده و ORM",
            "locale": cur.get("locale"),
            "ui_locale": cur.get("ui_locale"),
            "content_version": cur.get("content_version"),
            "framework_targets": cur.get("framework_targets", {}),
            "access_policy": cur.get("access_policy"),
        },
        "modules": modules_out,
        "authored_lessons": authored,
        "lab_lessons": lab_lessons,
        "totals": {
            "modules": len(modules_out),
            "lessons": len(known_ids),
            "authored": len(authored),
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT.parent)}: "
          f"{len(modules_out)} modules, {len(known_ids)} lessons, {len(authored)} authored.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
