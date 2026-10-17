"""ERD (entity-relationship diagram) evaluation for learner-authored designs.

The canonical artefact is a **graph document**, not an image: a JSON object with
stable entity/attribute/relationship ids. Validation normalizes that graph into
a semantic view and checks *meaning* (entities, attributes, keys, foreign keys,
cardinality, referential integrity, business constraints). Node coordinates are
presentation state only and never affect the result.

Design goals (PRD-04):
* several *different* but engineering-equivalent diagrams must pass — names,
  singular/plural, casing, type spelling, drawing direction and extra
  entities/attributes are tolerated;
* problems a learner can fix (missing entity/column/PK/FK, wrong cardinality,
  dangling references) are reported as **criterion failures** with a Persian
  message, not as crashes;
* malformed input (not an object, wrong ``schema_version``, duplicate
  identifiers) is a distinct learner ``error``/``invalid_graph`` — never a
  system error and never silently a fail;
* anything that cannot be decided by rules is surfaced as ``needs_manual_review``
  rather than guessed. No claim of full "database architecture" grading is made.

Reference designs live here in code, are keyed by exercise id, and never leave
this process.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import checks
from .exercises import Spec, get_public

# --- small normalizers ------------------------------------------------------


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def _singular(word: str) -> str:
    return word[:-1] if len(word) > 1 and word.endswith("s") else word


def _name_forms(name: str) -> set[str]:
    base = _norm(name)
    return {base, _singular(base)}


_TYPE_FAMILIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("integer", ("int", "integer", "bigint", "smallint", "tinyint", "serial")),
    ("text", ("char", "varchar", "text", "string", "uuid", "email")),
    ("numeric", ("decimal", "numeric", "number", "float", "double", "real", "money")),
    ("boolean", ("bool", "boolean")),
    ("temporal", ("date", "datetime", "timestamp", "time")),
)


def _type_family(raw: str) -> str:
    lowered = str(raw or "").strip().lower()
    for family, tokens in _TYPE_FAMILIES:
        if any(token in lowered for token in tokens):
            return family
    return "other"


# --- task definitions (instructor-only) ------------------------------------


@dataclass(frozen=True)
class AttributeReq:
    key: str
    aliases: tuple[str, ...] = ()
    type_family: str | None = None
    nullable: bool | None = None
    unique: bool | None = None


@dataclass(frozen=True)
class EntityReq:
    key: str
    aliases: tuple[str, ...] = ()
    attributes: tuple[AttributeReq, ...] = ()
    primary_key: str | None = None  # attribute key expected to be the PK
    label_fa: str = ""


@dataclass(frozen=True)
class RelationshipReq:
    one_side: str  # entity key on the "one" side
    many_side: str  # entity key on the "many" side
    foreign_key_entity: str  # entity key that owns the FK attribute
    foreign_key_attribute: str  # attribute key of the FK on the many side
    optionality: str = "mandatory"  # mandatory | optional
    label_fa: str = ""


@dataclass(frozen=True)
class ErdTask:
    entities: tuple[EntityReq, ...] = field(default_factory=tuple)
    relationships: tuple[RelationshipReq, ...] = field(default_factory=tuple)


TASKS: dict[str, ErdTask] = {
    "erd-customer-order": ErdTask(
        entities=(
            EntityReq(
                key="customers",
                aliases=("customer", "clients", "client"),
                label_fa="مشتری",
                primary_key="id",
                attributes=(
                    AttributeReq("id", aliases=("identifier",), nullable=False),
                    AttributeReq(
                        "email", aliases=("mail", "email_address"), type_family="text", nullable=False, unique=True
                    ),
                    AttributeReq(
                        "full_name",
                        aliases=("name", "customer_name", "fullname", "title"),
                        type_family="text",
                        nullable=False,
                    ),
                ),
            ),
            EntityReq(
                key="orders",
                aliases=("order", "purchases", "purchase"),
                label_fa="سفارش",
                primary_key="id",
                attributes=(
                    AttributeReq("id", aliases=("identifier",), nullable=False),
                    AttributeReq(
                        "total",
                        aliases=("amount", "total_price", "total_amount", "sum"),
                        type_family="numeric",
                        nullable=False,
                    ),
                    AttributeReq(
                        "customer_id",
                        aliases=("customer", "customerid", "customer_ref", "client_id"),
                        nullable=False,
                    ),
                ),
            ),
        ),
        relationships=(
            RelationshipReq(
                one_side="customers",
                many_side="orders",
                foreign_key_entity="orders",
                foreign_key_attribute="customer_id",
                optionality="mandatory",
                label_fa="هر مشتری چند سفارش؛ هر سفارش دقیقاً یک مشتری",
            ),
        ),
    ),
    # First progressive-project milestone (PRD-05, Booking project). The learner
    # designs the room/booking model before writing any SQL or ORM code.
    "booking-erd": ErdTask(
        entities=(
            EntityReq(
                key="rooms",
                aliases=("room", "suites", "suite"),
                label_fa="اتاق",
                primary_key="id",
                attributes=(
                    AttributeReq("id", aliases=("identifier",), nullable=False),
                    AttributeReq(
                        "room_number",
                        aliases=("number", "room_no", "code", "name"),
                        type_family="text",
                        nullable=False,
                    ),
                    AttributeReq(
                        "capacity",
                        aliases=("beds", "size", "seats"),
                        type_family="integer",
                        nullable=False,
                    ),
                ),
            ),
            EntityReq(
                key="bookings",
                aliases=("booking", "reservations", "reservation"),
                label_fa="رزرو",
                primary_key="id",
                attributes=(
                    AttributeReq("id", aliases=("identifier",), nullable=False),
                    AttributeReq(
                        "room_id",
                        aliases=("room", "room_ref", "roomid", "room_number"),
                        nullable=False,
                    ),
                    AttributeReq(
                        "guest_name",
                        aliases=("guest", "name", "customer_name", "guest_full_name"),
                        type_family="text",
                        nullable=False,
                    ),
                    AttributeReq(
                        "check_in",
                        aliases=("start_date", "from_date", "arrival", "checkin"),
                        type_family="temporal",
                        nullable=False,
                    ),
                    AttributeReq(
                        "check_out",
                        aliases=("end_date", "to_date", "departure", "checkout"),
                        type_family="temporal",
                        nullable=False,
                    ),
                ),
            ),
        ),
        relationships=(
            RelationshipReq(
                one_side="rooms",
                many_side="bookings",
                foreign_key_entity="bookings",
                foreign_key_attribute="room_id",
                optionality="mandatory",
                label_fa="هر اتاق چند رزرو؛ هر رزرو دقیقاً یک اتاق",
            ),
        ),
    ),
}


# --- structural parsing -----------------------------------------------------


@dataclass(frozen=True)
class _Doc:
    entities: list[dict]
    relationships: list[dict]
    notes: str


class GraphError(ValueError):
    """Malformed graph input (learner-fixable → status ``error``)."""


def _as_list(value: Any, where: str) -> list:
    if not isinstance(value, list):
        raise GraphError(f"«{where}» باید یک لیست باشد.")
    return value


def parse(graph: dict) -> _Doc:
    if not isinstance(graph, dict):
        raise GraphError("مدرک ERD باید یک شیء JSON باشد.")
    version = graph.get("schema_version")
    if version != 1:
        raise GraphError("فقط schema_version برابر ۱ پشتیبانی می‌شود.")

    entities = _as_list(graph.get("entities", []), "entities")
    relationships = _as_list(graph.get("relationships", []), "relationships")

    seen_entity_ids: set[str] = set()
    seen_entity_names: set[str] = set()
    for index, entity in enumerate(entities):
        if not isinstance(entity, dict):
            raise GraphError(f"entities[{index}] باید یک شیء باشد.")
        eid = entity.get("id")
        if not isinstance(eid, str) or not eid.strip():
            raise GraphError(f"entities[{index}] باید id غیرخالی داشته باشد.")
        if eid in seen_entity_ids:
            raise GraphError(f"شناسه‌ی جدول تکراری است: {eid!r}.")
        seen_entity_ids.add(eid)
        name = _norm(entity.get("name", ""))
        if not name:
            raise GraphError(f"جدول {eid!r} باید نام داشته باشد.")
        if name in seen_entity_names:
            raise GraphError(f"نام جدول تکراری است: {entity.get('name')!r}.")
        seen_entity_names.add(name)
        attributes = _as_list(entity.get("attributes", []), f"attributes of {name}")
        seen_attr_ids: set[str] = set()
        seen_attr_names: set[str] = set()
        for a_index, attribute in enumerate(attributes):
            if not isinstance(attribute, dict):
                raise GraphError(f"ستون‌های {name}: عنصر {a_index} باید شیء باشد.")
            aid = attribute.get("id")
            if not isinstance(aid, str) or not aid.strip():
                raise GraphError(f"ستون‌های {name}: هر ستون باید id غیرخالی داشته باشد.")
            if aid in seen_attr_ids:
                raise GraphError(f"شناسه‌ی ستون تکراری در {name}: {aid!r}.")
            seen_attr_ids.add(aid)
            aname = _norm(attribute.get("name", ""))
            if not aname:
                raise GraphError(f"ستون‌های {name}: هر ستون باید نام داشته باشد.")
            if aname in seen_attr_names:
                raise GraphError(f"نام ستون تکراری در {name}: {attribute.get('name')!r}.")
            seen_attr_names.add(aname)

    seen_rel_ids: set[str] = set()
    for index, relationship in enumerate(relationships):
        if not isinstance(relationship, dict):
            raise GraphError(f"relationships[{index}] باید یک شیء باشد.")
        rid = relationship.get("id")
        if not isinstance(rid, str) or not rid.strip():
            raise GraphError(f"relationships[{index}] باید id غیرخالی داشته باشد.")
        if rid in seen_rel_ids:
            raise GraphError(f"شناسه‌ی رابطه تکراری است: {rid!r}.")
        seen_rel_ids.add(rid)

    return _Doc(entities=entities, relationships=relationships, notes=str(graph.get("notes") or ""))


# --- semantic matching ------------------------------------------------------


def _match_entity(entities: list[dict], req: EntityReq) -> dict | None:
    wanted = {_norm(req.key), *(_norm(a) for a in req.aliases)}
    wanted |= {_singular(w) for w in list(wanted)}
    for entity in entities:
        if _name_forms(entity.get("name", "")) & wanted:
            return entity
    return None


def _match_attribute(entity: dict | None, req: AttributeReq) -> dict | None:
    if entity is None:
        return None
    wanted = {_norm(req.key), *(_norm(a) for a in req.aliases)}
    wanted |= {_singular(w) for w in list(wanted)}
    for attribute in entity.get("attributes", []):
        if _name_forms(attribute.get("name", "")) & wanted:
            return attribute
    return None


def _flags(attribute: dict) -> dict[str, bool]:
    return {
        "nullable": bool(attribute.get("nullable", True)),
        "primaryKey": bool(attribute.get("primaryKey", False)),
        "unique": bool(attribute.get("unique", False)),
    }


def _fk_target_entity(entities: list[dict], relationship: dict) -> dict | None:
    """The entity that owns the FK attribute (the 'many' side of the drawing)."""
    fk_id = relationship.get("foreignKeyAttributeId")
    if not isinstance(fk_id, str) or not fk_id:
        return None
    for entity in entities:
        for attribute in entity.get("attributes", []):
            if attribute.get("id") == fk_id:
                return entity
    return None


def _relationships_between(
    doc: _Doc, first: dict, second: dict
) -> list[dict]:
    first_id, second_id = first.get("id"), second.get("id")
    found = []
    for relationship in doc.relationships:
        ends = {relationship.get("fromEntityId"), relationship.get("toEntityId")}
        if ends == {first_id, second_id}:
            found.append(relationship)
    return found


# --- criteria ---------------------------------------------------------------


def _entities_outcomes(task: ErdTask, doc: _Doc) -> tuple[dict, dict[str, dict]]:
    matched: dict[str, dict | None] = {req.key: _match_entity(doc.entities, req) for req in task.entities}
    missing = [req.key for req in task.entities if matched[req.key] is None]
    if missing:
        message = "این جدول‌ها در طراحی نیستند: " + "، ".join(f"`{key}`" for key in missing) + "."
    else:
        message = "همه‌ی جدول‌های لازم طراحی شده‌اند."
    return {"status": checks.PASSED if not missing else checks.FAILED, "messageFa": message}, matched


def _attributes_outcomes(task: ErdTask, matched: dict[str, dict | None]) -> dict:
    problems: list[str] = []
    for req in task.entities:
        entity = matched.get(req.key)
        for attribute_req in req.attributes:
            attribute = _match_attribute(entity, attribute_req)
            if attribute is None:
                problems.append(f"`{req.key}.{attribute_req.key}`")
                continue
            flags = _flags(attribute)
            if attribute_req.nullable is not None and flags["nullable"] != attribute_req.nullable:
                expected = "بدون NULL" if attribute_req.nullable is False else "با NULL"
                problems.append(f"`{req.key}.{attribute_req.key}` باید {expected} باشد")
            if attribute_req.type_family is not None and _type_family(attribute.get("type", "")) != attribute_req.type_family:
                problems.append(f"نوع `{req.key}.{attribute_req.key}` نامناسب است")
    if problems:
        message = "ستون‌های زیر ناقص یا نامناسب‌اند: " + "، ".join(problems) + "."
    else:
        message = "ستون‌های لازم با نوع و NULL درست وجود دارند."
    return {"status": checks.PASSED if not problems else checks.FAILED, "messageFa": message}


def _primary_keys_outcome(task: ErdTask, matched: dict[str, dict | None]) -> dict:
    problems: list[str] = []
    for req in task.entities:
        entity = matched.get(req.key)
        if entity is None:
            problems.append(f"`{req.key}` (جدول وجود ندارد)")
            continue
        primary = [a for a in entity.get("attributes", []) if _flags(a)["primaryKey"]]
        if len(primary) != 1:
            problems.append(f"`{req.key}` باید دقیقاً یک کلید اصلی داشته باشد (اکنون {len(primary)})")
            continue
        if req.primary_key:
            wanted = {_norm(req.primary_key)}
            if not (_name_forms(primary[0].get("name", "")) & wanted):
                problems.append(f"کلید اصلی `{req.key}` باید ستون `{req.primary_key}` باشد")
    if problems:
        message = "کلیدهای اصلی مشکل دارند: " + "، ".join(problems) + "."
    else:
        message = "هر جدول دقیقاً یک کلید اصلی درست دارد."
    return {"status": checks.PASSED if not problems else checks.FAILED, "messageFa": message}


def _relationship_outcomes(
    task: ErdTask, doc: _Doc, matched: dict[str, dict | None]
) -> dict[str, dict]:
    cardinality_problems: list[str] = []
    fk_problems: list[str] = []
    dangling: list[str] = []

    for relationship in doc.relationships:
        from_id = relationship.get("fromEntityId")
        to_id = relationship.get("toEntityId")
        known = {entity.get("id") for entity in doc.entities}
        if from_id not in known or to_id not in known:
            dangling.append(f"رابطه‌ی {relationship.get('id')!r} به جدولی اشاره می‌کند که وجود ندارد")
            continue
        fk_id = relationship.get("foreignKeyAttributeId")
        if fk_id is not None:
            owner = _fk_target_entity(doc.entities, relationship)
            if owner is None:
                dangling.append(f"ستون کلید خارجی رابطه‌ی {relationship.get('id')!r} وجود ندارد")

    for req in task.relationships:
        one = matched.get(req.one_side)
        many = matched.get(req.many_side)
        label = req.label_fa or f"{req.one_side} → {req.many_side}"
        if one is None or many is None:
            cardinality_problems.append(f"رابطه‌ی «{label}» کامل نیست چون یکی از جدول‌ها وجود ندارد")
            continue
        candidates = _relationships_between(doc, one, many)
        if not candidates:
            cardinality_problems.append(f"رابطه‌ی «{label}» تعریف نشده است")
            fk_problems.append(f"کلید خارجی برای «{label}» تعریف نشده است")
            continue

        ok_cardinality = False
        ok_fk = False
        for relationship in candidates:
            from_id, to_id = relationship.get("fromEntityId"), relationship.get("toEntityId")
            from_card = relationship.get("fromCardinality")
            to_card = relationship.get("toCardinality")
            # The "many" end must be the declared many-side entity.
            many_is_many = (
                (from_id == many.get("id") and from_card == "many" and to_id == one.get("id") and to_card == "one")
                or (to_id == many.get("id") and to_card == "many" and from_id == one.get("id") and from_card == "one")
            )
            optionality = relationship.get("optionality")
            if many_is_many and optionality == req.optionality:
                ok_cardinality = True
            owner = _fk_target_entity(doc.entities, relationship)
            fk_attribute = _match_attribute(many, AttributeReq(req.foreign_key_attribute))
            if (
                owner is not None
                and owner.get("id") == many.get("id")
                and (fk_attribute is None or fk_attribute.get("id") == (relationship.get("foreignKeyAttributeId") or fk_attribute.get("id")))
            ):
                ok_fk = True
        if not ok_cardinality:
            cardinality_problems.append(
                f"کارتینالیتی/اختیاری‌بودن رابطه‌ی «{label}» درست نیست (باید یک‌به‌چند و سمت سفارش اجباری باشد)"
            )
        if not ok_fk:
            fk_problems.append(
                f"کلید خارجی «{label}» باید ستون `{req.foreign_key_attribute}` در جدول `{req.foreign_key_entity}` باشد"
            )

    return {
        "relationship-cardinality": {
            "status": checks.PASSED if not cardinality_problems else checks.FAILED,
            "messageFa": "؛ ".join(cardinality_problems) if cardinality_problems
            else "کارتینالیتی و اختیاری‌بودن رابطه درست است.",
        },
        "foreign-key": {
            "status": checks.PASSED if not fk_problems else checks.FAILED,
            "messageFa": "؛ ".join(fk_problems) if fk_problems else "کلید خارجی در سمت درست تعریف شده است.",
        },
        "referential-integrity": {
            "status": checks.PASSED if not dangling else checks.FAILED,
            "messageFa": "؛ ".join(dangling) if dangling
            else "هیچ ارجاع شکسته/آویزانی وجود ندارد و کلیدهای خارجی به ستون موجود اشاره می‌کنند.",
        },
    }


def _unique_outcome(task: ErdTask, matched: dict[str, dict | None]) -> dict:
    problems: list[str] = []
    for req in task.entities:
        entity = matched.get(req.key)
        for attribute_req in req.attributes:
            if attribute_req.unique is None:
                continue
            attribute = _match_attribute(entity, attribute_req)
            if attribute is None:
                problems.append(f"`{req.key}.{attribute_req.key}` تعریف نشده است")
                continue
            flags = _flags(attribute)
            if flags["unique"] != attribute_req.unique:
                problems.append(f"`{req.key}.{attribute_req.key}` باید UNIQUE باشد")
            if attribute_req.nullable is False and flags["nullable"]:
                problems.append(f"`{req.key}.{attribute_req.key}` نباید NULL بپذیرد")
    if problems:
        message = "قیدهای یکتایی مشکل دارند: " + "، ".join(problems) + "."
    else:
        message = "قیدهای یکتایی لازم رعایت شده‌اند."
    return {"status": checks.PASSED if not problems else checks.FAILED, "messageFa": message}


_HEADER_RESULT = {"columns": [], "rows": [], "rowCount": 0, "truncated": False, "durationMs": 0}


def build_payload(
    spec: Spec,
    graph: Any,
    *,
    task_id: str | None = None,
    criteria: list[dict] | None = None,
    hint_available: bool | None = None,
) -> dict[str, Any]:
    """Evaluate one ERD submission against the coded task for this exercise.

    ``task_id``/``criteria``/``hint_available`` let a project milestone reuse the
    ERD engine with its own authored task and criteria instead of the exercise
    registry.
    """
    task = TASKS.get(task_id or spec.id)
    if task is None:
        return checks.system_error_payload(
            spec,
            "این تمرین ERD هنوز تعریف نشده است.",
            criteria=criteria,
            hint_available=hint_available,
        )

    try:
        doc = parse(graph)
    except GraphError as exc:
        return checks.invalid_input_payload(
            spec, str(exc), criteria=criteria, hint_available=hint_available
        )

    entities_outcome, matched = _entities_outcomes(task, doc)
    outcomes = {
        "required-entities": entities_outcome,
        "required-attributes": _attributes_outcomes(task, matched),
        "primary-keys": _primary_keys_outcome(task, matched),
        "unique-constraint": _unique_outcome(task, matched),
    }
    outcomes.update(_relationship_outcomes(task, doc, matched))

    checks_list = checks.assemble_checks(
        spec, outcomes, criteria=criteria, hint_available=hint_available
    )
    auto = [check for check in checks_list if check["status"] != checks.MANUAL]
    passed = bool(auto) and all(check["status"] == checks.PASSED for check in auto)

    if hint_available is None:
        hint_available = bool((get_public(spec.id) or {}).get("hint_count", 0))

    payload: dict[str, Any] = {
        "exerciseId": spec.id,
        "assessmentVersion": spec.validator_version,
        "result": dict(_HEADER_RESULT),
        "status": "passed" if passed else "failed",
        "outcome": "success" if passed else "validation_failed",
        "passed": passed,
        "checks": checks_list,
        "canRequestNextHint": bool(hint_available) and not passed,
        "error": None,
        "traceback": None,
    }
    return payload
