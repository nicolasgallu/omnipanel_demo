from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import text
from app.db.engine import engine

# Shared executor: parallel SELECTs for endpoints that need several queries
# (each query uses its own pooled connection).
_parallel_executor = ThreadPoolExecutor(max_workers=4)


def get_all(query, params=None):
    """Run a SELECT and return every row as a list of dicts."""
    with engine.begin() as conn:
        result = conn.execute(text(query), params or {})
        return [dict(row) for row in result.mappings()]


def get_one(query, params=None):
    """Run a SELECT and return a single row as a dict.

    Raises LookupError when the query returns no rows.
    """
    rows = get_all(query, params)
    if not rows:
        raise LookupError("Query returned no rows: " + query)
    return rows[0]


def execute(sql, params=None):
    """Run INSERT/UPDATE/DELETE and return the number of affected rows."""
    with engine.begin() as conn:
        result = conn.execute(text(sql), params or {})
        return result.rowcount


def insert_and_get_id(sql, params=None):
    """Run a single-row INSERT and return its auto-increment id.

    Same connection for both operations: `result.lastrowid` is always the id
    of THIS insert (SELECT LAST_INSERT_ID() on a separate pooled connection
    can read another connection's id).
    """
    with engine.begin() as conn:
        result = conn.execute(text(sql), params or {})
        return result.lastrowid


def run_parallel(query_map):
    """Run several SELECTs concurrently (one pooled connection each).

    query_map: {name: (sql, params)} -> {name: [row dicts]}.
    A lookup error in one query does not affect the others.
    """
    def _run(item):
        name, (sql, params) = item
        try:
            with engine.begin() as conn:
                result = conn.execute(text(sql), params or {})
                return name, [dict(row) for row in result.mappings()]
        except Exception:
            return name, []

    futures = [_parallel_executor.submit(_run, item) for item in query_map.items()]
    out = {}
    for future in futures:
        name, rows = future.result()
        out[name] = rows
    return out
