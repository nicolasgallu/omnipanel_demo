"""Fetch de preguntas de MercadoLibre (listado paginado)."""
import requests

from app.integrations.core.credentials import get_access_token

MELI_BASE_URL = "https://api.mercadolibre.com"


def fetch_questions_page(account, offset=0, limit=50):
    """Fetch one page of the seller's questions from /questions/search.

    Returns (questions, total). Raises on any non-2xx.
    Doc: https://developers.mercadolibre.cl/en_us/about-our-api/manage-questions-and-answers
    """
    token = get_access_token(account["id"]).get("access_token")
    if not token:
        raise Exception("Missing access token for account " + str(account["id"]))
    url = MELI_BASE_URL + "/questions/search"
    headers = {"Authorization": "Bearer " + token}
    params = {
        "seller_id": str(account["external_account_id"]),
        "offset": offset,
        "limit": limit,
    }
    response = requests.get(url, headers=headers, params=params, timeout=30)
    response.raise_for_status()
    body = response.json()
    questions = body.get("questions") or []
    total = body.get("total", 0)
    return questions, total


def fetch_question(account, question_id):
    """Fetch one question by id (trae `answer`). Raises on any non-2xx."""
    token = get_access_token(account["id"]).get("access_token")
    if not token:
        raise Exception("Missing access token for account " + str(account["id"]))
    url = MELI_BASE_URL + "/questions/" + str(question_id)
    response = requests.get(url, headers={"Authorization": "Bearer " + token}, timeout=30)
    response.raise_for_status()
    return response.json()


def fetch_user_nickname(account, user_id):
    """Nickname del usuario vía GET /users/{id} (best-effort, None si falla)."""
    token = get_access_token(account["id"]).get("access_token")
    if not token:
        return None
    url = MELI_BASE_URL + "/users/" + str(user_id)
    try:
        response = requests.get(url, headers={"Authorization": "Bearer " + token}, timeout=30)
        if response.status_code != 200:
            return None
        return response.json().get("nickname")
    except Exception:
        return None
