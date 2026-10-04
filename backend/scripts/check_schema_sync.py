#!/usr/bin/env python
"""Verificación de esquema: ¿el MySQL local es igual a Cloud SQL (GCP)?

Compara la ESTRUCTURA (no los datos) de los schemas de la app entre el MySQL
local (DB_HOST en backend/.env) y la instancia de Cloud SQL (INSTANCE_DB, vía
connector de GCP con service_account.json). Compara: schemas (charset/
collation), tablas (engine/collation), columnas (tipo, NULL, default, extra,
charset, collation, generated), índices (unicidad, columnas, orden, sub_part,
visibilidad), foreign keys (columnas, tabla referida, reglas ON UPDATE/DELETE),
vistas (definición) y triggers (evento + statement).

Se ignoran a propósito los valores de datos: AUTO_INCREMENT, comentarios de
columna (metadata) y definers (user@host) de vistas/triggers.

Las diferencias COSMÉTICAS se separan de las funcionales: orden físico de
columnas (el backend lee por nombre, nunca por posición) y FKs con la misma
definición pero distinto nombre de constraint. Solo-cosméticas = exit 0.

Uso:
    cd backend && .venv/bin/python scripts/check_schema_sync.py           # reporte legible
    cd backend && .venv/bin/python scripts/check_schema_sync.py --json    # diff como JSON (CI)
    cd backend && .venv/bin/python scripts/check_schema_sync.py --strict  # cosméticas también fallan
    cd backend && .venv/bin/python scripts/check_schema_sync.py -o diff.md

Exit codes: 0 = idénticos (o solo diferencias cosméticas) · 1 = diferencias
funcionales (o cosméticas con --strict) · 2 = error de conexión/config.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import pymysql
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

SCHEMA_ENV_VARS = (
    "SCHEMA_ACCOUNTS",
    "SCHEMA_INVENTORY",
    "SCHEMA_MERCADOLIBRE",
    "SCHEMA_TIENDANUBE",
    "SCHEMA_AI",
)


def die(message: str, code: int = 2) -> None:
    print(f"✗ {message}", file=sys.stderr)
    sys.exit(code)


def env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        die(f"Falta {name} en backend/.env")
    return value


SCHEMAS = [env(name) for name in SCHEMA_ENV_VARS]


# ─────────────────────────────────────────────────────────────────────────────
# Conexiones (mismas fuentes que el backend: .env + connector de Cloud SQL)
# ─────────────────────────────────────────────────────────────────────────────

def open_local() -> pymysql.connections.Connection:
    host = os.getenv("DB_HOST", "").strip()
    if not host:
        die("DB_HOST está vacío en backend/.env (modo Cloud SQL): no hay MySQL local con qué comparar")
    return pymysql.connect(
        host=host,
        port=int(os.getenv("DB_PORT", "3306")),
        user=env("USER_DB"),
        password=env("PASSWORD_DB"),
        database="information_schema",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def open_cloud():
    creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    local_key = BACKEND_DIR / "service_account.json"
    if not creds and local_key.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(local_key)

    from google.cloud.sql.connector import Connector

    connector = Connector()
    conn = connector.connect(
        env("INSTANCE_DB"),
        "pymysql",
        user=env("USER_DB"),
        password=env("PASSWORD_DB"),
        db="information_schema",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    return conn, connector


# ─────────────────────────────────────────────────────────────────────────────
# Normalización (representaciones equivalentes entre servidores)
# ─────────────────────────────────────────────────────────────────────────────

def norm_default(value):
    """COLUMN_DEFAULT: NULL == None, CURRENT_TIMESTAMP() == CURRENT_TIMESTAMP."""
    if value is None:
        return None
    text = value.strip().replace("`", "")
    if text.upper() == "NULL":
        return None
    low = text.lower()
    if low == "current_timestamp()":
        return "CURRENT_TIMESTAMP"
    if low.startswith("current_timestamp(") and low.endswith(")"):
        return "CURRENT_TIMESTAMP(" + low[len("current_timestamp("):-1] + ")"
    return text


def norm_extra(value):
    return (value or "").strip().lower()


def norm_sql(value):
    """Texto de definición (views/triggers/generated): solo quita espacios."""
    return None if value is None else value.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Extracción de esquema desde information_schema
# ─────────────────────────────────────────────────────────────────────────────

def _placeholders():
    return ",".join(["%s"] * len(SCHEMAS))


def dump_schema(cursor) -> dict:
    ph = _placeholders()
    dump = {}

    cursor.execute(
        "SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME "
        "FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (" + ph + ")",
        SCHEMAS,
    )
    dump["schemata"] = {
        row["SCHEMA_NAME"]: {
            "charset": row["DEFAULT_CHARACTER_SET_NAME"],
            "collation": row["DEFAULT_COLLATION_NAME"],
        }
        for row in cursor.fetchall()
    }

    cursor.execute(
        "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COLLATION "
        "FROM information_schema.TABLES WHERE TABLE_SCHEMA IN (" + ph + ")",
        SCHEMAS,
    )
    dump["tables"] = {
        (row["TABLE_SCHEMA"], row["TABLE_NAME"]): {
            "type": row["TABLE_TYPE"],
            "engine": row["ENGINE"],
            "collation": row["TABLE_COLLATION"],
        }
        for row in cursor.fetchall()
    }

    cursor.execute(
        "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, "
        "IS_NULLABLE, COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME, "
        "GENERATION_EXPRESSION "
        "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA IN (" + ph + ") "
        "ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION",
        SCHEMAS,
    )
    columns = {}
    for row in cursor.fetchall():
        columns[(row["TABLE_SCHEMA"], row["TABLE_NAME"], row["COLUMN_NAME"])] = {
            "pos": row["ORDINAL_POSITION"],
            "type": row["COLUMN_TYPE"],
            "nullable": row["IS_NULLABLE"],
            "default": norm_default(row["COLUMN_DEFAULT"]),
            "extra": norm_extra(row["EXTRA"]),
            "charset": row["CHARACTER_SET_NAME"],
            "collation": row["COLLATION_NAME"],
            "generated": norm_sql(row["GENERATION_EXPRESSION"]),
        }
    dump["columns"] = columns

    cursor.execute(
        "SELECT TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, "
        "COLUMN_NAME, SUB_PART, COLLATION AS SORT_ORDER, INDEX_TYPE, IS_VISIBLE, EXPRESSION "
        "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA IN (" + ph + ") "
        "ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
        SCHEMAS,
    )
    indexes = {}
    for row in cursor.fetchall():
        key = (row["TABLE_SCHEMA"], row["TABLE_NAME"], row["INDEX_NAME"])
        index = indexes.setdefault(key, {
            "unique": row["NON_UNIQUE"] == 0,
            "type": row["INDEX_TYPE"],
            "visible": row["IS_VISIBLE"],
            "parts": [],
        })
        column = row["COLUMN_NAME"]
        if column is None and row["EXPRESSION"]:
            column = "EXPR:" + norm_sql(row["EXPRESSION"])
        index["parts"].append({
            "seq": row["SEQ_IN_INDEX"],
            "column": column,
            "sub_part": row["SUB_PART"],
            "order": row["SORT_ORDER"],
        })
    dump["indexes"] = indexes

    cursor.execute(
        "SELECT kcu.CONSTRAINT_SCHEMA, kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, "
        "kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_SCHEMA, kcu.REFERENCED_TABLE_NAME, "
        "kcu.REFERENCED_COLUMN_NAME, kcu.ORDINAL_POSITION, rc.UPDATE_RULE, rc.DELETE_RULE "
        "FROM information_schema.KEY_COLUMN_USAGE kcu "
        "JOIN information_schema.REFERENTIAL_CONSTRAINTS rc "
        "  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA "
        " AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME "
        " AND rc.TABLE_NAME = kcu.TABLE_NAME "
        "WHERE kcu.CONSTRAINT_SCHEMA IN (" + ph + ") AND kcu.REFERENCED_TABLE_NAME IS NOT NULL "
        "ORDER BY kcu.CONSTRAINT_SCHEMA, kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION",
        SCHEMAS,
    )
    fks = {}
    for row in cursor.fetchall():
        key = (row["CONSTRAINT_SCHEMA"], row["TABLE_NAME"], row["CONSTRAINT_NAME"])
        fk = fks.setdefault(key, {
            "referenced_schema": row["REFERENCED_TABLE_SCHEMA"],
            "referenced_table": row["REFERENCED_TABLE_NAME"],
            "on_update": row["UPDATE_RULE"],
            "on_delete": row["DELETE_RULE"],
            "columns": [],
            "referenced_columns": [],
        })
        fk["columns"].append(row["COLUMN_NAME"])
        fk["referenced_columns"].append(row["REFERENCED_COLUMN_NAME"])
    dump["fks"] = fks

    cursor.execute(
        "SELECT TABLE_SCHEMA, TABLE_NAME, VIEW_DEFINITION "
        "FROM information_schema.VIEWS WHERE TABLE_SCHEMA IN (" + ph + ")",
        SCHEMAS,
    )
    dump["views"] = {
        (row["TABLE_SCHEMA"], row["TABLE_NAME"]): norm_sql(row["VIEW_DEFINITION"])
        for row in cursor.fetchall()
    }

    cursor.execute(
        "SELECT TRIGGER_SCHEMA, TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, "
        "ACTION_STATEMENT "
        "FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA IN (" + ph + ") "
        "ORDER BY TRIGGER_SCHEMA, TRIGGER_NAME",
        SCHEMAS,
    )
    dump["triggers"] = {
        (row["TRIGGER_SCHEMA"], row["TRIGGER_NAME"]): {
            "event": row["EVENT_MANIPULATION"],
            "timing": row["ACTION_TIMING"],
            "statement": norm_sql(row["ACTION_STATEMENT"]),
        }
        for row in cursor.fetchall()
    }

    return dump


# ─────────────────────────────────────────────────────────────────────────────
# Diff
# ─────────────────────────────────────────────────────────────────────────────

def diff_dumps(local: dict, cloud: dict) -> dict:
    result = {}
    for section in ("schemata", "tables", "columns", "indexes", "fks", "views", "triggers"):
        l, c = local[section], cloud[section]
        keys = set(l) | set(c)
        only_local = sorted(k for k in keys if k in l and k not in c)
        only_cloud = sorted(k for k in keys if k in c and k not in l)
        changed = {}
        for key in keys:
            if key not in l or key not in c:
                continue
            fields = {}
            for field in sorted(set(l[key]) | set(c[key])):
                if l[key].get(field) != c[key].get(field):
                    fields[field] = {"local": l[key].get(field), "cloud": c[key].get(field)}
            if fields:
                changed[key] = fields
        if only_local or only_cloud or changed:
            result[section] = {
                "only_local": only_local,
                "only_cloud": only_cloud,
                "changed": changed,
            }

    cosmetic = {}

    # Cosmético 1: columnas que solo cambian de posición física (misma
    # definición; el backend lee filas por nombre, nunca por posición).
    columns = result.get("columns", {})
    changed_cols = columns.get("changed", {})
    pos_only = {key: value for key, value in changed_cols.items() if set(value) == {"pos"}}
    for key in pos_only:
        del changed_cols[key]
    if pos_only:
        cosmetic["column_order"] = pos_only
    if not columns.get("only_local") and not columns.get("only_cloud") and not columns.get("changed"):
        result.pop("columns", None)

    # Cosmético 2: FKs con la misma definición y distinto nombre de constraint.
    fks = result.get("fks", {})
    only_local = fks.get("only_local", [])
    only_cloud = fks.get("only_cloud", [])
    by_table = {}
    for key in only_cloud:
        by_table.setdefault(key[:2], []).append(key)
    fk_pairs = []
    for local_key in list(only_local):
        matches = [
            candidate for candidate in by_table.get(local_key[:2], [])
            if local["fks"][local_key] == cloud["fks"][candidate]
        ]
        if matches:
            cloud_key = matches[0]
            fk_pairs.append({
                "table": ".".join(local_key[:2]),
                "local_name": local_key[2],
                "cloud_name": cloud_key[2],
                "definition": local["fks"][local_key],
            })
            only_local.remove(local_key)
            only_cloud.remove(cloud_key)
    if fk_pairs:
        cosmetic["fk_names"] = fk_pairs
    if not fks.get("only_local") and not fks.get("only_cloud") and not fks.get("changed"):
        result.pop("fks", None)

    if cosmetic:
        result["cosmetic"] = cosmetic
    return result


def has_diffs(diff: dict) -> bool:
    """Diferencias FUNCIONALES (el bucket 'cosmetic' no cuenta)."""
    return any(
        value.get("only_local") or value.get("only_cloud") or value.get("changed")
        for key, value in diff.items()
        if key != "cosmetic"
    )


def jsonable(obj):
    """Convierte claves tupla en strings punteados para poder serializar a JSON."""
    if isinstance(obj, dict):
        converted = {}
        for key, value in obj.items():
            if isinstance(key, tuple):
                key = ".".join(str(part) for part in key)
            converted[key] = jsonable(value)
        return converted
    if isinstance(obj, (list, tuple)):
        return [jsonable(item) for item in obj]
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# Render markdown
# ─────────────────────────────────────────────────────────────────────────────

def _table(t):
    return t[0] + "." + t[1]


def _col(k):
    return k[0] + "." + k[1] + "." + k[2]


def _index(k):
    return k[0] + "." + k[1] + " " + k[2]


def _fk(k):
    return k[0] + "." + k[1] + " FK " + k[2]


def _trigger(k):
    return k[0] + "." + k[2]


def render(local_meta, cloud_meta, diff: dict, strict: bool = False) -> str:
    lines = [
        "# Verificación de esquema — MySQL local vs Cloud SQL (GCP)",
        "",
        "- **Local:** MySQL {} @ {}:{}".format(
            local_meta["version"], local_meta["host"], local_meta["port"]),
        "- **Cloud SQL:** MySQL {} @ {}".format(
            cloud_meta["version"], cloud_meta["instance"]),
        "- **Schemas comparados:** {}".format(", ".join(SCHEMAS)),
        "",
    ]

    cosmetic = diff.get("cosmetic") or {}
    functional = has_diffs(diff)

    if not functional and not cosmetic:
        lines += [
            "## Resultado",
            "",
            "✅ **Los esquemas son idénticos** (tablas, columnas, índices, foreign keys, vistas y triggers).",
            "",
        ]
        return "\n".join(lines)

    if not functional:
        n_cosmetic = len(cosmetic.get("column_order", {})) + len(cosmetic.get("fk_names", []))
        lines += [
            "## Resultado",
            "",
            "✅ **Los esquemas son funcionalmente idénticos.** Ninguna diferencia afecta a la "
            "app (el backend lee columnas por nombre). Diferencias cosméticas: {}.".format(n_cosmetic),
            "",
        ]
        if strict:
            lines.append("(ejecutado con `--strict`: las diferencias cosméticas cuentan como fallo)\n")

        if cosmetic.get("column_order"):
            lines.append("### Columnas con distinto orden físico (misma definición)")
            for key, fields in sorted(cosmetic["column_order"].items()):
                parts = ", ".join(
                    "`{}`: local={} ≠ Cloud SQL={}".format(field, pair["local"], pair["cloud"])
                    for field, pair in sorted(fields.items())
                )
                lines.append("- 📐 `{}` — {}".format(_col(key), parts))
            lines.append("")
        if cosmetic.get("fk_names"):
            lines.append("### Foreign keys con la misma definición y distinto nombre")
            for pair in cosmetic["fk_names"]:
                fk = pair["definition"]
                lines.append(
                    "- 🏷️ `{}` — mismo FK ({} → {}.{} · ON UPDATE {} / ON DELETE {}): "
                    "local `{}` vs Cloud SQL `{}`".format(
                        pair["table"],
                        ", ".join(fk["columns"]),
                        fk["referenced_schema"] + "." + fk["referenced_table"],
                        ", ".join(fk["referenced_columns"]),
                        fk["on_update"], fk["on_delete"],
                        pair["local_name"], pair["cloud_name"],
                    )
                )
            lines.append("")
        return "\n".join(lines)

    total = {
        "only_local": 0, "only_cloud": 0, "changed": 0,
    }
    for key, value in diff.items():
        if key == "cosmetic":
            continue
        total["only_local"] += len(value.get("only_local", []))
        total["only_cloud"] += len(value.get("only_cloud", []))
        total["changed"] += len(value.get("changed", {}))

    lines += [
        "## Resultado",
        "",
        "❌ **Los esquemas difieren.** Solo local: {} · Solo Cloud SQL: {} · Cambiados: {}".format(
            total["only_local"], total["only_cloud"], total["changed"]),
        "",
        "## Detalle",
        "",
    ]

    for section, label, formatter in (
        ("schemata", "schema", lambda k: k),
        ("tables", "tabla", _table),
        ("columns", "columna", _col),
        ("indexes", "índice", _index),
        ("fks", "foreign key", _fk),
        ("views", "vista", _table),
        ("triggers", "trigger", _trigger),
    ):
        value = diff.get(section)
        if not value:
            continue
        lines.append(f"### {label.capitalize()}s")
        for key in value.get("only_local", []):
            lines.append(f"- ➕ `{formatter(key)}` — solo en **local**")
        for key in value.get("only_cloud", []):
            lines.append(f"- ➖ `{formatter(key)}` — solo en **Cloud SQL**")
        for key, fields in sorted(value.get("changed", {}).items()):
            for field, pair in sorted(fields.items()):
                lines.append(
                    "- 🔸 `{}` — `{}`: local=`{}` ≠ Cloud SQL=`{}`".format(
                        formatter(key), field, pair["local"], pair["cloud"]))
        lines.append("")

    if cosmetic:
        n_cosmetic = len(cosmetic.get("column_order", {})) + len(cosmetic.get("fk_names", []))
        lines.append("### Además, diferencias cosméticas (sin impacto en la app): {}".format(n_cosmetic))
        for key, fields in sorted(cosmetic.get("column_order", {}).items()):
            parts = ", ".join(
                "`{}`: local={} ≠ Cloud={}".format(field, pair["local"], pair["cloud"])
                for field, pair in sorted(fields.items())
            )
            lines.append("- 📐 `{}` — solo cambia el orden físico: {}".format(_col(key), parts))
        for pair in cosmetic.get("fk_names", []):
            fk = pair["definition"]
            lines.append(
                "- 🏷️ `{}` — mismo FK con distinto nombre: local `{}` vs Cloud SQL `{}`".format(
                    pair["table"], pair["local_name"], pair["cloud_name"]))
        lines.append("")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Compara el esquema local vs Cloud SQL (GCP).")
    parser.add_argument("--json", action="store_true", help="emitir el diff como JSON (para CI)")
    parser.add_argument("--strict", action="store_true",
                        help="las diferencias cosméticas (orden de columnas / nombre de FK) también fallan")
    parser.add_argument("-o", "--output", metavar="FILE", help="guardar el reporte markdown en FILE")
    args = parser.parse_args()

    local_conn = open_local()
    print("→ MySQL local conectado ({}:{})".format(
        local_conn.host, local_conn.port), file=sys.stderr)

    cloud_conn, cloud_connector = open_cloud()
    print("→ Cloud SQL conectado ({})".format(env("INSTANCE_DB")), file=sys.stderr)

    try:
        with local_conn.cursor() as cur:
            cur.execute("SELECT VERSION()")
            local_version = cur.fetchone()["VERSION()"]
        with cloud_conn.cursor() as cur:
            cur.execute("SELECT VERSION()")
            cloud_version = cur.fetchone()["VERSION()"]

        with local_conn.cursor() as cur:
            local_dump = dump_schema(cur)
        with cloud_conn.cursor() as cur:
            cloud_dump = dump_schema(cur)

        diff = diff_dumps(local_dump, cloud_dump)

        local_meta = {
            "version": local_version, "host": local_conn.host, "port": local_conn.port,
        }
        cloud_meta = {
            "version": cloud_version, "instance": env("INSTANCE_DB"),
        }

        if args.json:
            print(json.dumps(jsonable(
                {"local": local_meta, "cloud": cloud_meta, "schemas": SCHEMAS,
                 "strict": args.strict, "diff": diff}),
                indent=2))
        else:
            report = render(local_meta, cloud_meta, diff, strict=args.strict)
            if args.output:
                with open(args.output, "w") as handle:
                    handle.write(report + "\n")
                print(f"→ Reporte guardado en {args.output}", file=sys.stderr)
            print(report)

        functional = has_diffs(diff)
        cosmetic_only = bool(diff.get("cosmetic")) and not functional
        if functional:
            return 1
        if cosmetic_only and args.strict:
            return 1
        return 0
    finally:
        local_conn.close()
        cloud_conn.close()
        cloud_connector.close()


if __name__ == "__main__":
    sys.exit(main())
