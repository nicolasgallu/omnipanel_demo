"""Fetch de envíos de MercadoLibre (detalle por shipment id)."""
import requests

from app.integrations.core.credentials import get_access_token

MELI_BASE_URL = "https://api.mercadolibre.com"


def fetch_shipment(account, shipment_id):
    """Fetch one shipment by id. Raises on any non-2xx."""
    token = get_access_token(account["id"]).get("access_token")
    if not token:
        raise Exception("Missing access token for account " + str(account["id"]))
    url = MELI_BASE_URL + "/shipments/" + str(shipment_id)
    headers = {"Authorization": "Bearer " + token}
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()
