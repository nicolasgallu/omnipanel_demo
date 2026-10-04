from urllib.parse import quote_plus

from sqlalchemy import create_engine
from app.settings.config import (
    DB_HOST,
    DB_PORT,
    INSTANCE_DB,
    NAME_DB,
    PASSWORD_DB,
    USER_DB,
)

_connector = None


def _get_connector():
    global _connector
    if _connector is None:
        from google.cloud.sql.connector import Connector
        _connector = Connector()
    return _connector


def _cloud_sql_connection():
    return _get_connector().connect(
        INSTANCE_DB,
        "pymysql",
        user=USER_DB,
        password=PASSWORD_DB,
        db=NAME_DB,
    )


def _build_engine():
    # Modo local (dev/tests): MySQL común por TCP (contenedor de docker
    # compose o la máquina). DB_HOST define el modo.
    if DB_HOST:
        url = "mysql+pymysql://{}:{}@{}:{}/{}".format(
            quote_plus(USER_DB or ""),
            quote_plus(PASSWORD_DB or ""),
            DB_HOST,
            DB_PORT,
            quote_plus(NAME_DB or ""),
        )
        return create_engine(
            url, pool_size=20, max_overflow=10, pool_recycle=1800)

    # Cloud SQL (modo deploy): connector de GCP, sin host ni password en URL.
    # Pool más grande (20 fijas + 10 de pico) para no hacer fila bajo
    # concurrencia, y pool_recycle=1800 recicla conexiones cada 30 min.
    # Se quitó pool_pre_ping: cada checkout hacía un SELECT 1 extra (1
    # round-trip por query). Si en prod aparecen errores esporádicos
    # "MySQL server has gone away", volver a activar pool_pre_ping=True.
    return create_engine(
        "mysql+pymysql://",
        creator=_cloud_sql_connection,
        pool_size=20,
        max_overflow=10,
        pool_recycle=1800,
    )


engine = _build_engine()
