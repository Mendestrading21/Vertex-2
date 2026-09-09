"""Trois en-têtes de refus par défaut, sur CHAQUE réponse de l'API.

Mesuré sur la pile en direct le 2026-09-06 : l'API ne renvoyait que `date`,
`server`, `content-length` et `content-type`. Sans effet tant que tout écoute
sur la boucle locale, mais `.claude/rules/security.md` demande de refuser par
défaut ce qui n'est pas déclaré. Ces tests gèlent les trois en-têtes, y
compris sur les réponses d'erreur — c'est là qu'un oubli passe inaperçu.
"""

from fastapi.testclient import TestClient

ATTENDUS = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "frame-ancestors 'none'",
}


def _verifier(response) -> None:
    for nom, valeur in ATTENDUS.items():
        assert response.headers.get(nom) == valeur, f"{nom} manquant ou différent"


def test_reponse_publique_porte_les_trois_entetes(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    _verifier(response)


def test_route_inexistante_les_porte_aussi(client: TestClient) -> None:
    # Un 404 est une réponse comme une autre : rien ne justifie qu'il sorte
    # sans ses en-têtes.
    response = client.get("/api/v1/route-qui-n-existe-pas")
    assert response.status_code == 404
    _verifier(response)


def test_le_refus_fail_closed_les_porte_aussi(client: TestClient) -> None:
    # Le cas qui compte le plus : sans session, une route protégée refuse en
    # 401 — et ce refus sort avec ses en-têtes comme n'importe quelle réponse.
    response = client.get("/api/v1/performance/1")
    assert response.status_code == 401
    _verifier(response)


def test_le_document_openapi_les_porte_aussi(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    _verifier(response)


def test_aucun_corps_de_reponse_n_est_modifie(client: TestClient) -> None:
    # Les en-têtes s'ajoutent, ils ne touchent NI le code NI le corps.
    response = client.get("/api/v1/health")
    assert set(response.json()) == {"status", "engine_version"}
