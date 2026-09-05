"""Outbox coalescence: at most one PENDING job per (topic, coalesce_key).

Measured motive (real base, 2026-09-06): one recompute and one publication
per ingested observation — 14 360 versions of ``markets_overview`` for one
year of daily quotes. These tests pin the rule and its two safety edges: an
IN_PROGRESS job never absorbs a new one, and a plain message is never
coalesced. Clocks are injected synthetic instants.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from vertex_persistence.enums import OutboxStatus
from vertex_persistence.models import OutboxMessage
from vertex_persistence.repository import (
    COALESCE_KEY_FIELD,
    ack_outbox,
    claim_outbox_batch,
    enqueue_outbox,
    enqueue_outbox_coalesced,
)

T0 = datetime(2026, 9, 6, 3, 0, 0, tzinfo=UTC)
TOPIC = "synthetic.test.recompute"
KEY = "global"


def _count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(OutboxMessage)).scalar_one()


def test_burst_leaves_one_pending_job(db_session: Session) -> None:
    first = enqueue_outbox_coalesced(db_session, TOPIC, {"event_id": "e1"}, coalesce_key=KEY)
    assert first.enqueued is True
    db_session.commit()

    outcomes = [
        enqueue_outbox_coalesced(db_session, TOPIC, {"event_id": f"e{i}"}, coalesce_key=KEY)
        for i in range(2, 502)
    ]
    db_session.commit()

    assert all(outcome.enqueued is False for outcome in outcomes)
    assert {outcome.message_id for outcome in outcomes} == {first.message_id}
    assert _count(db_session) == 1
    row = db_session.execute(select(OutboxMessage)).scalar_one()
    assert row.payload[COALESCE_KEY_FIELD] == KEY
    # The waiting job keeps the payload of the FIRST observation: the
    # handler recomputes from the table, the payload is a trace only.
    assert row.payload["event_id"] == "e1"


def test_distinct_keys_and_topics_are_not_merged(db_session: Session) -> None:
    a = enqueue_outbox_coalesced(db_session, TOPIC, {"n": 1}, coalesce_key="SYN-A")
    b = enqueue_outbox_coalesced(db_session, TOPIC, {"n": 2}, coalesce_key="SYN-B")
    c = enqueue_outbox_coalesced(db_session, TOPIC + ".other", {"n": 3}, coalesce_key="SYN-A")
    db_session.commit()

    assert a.enqueued and b.enqueued and c.enqueued
    assert len({a.message_id, b.message_id, c.message_id}) == 3
    assert _count(db_session) == 3


def test_in_progress_job_never_absorbs_a_new_observation(db_session: Session) -> None:
    """The claimed handler may have read the table before the new row: a
    fresh PENDING job must follow it."""
    first = enqueue_outbox_coalesced(db_session, TOPIC, {"event_id": "e1"}, coalesce_key=KEY)
    db_session.commit()
    claimed = claim_outbox_batch(db_session, [TOPIC], 10, 60, now=T0)
    db_session.commit()
    assert [message.id for message in claimed] == [first.message_id]

    second = enqueue_outbox_coalesced(db_session, TOPIC, {"event_id": "e2"}, coalesce_key=KEY)
    db_session.commit()
    assert second.enqueued is True
    assert second.message_id != first.message_id

    # Once the first job is acked, the second is the only claimable one and
    # a third burst coalesces onto it.
    ack_outbox(db_session, first.message_id, lease_token=claimed[0].lease_token, now=T0)
    db_session.commit()
    third = enqueue_outbox_coalesced(db_session, TOPIC, {"event_id": "e3"}, coalesce_key=KEY)
    db_session.commit()
    assert third.enqueued is False
    assert third.message_id == second.message_id
    statuses = dict(db_session.execute(select(OutboxMessage.id, OutboxMessage.status)).all())
    assert statuses == {
        first.message_id: OutboxStatus.DONE.value,
        second.message_id: OutboxStatus.PENDING.value,
    }


def test_plain_messages_are_never_coalesced(db_session: Session) -> None:
    plain = enqueue_outbox(db_session, TOPIC, {"event_id": "p1"})
    again = enqueue_outbox(db_session, TOPIC, {"event_id": "p2"})
    coalesced = enqueue_outbox_coalesced(db_session, TOPIC, {"event_id": "c1"}, coalesce_key=KEY)
    db_session.commit()

    assert plain != again
    assert coalesced.enqueued is True
    assert _count(db_session) == 3
    rows = db_session.execute(select(OutboxMessage.payload)).scalars().all()
    assert sum(1 for payload in rows if COALESCE_KEY_FIELD in payload) == 1


def test_claim_order_and_payload_shape_are_unchanged(db_session: Session) -> None:
    enqueue_outbox_coalesced(db_session, TOPIC, {"event_id": "e1"}, coalesce_key=KEY)
    db_session.commit()
    claimed = claim_outbox_batch(db_session, [TOPIC], 10, 60, now=T0)
    assert len(claimed) == 1
    assert claimed[0].payload == {"event_id": "e1", COALESCE_KEY_FIELD: KEY}
