"""Pain check-in and its streamed voice, with Gemini, ElevenLabs, login and the database faked.

Run from backend/:  python -m pytest tests
"""
import asyncio

import pytest
from fastapi.testclient import TestClient

from api.auth import CurrentUser, require_patient
from api.core.config import settings
from api.main import app
from api.routers.v1 import pain_check as pain_check_router
from api.schemas.pain_check import PainCheckReply, PainCheckRequest
from api.services import pain_check_service
from api.services.tts_service import Clip, tts_service

PAIN_CHECK = "/api/v1/pain-check"


class FakeGemini:
    def __init__(self, reply: PainCheckReply):
        self.reply = reply

    async def generate_pain_reply(self, data, rule_reason):
        return self.reply


class FakeElevenLabs:
    """Stands in for AsyncElevenLabs: `.text_to_speech.stream(...)` yields `chunks`, or raises `error`."""

    def __init__(self, chunks=(b"ID3", b"-first", b"-second"), error=None):
        self.chunks, self.error, self.calls = chunks, error, 0
        self.text_to_speech = self

    async def stream(self, **kwargs):
        self.calls += 1
        if self.error:
            raise self.error
        for chunk in self.chunks:
            await asyncio.sleep(0.01)
            yield chunk


@pytest.fixture
def saved(monkeypatch):
    """Check-ins the route stores, as (session_id, pain_score, flagged)."""
    rows = []
    monkeypatch.setattr(pain_check_router, "save_check_in",
                        lambda data, res: rows.append((data.session_id, data.pain_score, res.flagged)))
    return rows


@pytest.fixture
def client(monkeypatch, saved):
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_EN", "voice-en")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_ES", "voice-es")
    tts_service._clips.clear()
    # Logged in as a patient who owns every session (tests/test_data_routes.py covers the real rules).
    app.dependency_overrides[require_patient] = lambda: CurrentUser("p-maria", "patient", "Maria Lopez", "es")
    monkeypatch.setattr(pain_check_router, "require_session_owner", lambda session_id, user: None)
    # One event loop for the whole test, like uvicorn, so synthesis started by
    # one request is still running when the next request reads it.
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def use_gemini(monkeypatch, reply=None, error=None):
    def factory():
        if error:
            raise error
        return FakeGemini(reply)

    monkeypatch.setattr(pain_check_service, "get_gemini_service", factory)


def use_elevenlabs(monkeypatch, **kwargs) -> FakeElevenLabs:
    fake = FakeElevenLabs(**kwargs)
    monkeypatch.setattr(tts_service, "_client", fake)
    return fake


def test_reply_is_voiced_and_streamed(client, monkeypatch):
    use_gemini(monkeypatch, PainCheckReply(reply="Nice work today. See you next time.", flagged=False))
    eleven = use_elevenlabs(monkeypatch)

    res = client.post(PAIN_CHECK, json={"session_id": "s1", "pain_score": 3, "notes": "", "language": "en"}).json()
    assert res["reply"] == "Nice work today. See you next time."
    assert res["flagged"] is False
    assert res["audio_url"].startswith("/api/v1/tts/")

    audio = client.get(res["audio_url"])
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/mpeg"
    assert audio.content == b"ID3-first-second"

    # Replaying, or the same line again, reuses the clip instead of spending credits.
    assert client.get(res["audio_url"]).content == b"ID3-first-second"
    again = client.post(PAIN_CHECK, json={"session_id": "s2", "pain_score": 2, "notes": "", "language": "en"}).json()
    assert again["audio_url"] == res["audio_url"]
    assert eleven.calls == 1


def test_safety_rule_flags_even_when_the_ai_does_not(client, saved, monkeypatch):
    use_gemini(monkeypatch, PainCheckReply(reply="Good job.", flagged=False))
    use_elevenlabs(monkeypatch)

    res = client.post(PAIN_CHECK, json={"session_id": "s1", "pain_score": 4, "notes": "Sharp pain on the inside", "language": "en"}).json()
    assert res["flagged"] is True
    assert res["flag_reason"] == "Mentioned “sharp”"
    assert saved == [("s1", 4, True)]  # so the therapist sees the red flag


def test_stopping_for_pain_is_flagged_even_on_a_low_score(client, saved, monkeypatch):
    use_gemini(monkeypatch, PainCheckReply(reply="Good job.", flagged=False))
    use_elevenlabs(monkeypatch)

    body = {"session_id": "s1", "pain_score": 3, "notes": "", "language": "en", "stopped_for_pain": True}
    res = client.post(PAIN_CHECK, json=body).json()
    assert res["flagged"] is True
    assert res["flag_reason"] == "Stopped the session mid-way for pain"
    assert saved == [("s1", 3, True)]


def test_stopping_for_pain_keeps_the_other_reason():
    data = PainCheckRequest(session_id="s1", pain_score=4, notes="Dolor agudo", language="es", stopped_for_pain=True)
    assert pain_check_service.red_flag(data) == "Stopped the session mid-way for pain; mentioned “agudo”"
    # The dashboard shows a flag's notes as its reason, so the stop is saved with them.
    assert pain_check_service.stored_notes(data) == "Stopped the session mid-way for pain. Dolor agudo"


def test_older_clients_without_the_stop_field_still_work():
    data = PainCheckRequest(session_id="s1", pain_score=3, notes=" Stiff ")
    assert data.stopped_for_pain is False
    assert pain_check_service.red_flag(data) is None
    assert pain_check_service.stored_notes(data) == "Stiff"


def test_gemini_down_falls_back_to_template(client, monkeypatch):
    use_gemini(monkeypatch, error=RuntimeError("quota"))
    use_elevenlabs(monkeypatch)

    res = client.post(PAIN_CHECK, json={"session_id": "s1", "pain_score": 8, "notes": "", "language": "es"}).json()
    assert res["flagged"] is True
    assert res["reply"] == pain_check_service.FALLBACK_REPLIES[("es", True)]
    assert res["flag_reason"] == "Pain score 8/10"
    assert res["audio_url"]  # the template is still voiced


def test_no_elevenlabs_key_means_no_audio_url(client, monkeypatch):
    use_gemini(monkeypatch, error=RuntimeError("no key"))
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "")

    res = client.post(PAIN_CHECK, json={"session_id": "s1", "pain_score": 2, "notes": "", "language": "en"}).json()
    assert res["audio_url"] is None


def test_failed_synthesis_is_an_error_status(client, monkeypatch):
    use_gemini(monkeypatch, PainCheckReply(reply="Well done.", flagged=False))
    use_elevenlabs(monkeypatch, error=RuntimeError("elevenlabs down"))

    res = client.post(PAIN_CHECK, json={"session_id": "s1", "pain_score": 2, "notes": "", "language": "en"}).json()
    assert client.get(res["audio_url"]).status_code == 502


def test_unknown_clip_is_404(client):
    assert client.get("/api/v1/tts/nope").status_code == 404


def test_clip_streams_to_listeners_who_join_early_or_late():
    async def scenario():
        clip = Clip()

        async def listen():
            return b"".join([c async for c in clip.stream()])

        early = asyncio.create_task(listen())
        for chunk in (b"a", b"b"):
            await asyncio.sleep(0)
            clip.push(chunk)
        late = asyncio.create_task(listen())
        await asyncio.sleep(0)
        clip.push(b"c")
        clip.finish()
        return await early, await late

    assert asyncio.run(scenario()) == (b"abc", b"abc")


def test_score_runs_from_zero_to_ten():
    """0-10, the standard numeric rating scale: 0 is no pain."""
    assert PainCheckRequest(session_id="s1", pain_score=0, notes="").pain_score == 0
    for bad in (-1, 11):
        with pytest.raises(ValueError):
            PainCheckRequest(session_id="s1", pain_score=bad, notes="")
