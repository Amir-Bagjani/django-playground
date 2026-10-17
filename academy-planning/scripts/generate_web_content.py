#!/usr/bin/env python3
"""Generate the Academy web content bundle from the curriculum source files.

The web app (PRD-01) must not parse YAML or reach outside its own build
context at runtime. This bridge reads the authoritative sources under
``academy-planning/`` and emits a single JSON file consumed by the Next.js
Academy routes.

Sources:
  curriculum/curriculum.yaml          -> course outline (modules + lessons)
  content-samples/**/lesson.fa.md     -> authored lesson bodies + frontmatter

Output:
  ../web/lib/academy-content.json

Fails loudly (non-zero exit) on duplicate lesson IDs, duplicate module IDs, or
an authored lesson whose ID is missing from the curriculum, so broken content
cannot be silently published.

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
