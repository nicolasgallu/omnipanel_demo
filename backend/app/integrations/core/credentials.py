from app import cache
from app.db.helpers import get_one
from app.settings.config import SCHEMA_ACCOUNTS

CREDENTIALS_TABLE = SCHEMA_ACCOUNTS + ".credentials"
ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"

# Cache del access token por cuenta: ahorra el SELECT a credentials en cada
# llamada a Meli/TN (publish, handlers de topics, oauth...). TTL corto a
# propósito: la rotación del token la hace el usuario POR FUERA de la app,
# así que el TTL es lo que acota cuánto tarda en verse el token nuevo. El
# OAuth callback invalida al instante cuando la app misma escribe los tokens.
TTL_CREDENTIALS = 60


class UnknownAccount(Exception):
    """Raised when an user_id has no matching account."""

def get_account_owner(user_id, platform):
    """Return the account (as a dict) that owns this user_id on the given platform.

    Raises UnknownAccount when no account matches.
    """
    sql = (
        "SELECT * FROM " + ACCOUNTS_TABLE
        + " WHERE external_account_id = :user_id AND platform = :platform"
    )
    try:
        return get_one(sql, {"user_id": str(user_id), "platform": platform})
    except LookupError:
        raise UnknownAccount(f"No {platform} account for id " + str(user_id))


def is_business_active(account):
    """Desactivación estricta: False si el business dueño de la cuenta está
    inactivo (los webhooks de Meli/TN se ignoran en ese caso)."""
    try:
        row = get_one(
            "SELECT active FROM " + SCHEMA_ACCOUNTS + ".businesses WHERE id = :id",
            {"id": account.get("business_id")})
        return bool(row["active"])
    except LookupError:
        return False



def get_access_token(account_id):
    """Read the account's current token from the credentials table.

    Cacheado por account_id. El account_id es la PK de accounts (única
    global): la clave no puede mezclar negocios; en el slot de versión de la
    cache genérica va el account_id, y se invalida con
    `cache.invalidate_business(account_id)` (lo hace oauth._save_tokens).
    Sin fila de credentials -> LookupError SIN cachear (la cuenta puede
    conectarse recién después).
    """
    return cache.get_or_compute(
        account_id, "cred_access_token", TTL_CREDENTIALS,
        lambda: _read_access_token(account_id))


def _read_access_token(account_id):
    sql = (
        "SELECT access_token FROM " + CREDENTIALS_TABLE
        + " WHERE account_id = :account_id"
    )
    row = get_one(sql, {"account_id": account_id})
    return dict(row)  # copia: el valor cacheado no se comparte ni muta