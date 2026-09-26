"""Spoken pain check-in: the recording in, what the patient said and the score in it out.
ElevenLabs, Gemini, login and the database are faked.

Run from backend/:  python -m pytest tests
"""
from types import SimpleNamespace

import pytest
from elevenlabs.core.api_error import ApiError
from fastapi.testclient import TestClient

from api.auth import CurrentUser, require_patient
from api.core.config import settings
from api.main import app
from api.routers.v1 import pain_check as pain_check_router
from api.schemas.pain_check import PainVoiceExtract
from api.services import pain_voice_service
from api.services.pain_voice_service import parse_answer, parse_score
from api.services.stt_service import stt_service
from api.services.tts_service import tts_service

TRANSCRIBE = "/api/v1/pain-check/transcribe"
CLIP = b"\x1aE\xdf\xa3fake-webm"


class FakeScribe:
    """Stands in for AsyncElevenLabs: `.speech_to_text.convert(...)` returns `text`, or raises `error`."""

    def __init__(self, text="", error=None):
        self.text, self.error, self.calls = text, error, []
        self.speech_to_text = self

    async def convert(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(text=self.text, language_code="eng")


@pytest.fixture
def owners(monkeypatch):
    """Sessions whose ownership the route checked."""
    checked = []
    monkeypatch.setattr(pain_check_router, "require_session_owner", lambda session_id, user: checked.append(session_id))
    return checked


@pytest.fixture
def client(monkeypatch, owners):
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_EN", "voice-en")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_ES", "voice-es")
    tts_service._clips.clear()

    def no_saving(*args):
        raise AssertionError("a spoken answer must not be saved until the patient sends it")

    monkeypatch.setattr(pain_check_router, "save_check_in", no_saving)
    app.dependency_overrides[require_patient] = lambda: CurrentUser("p-maria", "patient", "Maria Lopez", "es")
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def use_scribe(monkeypatch, **kwargs) -> FakeScribe:
    fake = FakeScribe(**kwargs)
    monkeypatch.setattr(stt_service, "_client", fake)
    return fake


def use_gemini(monkeypatch, found=None, error=None) -> list:
    calls = []

    async def extract(transcript, language):
        calls.append((transcript, language))
        if error:
            raise error
        return found

    monkeypatch.setattr(pain_voice_service, "extract", extract)
    return calls


def send(client, audio=CLIP, content_type="audio/webm;codecs=opus", language="en"):
    return client.post(f"{TRANSCRIBE}?session_id=s1&language={language}", content=audio, headers={"Content-Type": content_type})


def test_spoken_answer_becomes_a_score_symptoms_and_a_note(client, owners, monkeypatch):
    scribe = use_scribe(monkeypatch, text="About a six, it's a bit sharp on the inside.")
    gemini = use_gemini(monkeypatch, PainVoiceExtract(pain_score=6, symptoms=["sharp", "sharp"], notes=" A bit sharp on the inside. "))

    res = send(client)
    assert res.status_code == 200
    assert res.json() == {
        "transcript": "About a six, it's a bit sharp on the inside.",
        "pain_score": 6,
        "symptoms": ["sharp"],
        "notes": "A bit sharp on the inside.",
    }
    assert owners == ["s1"]  # patients only, and only for their own session
    (call,) = scribe.calls
    assert call["file"] == ("answer.webm", CLIP, "audio/webm")
    assert call["language_code"] == "en"
    assert gemini == [("About a six, it's a bit sharp on the inside.", "en")]


def test_safari_recordings_are_accepted(client, monkeypatch):
    scribe = use_scribe(monkeypatch, text="Tres.")
    use_gemini(monkeypatch, PainVoiceExtract(pain_score=3, symptoms=[], notes=""))

    assert send(client, content_type="audio/mp4", language="es").json()["pain_score"] == 3
    assert scribe.calls[0]["file"][0] == "answer.mp4"
    assert scribe.calls[0]["language_code"] == "es"


def test_gemini_down_falls_back_to_the_number_parser(client, monkeypatch):
    use_scribe(monkeypatch, text="Un seis de diez, está un poco hinchada.")
    use_gemini(monkeypatch, error=RuntimeError("quota"))

    res = send(client, language="es").json()
    assert res["pain_score"] == 6
    assert res["symptoms"] == ["swelling"]
    assert res["notes"] == "Un seis de diez, está un poco hinchada."


def test_no_number_heard_leaves_the_score_to_the_patient(client, monkeypatch):
    use_scribe(monkeypatch, text="It feels a bit stiff.")
    use_gemini(monkeypatch, PainVoiceExtract(pain_score=None, symptoms=["stiffness"], notes="A bit stiff."))

    res = send(client).json()
    assert res["pain_score"] is None
    assert res["symptoms"] == ["stiffness"]


@pytest.mark.parametrize("said, kept", [(0, 1), (10, 10), (45, None), (-1, None)])
def test_scores_off_the_scale_are_fixed_or_dropped(client, monkeypatch, said, kept):
    use_scribe(monkeypatch, text="something")
    use_gemini(monkeypatch, PainVoiceExtract(pain_score=said, symptoms=[], notes=""))
    assert send(client).json()["pain_score"] == kept


def test_silence_is_an_empty_answer_without_asking_gemini(client, monkeypatch):
    use_scribe(monkeypatch, text="  ")
    gemini = use_gemini(monkeypatch, error=AssertionError("not called"))

    assert send(client).json() == {"transcript": "", "pain_score": None, "symptoms": [], "notes": ""}
    assert gemini == []


def test_speech_to_text_failure_is_an_error_status(client, monkeypatch):
    use_scribe(monkeypatch, error=RuntimeError("elevenlabs down"))
    assert send(client).status_code == 502


def test_no_elevenlabs_key_is_unavailable(client, monkeypatch):
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "")
    assert send(client).status_code == 503


def test_a_key_without_speech_to_text_is_unavailable_not_a_bad_clip(client, monkeypatch):
    use_scribe(monkeypatch, error=ApiError(status_code=401, body={"detail": {"status": "missing_permissions"}}))
    assert send(client).status_code == 503


def test_bad_uploads_are_refused_before_transcribing(client, monkeypatch):
    scribe = use_scribe(monkeypatch, text="six")
    assert send(client, content_type="application/json").status_code == 415
    assert send(client, audio=b"").status_code == 400
    monkeypatch.setattr(pain_voice_service, "MAX_AUDIO_BYTES", 8)
    assert send(client).status_code == 413
    assert scribe.calls == []


def test_coach_line_is_voiced_once_and_reused(client):
    first = client.post("/api/v1/pain-check/speak", json={"text": "How does your knee feel, from 1 to 10?", "language": "en"}).json()
    again = client.post("/api/v1/pain-check/speak", json={"text": "How does your knee feel, from 1 to 10?", "language": "en"}).json()
    assert first["audio_url"].startswith("/api/v1/tts/")
    assert again["audio_url"] == first["audio_url"]
    assert client.post("/api/v1/pain-check/speak", json={"text": "x" * 201, "language": "en"}).status_code == 422


@pytest.mark.parametrize(
    "said, score",
    [
        ("About a six, it's a bit sharp on the inside", 6),
        ("seven out of ten", 7),
        ("7/10", 7),
        ("I did 10 reps, it's a two", 2),
        ("six or seven", 7),
        ("seis y medio", 7),
        ("6.5", 7),
        ("How does your knee feel, from 1 to 10? Uh, four.", 4),
        ("¿Cómo sientes la rodilla, del 1 al 10? Tres, está hinchada", 3),
        ("Ocho. Muy rígida.", 8),
        ("zero", 1),
        ("one of those days, maybe a four", 4),
        ("no pain at all", None),
        ("I got to ninety degrees today", None),
    ],
)
def test_number_parser(said, score):
    assert parse_score(said) == score


def test_parser_finds_symptoms_in_either_language():
    assert parse_answer("Sharp, and it popped once").symptoms == ["sharp", "clicking"]
    assert parse_answer("Rígida y con hinchazón").symptoms == ["swelling", "stiffness"]
