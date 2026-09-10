"""A törzsadatok (egység/rendfokozat/státusz) egy igazságforrásának őrzése.

Ezek a tesztek azt akadályozzák meg, hogy a seed és a kliens által ismert
törzsadatok újra elcsússzanak egymástól. Korábban ez megtörtént: a seed a
zászlóalj-állomány 26%-át "Honvéd" fokozatúra generálta, amit a frontend
rendfokozat-létrája nem ismert (0 rendezési súly, rövidítés nélkül).
"""
from __future__ import annotations

from app.constants import PERSON_STATUSES, RANK_NAMES, UNITS
from app.seed import BATTALION_RANK_WEIGHTS, STAFF_RANK_WEIGHTS, UNIT_PLAN


def test_reference_endpoint_serves_the_constants(client, admin_headers):
    response = client.get("/api/reference", headers=admin_headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["units"] == list(UNITS)
    assert body["personStatuses"] == list(PERSON_STATUSES)
    assert [rank["name"] for rank in body["ranks"]] == list(RANK_NAMES)
    assert all(rank["short"] for rank in body["ranks"]), "minden fokozatnak van rövidítése"


def test_reference_requires_authentication(client):
    assert client.get("/api/reference").status_code == 401


def test_ranks_are_unique(client):
    assert len(set(RANK_NAMES)) == len(RANK_NAMES)


def test_seed_only_generates_known_ranks():
    """A seed nem hozhat létre olyan fokozatot, amit a hivatalos létra nem ismer.

    Ez a szabály korábban sérült: a seed a zászlóalj-állomány 26%-át "Honvéd"
    fokozatúra generálta, a frontend létrája viszont csak "Közkatona"-t ismert.
    """
    seeded_ranks = {name for name, _weight in BATTALION_RANK_WEIGHTS + STAFF_RANK_WEIGHTS}
    unknown = seeded_ranks - set(RANK_NAMES)
    assert not unknown, f"ismeretlen rendfokozat a seedben: {sorted(unknown)}"


def test_seed_unit_plan_covers_exactly_the_known_units():
    assert set(UNIT_PLAN) == set(UNITS)
