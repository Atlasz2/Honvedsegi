"""Az esemény-jellegű lista-végpontok tesztjei (exercise/training/event/duty).

A test_list_has_no_n_plus_one regressziós teszt: a résztvevőket egyetlen
kötegelt lekérdezéssel kell betölteni eseménytípusonként, nem eseményenként.
"""
from __future__ import annotations

import pytest
from sqlalchemy import event

from app.db import engine

LIST_ENDPOINTS = ["/api/exercises", "/api/trainings", "/api/events", "/api/duties"]


@pytest.mark.parametrize("endpoint", LIST_ENDPOINTS)
def test_list_returns_a_list(client, admin_headers, endpoint):
    response = client.get(endpoint, headers=admin_headers)
    assert response.status_code == 200, response.text
    assert isinstance(response.json(), list)


@pytest.mark.parametrize("endpoint", LIST_ENDPOINTS)
def test_list_has_no_n_plus_one(client, admin_headers, endpoint):
    statements: list[str] = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        if "participants" in statement:
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        response = client.get(endpoint, headers=admin_headers)
        assert response.status_code == 200, response.text
    finally:
        event.remove(engine, "before_cursor_execute", _record)

    assert len(statements) == 1, (
        f"{endpoint}: a résztvevőket egyetlen kötegelt lekérdezéssel kell betölteni, "
        f"de {len(statements)} futott le"
    )
