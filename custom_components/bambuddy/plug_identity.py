"""How a smart plug is known. Its entities belong to what it switches -- a
Tasmota by its address, a Home Assistant plug by its entity, an MQTT plug by
its topic and the path read there --, its device to BamBuddy's plug: the
number and when BamBuddy created it (every BamBuddy numbers its plugs 1, 2,
3 ..., and SQLite gives a deleted plug's number to the next one). A REST plug is known by its BamBuddy
record alone: BamBuddy hides its URLs from API keys from 1.3.0 on.

What a plug switches never leaves Home Assistant in plain text: the IDs carry
an HMAC of it, keyed with a secret of this installation."""
from __future__ import annotations

import asyncio
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import hmac
import re
import secrets
from string import hexdigits
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .plugs import PLUG_TYPES

STORE_KEY = f"{DOMAIN}.plug_secret"
STORE_VERSION = 1
# hass.data[DOMAIN]: the secret once loaded in this run.
_DATA = "plug_secret"
_LOCK = "plug_secret_lock"

# An MQTT plug's topics with the path BamBuddy reads in each, in the order
# the first set one counts: one topic may carry several channels (a two-gang
# meter's power_l1 and power_l2), each a device of its own.
_MQTT_TOPICS = (
    ("mqtt_power_topic", "mqtt_power_path"),
    ("mqtt_topic", "mqtt_power_path"),
    ("mqtt_energy_topic", "mqtt_energy_path"),
    ("mqtt_state_topic", "mqtt_state_path"),
)
_QUAD = re.compile(r"(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})")
# A plug device's model is its type as BamBuddy names it.
_TYPES_BY_MODEL = {model: plug_type for plug_type, model in PLUG_TYPES.items()}


async def async_secret(hass: HomeAssistant) -> bytes:
    """This installation's secret for the plugs' keys, made once."""
    domain: dict[str, Any] = hass.data.setdefault(DOMAIN, {})
    if _LOCK not in domain:
        domain[_LOCK] = asyncio.Lock()
    lock: asyncio.Lock = domain[_LOCK]
    async with lock:
        if _DATA not in domain:
            store: Store[dict[str, str]] = Store(hass, STORE_VERSION, STORE_KEY, private=True)
            stored = (await store.async_load() or {}).get("secret")
            secret = bytes.fromhex(stored) if isinstance(stored, str) and len(stored) == 64 and all(c in hexdigits for c in stored) else None
            if secret is None:
                secret = secrets.token_bytes(32)
                await store.async_save({"secret": secret.hex()})
            domain[_DATA] = secret
    found: bytes = domain[_DATA]
    return found


def created_epoch(value: Any) -> int | None:
    """When BamBuddy created the plug, in whole seconds: its answer is naive
    -- UTC from SQLite, the session's time from PostgreSQL --, taken as it
    stands, never through a time zone of this host or Home Assistant."""
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return int(moment.timestamp())


def _address(value: str) -> str:
    text = value.strip().lower()
    match = _QUAD.fullmatch(text)
    if match and all(int(octet) <= 255 for octet in match.groups()):
        return ".".join(str(int(octet)) for octet in match.groups())
    return text


def _text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def source_candidates(info: Mapping[str, Any]) -> list[str]:
    """What the plug switches or reads, in one form: none for a REST plug."""
    plug_type = str(info.get("plug_type") or "tasmota")
    if plug_type == "tasmota":
        address = _text(info.get("ip_address"))
        return [_address(address)] if address else []
    if plug_type == "homeassistant":
        entity = _text(info.get("ha_entity_id"))
        return [entity.lower()] if entity else []
    if plug_type == "mqtt":
        return [f"{topic}\n{_text(info.get(path)) or ''}" for field, path in _MQTT_TOPICS if (topic := _text(info.get(field)))]
    return []


def _hmac(secret: bytes, text: str) -> str:
    return hmac.new(secret, text.encode(), hashlib.sha256).hexdigest()


def source_key(secret: bytes, plug_type: str, source: str) -> str:
    return _hmac(secret, f"{plug_type}\n{source}")


def record_key(secret: bytes, plug_id: int, device_epoch: int) -> str:
    return _hmac(secret, f"record\n{plug_id}\n{device_epoch}")


@dataclass(frozen=True)
class Known:
    """What was known of a plug before: its type, when BamBuddy created it
    (None: unknown) and the keys its entities were made with."""

    plug_type: str
    epoch: int | None
    internals: frozenset[str]


@dataclass(frozen=True)
class PlugIdentity:
    """A linked plug: its BamBuddy record, the key of what it switches (of
    its record for a REST plug) and its rank among the entry's plugs that
    switch the same."""

    plug_id: int
    plug_type: str
    epoch: int | None
    # 64 hex; only the 16 of `internal` when carried over from the registry.
    key: str
    rank: int
    # "source": from what it switches; "record": from its BamBuddy record (a
    # REST plug); "kept": the answer lacked the field, the last key stays.
    known_by: str

    @property
    def digest(self) -> str:
        return self.key[:6]

    @property
    def internal(self) -> str:
        return self.key[:16]

    @property
    def device_epoch(self) -> int:
        return self.epoch or 0

    def same_as(self, other: PlugIdentity) -> bool:
        return (self.internal, self.rank, self.device_epoch) == (other.internal, other.rank, other.device_epoch)

    def known(self) -> Known:
        return Known(self.plug_type, self.epoch, frozenset({self.internal}))


def _key(secret: bytes, plug_id: int, plug_type: str, epoch: int | None, info: Mapping[str, Any], before: Known | None) -> tuple[str, str]:
    """The plug's key, and what it is known by (`PlugIdentity.known_by`).
    `before`: what was known of it with the same type."""
    if plug_type == "rest":
        return record_key(secret, plug_id, epoch or 0), "record"
    keys = [source_key(secret, plug_type, source) for source in source_candidates(info)]
    if keys:
        if plug_type == "mqtt" and before is not None:
            # An MQTT plug keeps its topic while it still has it.
            kept = next((key for key in keys if key[:16] in before.internals), None)
            if kept is not None:
                return kept, "source"
        return keys[0], "source"
    if before is not None and before.internals:
        # A field the answer lacks: unchanged.
        return min(before.internals), "kept"
    return record_key(secret, plug_id, epoch or 0), "record"


def identities(secret: bytes, infos: Iterable[Mapping[str, Any]], known: Mapping[int, Known]) -> dict[int, PlugIdentity]:
    """The identities of the linked plugs `infos`; a part an answer lacks
    keeps what `known` says, but a type changed or a REST plug carries no
    key over."""
    parts: list[tuple[int, str, int | None, str, str]] = []
    for info in infos:
        plug_id = int(info["id"])
        plug_type = str(info.get("plug_type") or "tasmota")
        before = known.get(plug_id)
        epoch = created_epoch(info.get("created_at"))
        if epoch is None and before is not None:
            epoch = before.epoch
        key, known_by = _key(secret, plug_id, plug_type, epoch, info, before if before and before.plug_type == plug_type else None)
        parts.append((plug_id, plug_type, epoch, key, known_by))
    ranks: dict[str, int] = {}
    found: dict[int, PlugIdentity] = {}
    for plug_id, plug_type, epoch, key, known_by in sorted(parts, key=lambda part: part[0]):
        rank = ranks.get(key[:16], 0)
        ranks[key[:16]] = rank + 1
        found[plug_id] = PlugIdentity(plug_id, plug_type, epoch, key, rank, known_by)
    return found


def device_identifier(entry_id: str, identity: PlugIdentity) -> tuple[str, str]:
    return (DOMAIN, f"{entry_id}_plug_{identity.plug_id}_{identity.device_epoch}")


def entity_unique_id(entry_id: str, identity: PlugIdentity, key: str) -> str:
    return f"{entry_id}_plugsrc_{identity.internal}_{identity.rank}_{key}"


def parse_device_identifier(entry_id: str, identifier: str) -> tuple[int, int] | None:
    """(number, epoch) of a plug device's identifier; None for any other
    form, the first betas' `<entry>_plug_<number>` included."""
    rest = identifier.removeprefix(f"{entry_id}_plug_")
    plug_id, sep, epoch = rest.partition("_")
    if rest == identifier or not sep or not plug_id.isdigit() or not epoch.isdigit():
        return None
    return int(plug_id), int(epoch)


def parse_unique_id(entry_id: str, unique_id: str) -> tuple[str, int, str] | None:
    """(internal, rank, key) of a plug entity's unique ID; None for any other."""
    rest = unique_id.removeprefix(f"{entry_id}_plugsrc_")
    internal, _, tail = rest.partition("_")
    rank, _, key = tail.partition("_")
    if rest == unique_id or len(internal) != 16 or not all(c in hexdigits for c in internal) or not rank.isdigit() or not key:
        return None
    return internal, int(rank), key


def known_from_registry(hass: HomeAssistant, entry_id: str) -> dict[int, Known]:
    """What the registry knows of the entry's plugs: each device's type and
    record, the keys of the entities on it."""
    entities = er.async_get(hass)
    known: dict[int, Known] = {}
    for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry_id):
        for domain, identifier in device.identifiers:
            parsed = parse_device_identifier(entry_id, identifier) if domain == DOMAIN else None
            if parsed is None:
                continue
            plug_id, epoch = parsed
            internals = frozenset(
                part[0]
                for entity in er.async_entries_for_device(entities, device.id, include_disabled_entities=True)
                if entity.unique_id and (part := parse_unique_id(entry_id, entity.unique_id))
            )
            model = device.model or ""
            known[plug_id] = Known(_TYPES_BY_MODEL.get(model, model), epoch or None, internals)
    return known
