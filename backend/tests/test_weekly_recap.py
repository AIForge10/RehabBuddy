"""The patient's weekly recap and its voice, with Gemini, ElevenLabs, login and the database faked.

Run from backend/:  python -m pytest tests/test_weekly_recap.py
"""
import asyncio
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from api.auth import CurrentUser, get_current_user, require_patient_access
from api.auth import deps as auth_deps
from api.core.config import settings
from api.main import app
from api.routers.v1 import weekly_recap as weekly_recap_router
from api.schemas.weekly_recap import WeeklyRecapReply
from api.services import weekly_recap_service
from api.services.tts_service import tts_service

RECAP = "/api/v1/patients/p-maria/weekly-recap"
NOW = datetime.now(timezone.utc)

# What the template says for overview() below: 4 of 5 sessions, 78° → 86° against a 90° target.
TEMPLATE_ES = ("Hiciste 4 de 5 sesiones previstas en los últimos 7 días. "
               "Tu flexión máxima pasó de 78° a 86°, a 4° de tu meta de 90°. "
               "Intenta hacer 5 sesiones en los próximos 7 días para seguir avanzando.")


def session(sid: str, days_ago: float, angle: float) -> dict:
    return {"id": sid, "patient_id": "p-maria", "started_at": (NOW - timedelta(days=days_ago)).isoformat(),
            "reps_done": 10, "max_angle": angle, "form_warnings": [], "duration_sec": 80,
            "pain_score": 3, "flagged": False}


def red_flag(days_ago: float = 0) -> dict:
    return {"session_id": "s-4", "patient_id": "p-maria", "created_at": (NOW - timedelta(days=days_ago)).isoformat(),
            "pain_score": 8, "reason": "“Dolor agudo”"}


def overview(sessions=None, red_flags=None) -> dict:
    """The shape of GET /patients/{id}/overview (api/data/queries.py), most recent session first."""
    if sessions is None:
        # Four sessions in the past 7 days and one before them.
        sessions = [session("s-4", 0, 86.2), session("s-3", 1, 83), session("s-2", 3, 80.4),
                    session("s-1", 5, 78), session("s-0", 9, 74)]
    return {
        "patient": {"id": "p-maria", "full_name": "Maria Lopez", "language": "es",
                    "injury": "ACL reconstruction", "start_date": None},
        "assignment": {"id": "a-1", "patient_id": "p-maria", "therapist_id": "t-lee",
                       "exercise": {"id": "ex-knee", "name": "Seated knee bends", "joint": "knee", "instructions": ""},
                       "target_angle": 90.0, "reps": 10, "times_per_week": 5},
        "adherence_7d": 0.8,
        "sessions": sessions,
        "red_flags": red_flags or [],
        "latest_summary": None,
    }


class FakeGemini:
    def __init__(self, recap="Buen trabajo, Maria.", delay=0.0):
        self.recap, self.delay, self.calls = recap, delay, []

    async def generate_weekly_recap(self, facts, language):
        self.calls.append((facts, language))
        await asyncio.sleep(self.delay)
        return WeeklyRecapReply(recap=self.recap)


class FakeElevenLabs:
    """Stands in for AsyncElevenLabs: `.text_to_speech.stream(...)` yields two chunks."""

    def __init__(self):
        self.calls = 0
        self.text_to_speech = self

    async def stream(self, **kwargs):
        self.calls += 1
        for chunk in (b"ID3", b"-recap"):
            await asyncio.sleep(0.01)
            yield chunk


@pytest.fixture
def db(monkeypatch):
    """The overview the route reads. Tests replace db["overview"] to add sessions or red flags."""
    state = {"overview": overview(), "reads": 0}

    def load(patient_id):
        state["reads"] += 1
        return state["overview"]

    monkeypatch.setattr(weekly_recap_router, "load_overview", load)
    return state


@pytest.fixture
def client(monkeypatch, db):
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_EN", "voice-en")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_ES", "voice-es")
    tts_service._clips.clear()
    weekly_recap_service._recaps.clear()
    # Logged in as Maria (tests/test_auth_access.py covers the real rule against the database).
    app.dependency_overrides[require_patient_access] = lambda: CurrentUser("p-maria", "patient", "Maria Lopez", "es")
    # One event loop for the whole test, like uvicorn, so the voice started by
    # one request is still there when the next request reads it.
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def use_gemini(monkeypatch, fake=None, error=None) -> FakeGemini:
    def factory():
        if error:
            raise error
        return fake

    monkeypatch.setattr(weekly_recap_service, "get_gemini_service", factory)
    return fake


def use_elevenlabs(monkeypatch) -> FakeElevenLabs:
    fake = FakeElevenLabs()
    monkeypatch.setattr(tts_service, "_client", fake)
    return fake


def test_recap_is_written_from_the_last_7_days_voiced_and_cached(client, monkeypatch):
    gemini = use_gemini(monkeypatch, FakeGemini("Maria, hiciste 4 de 5 sesiones. ¡Sigue así!"))
    eleven = use_elevenlabs(monkeypatch)

    res = client.get(RECAP, params={"language": "es"}).json()
    assert res["text"] == "Maria, hiciste 4 de 5 sesiones. ¡Sigue así!"
    assert res["language"] == "es"
    assert res["is_fallback"] is False
    assert res["audio_url"].startswith("/api/v1/tts/")
    assert client.get(res["audio_url"]).content == b"ID3-recap"

    facts, language = gemini.calls[0]
    assert language == "es"
    assert (facts.sessions_7d, facts.times_per_week, facts.target) == (4, 5, 90)
    assert facts.angles_7d == [78, 80, 83, 86]  # whole degrees, oldest first; the 74° session is older than 7 days
    assert facts.red_flags_7d == []
    assert facts.measure == "deepest bend"

    # Opening the home screen again reuses the recap and its audio.
    again = client.get(RECAP, params={"language": "es"}).json()
    assert again == res
    assert len(gemini.calls) == 1
    assert eleven.calls == 1


def test_a_new_session_or_red_flag_gets_a_new_recap(client, db, monkeypatch):
    gemini = use_gemini(monkeypatch, FakeGemini("Habla con tu terapeuta."))
    use_elevenlabs(monkeypatch)

    client.get(RECAP, params={"language": "es"})
    db["overview"] = overview([session("s-5", 0, 88), *overview()["sessions"]])
    client.get(RECAP, params={"language": "es"})
    assert len(gemini.calls) == 2

    # A pain check-in lands just after its session: same latest session, new red flag.
    db["overview"] = overview([session("s-5", 0, 88), *overview()["sessions"]], [red_flag()])
    client.get(RECAP, params={"language": "es"})
    assert len(gemini.calls) == 3
    assert gemini.calls[-1][0].red_flags_7d == ["pain 8/10, “Dolor agudo”"]


def test_a_plan_change_gets_a_new_recap(client, db, monkeypatch):
    gemini = use_gemini(monkeypatch, FakeGemini("A 5° de tu meta de 90°."))
    use_elevenlabs(monkeypatch)

    client.get(RECAP, params={"language": "es"})
    # The therapist raises the target: the cached recap would still name 90°.
    raised = overview()
    raised["assignment"]["target_angle"] = 95.0
    db["overview"] = raised
    client.get(RECAP, params={"language": "es"})
    assert len(gemini.calls) == 2
    assert gemini.calls[-1][0].target == 95


def test_each_language_is_written_in_that_language(client, monkeypatch):
    gemini = use_gemini(monkeypatch, FakeGemini())
    use_elevenlabs(monkeypatch)

    assert client.get(RECAP, params={"language": "en"}).json()["language"] == "en"
    assert client.get(RECAP, params={"language": "es"}).json()["language"] == "es"
    assert [language for _, language in gemini.calls] == ["en", "es"]

    # Without a language, the patient's own (Maria's is Spanish), which is already cached.
    assert client.get(RECAP).json()["language"] == "es"
    assert len(gemini.calls) == 2

    assert client.get(RECAP, params={"language": "fr"}).status_code == 422


def test_gemini_down_falls_back_to_template(client, monkeypatch):
    use_gemini(monkeypatch, error=RuntimeError("quota"))
    use_elevenlabs(monkeypatch)

    res = client.get(RECAP, params={"language": "es"}).json()
    assert res["text"] == TEMPLATE_ES
    assert res["is_fallback"] is True
    assert res["audio_url"]  # the template is still voiced

    # The template isn't cached, so the next visit tries Gemini again.
    use_gemini(monkeypatch, FakeGemini("¡Buena semana, Maria!"))
    res = client.get(RECAP, params={"language": "es"}).json()
    assert (res["text"], res["is_fallback"]) == ("¡Buena semana, Maria!", False)


def test_slow_gemini_falls_back_to_template_and_keeps_its_recap_for_next_time(client, monkeypatch):
    monkeypatch.setattr(weekly_recap_service, "GEMINI_TIMEOUT_S", 0.05)
    gemini = use_gemini(monkeypatch, FakeGemini("¡Buena semana, Maria!", delay=0.3))
    use_elevenlabs(monkeypatch)

    res = client.get(RECAP, params={"language": "es"}).json()
    assert (res["text"], res["is_fallback"]) == (TEMPLATE_ES, True)

    time.sleep(0.4)  # Gemini finishes after the patient got the template...
    res = client.get(RECAP, params={"language": "es"}).json()
    assert (res["text"], res["is_fallback"]) == ("¡Buena semana, Maria!", False)  # ...and it's ready next time
    assert len(gemini.calls) == 1


def test_gemini_that_never_answers_is_given_up_on(client, monkeypatch):
    monkeypatch.setattr(weekly_recap_service, "GEMINI_TIMEOUT_S", 0.05)
    monkeypatch.setattr(weekly_recap_service, "GEMINI_GIVE_UP_S", 0.1)
    use_gemini(monkeypatch, FakeGemini(delay=5))
    use_elevenlabs(monkeypatch)

    assert client.get(RECAP, params={"language": "es"}).json()["is_fallback"] is True
    time.sleep(0.2)
    assert weekly_recap_service._writing == {}  # so the next visit asks Gemini again


def test_after_a_red_flag_the_recap_sends_the_patient_to_their_therapist(client, db, monkeypatch):
    db["overview"] = overview(red_flags=[red_flag(days_ago=1)])
    use_elevenlabs(monkeypatch)

    # Gemini cheering progress without a word about the therapist isn't used...
    use_gemini(monkeypatch, FakeGemini("Great progress, keep going!"))
    res = client.get(RECAP, params={"language": "en"}).json()
    assert res["is_fallback"] is True
    assert res["text"].endswith("You reported pain after a recent session, so please talk to your therapist before your next one.")

    # ...one that points them to their therapist is.
    use_gemini(monkeypatch, FakeGemini("You mentioned sharp pain, so check in with your therapist first."))
    res = client.get(RECAP, params={"language": "en"}).json()
    assert (res["text"], res["is_fallback"]) == ("You mentioned sharp pain, so check in with your therapist first.", False)


def test_no_sessions_yet_skips_gemini(client, db, monkeypatch):
    db["overview"] = overview(sessions=[])
    gemini = use_gemini(monkeypatch, FakeGemini())
    use_elevenlabs(monkeypatch)

    res = client.get(RECAP, params={"language": "en"}).json()
    assert res["text"] == "Your first session is waiting. Once it’s done, I’ll recap your week here."
    assert res["is_fallback"] is False
    assert gemini.calls == []


def test_no_elevenlabs_key_means_no_audio_url(client, monkeypatch):
    use_gemini(monkeypatch, FakeGemini())
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "")

    assert client.get(RECAP, params={"language": "en"}).json()["audio_url"] is None


def test_needs_a_login_that_can_see_the_patient(client, db, monkeypatch):
    gemini = use_gemini(monkeypatch, FakeGemini())
    app.dependency_overrides.pop(require_patient_access)

    assert client.get(RECAP).status_code == 401  # no token

    # Logged in as another patient: the database's can_view_patient says no.
    app.dependency_overrides[get_current_user] = lambda: CurrentUser("p-james", "patient", "James Carter", "en")
    monkeypatch.setattr(auth_deps, "can_view_patient", lambda viewer_id, patient_id: False)
    assert client.get(RECAP).status_code == 403

    assert db["reads"] == 0 and gemini.calls == []


def test_simultaneous_requests_share_one_gemini_call(monkeypatch):
    weekly_recap_service._recaps.clear()
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "")
    gemini = use_gemini(monkeypatch, FakeGemini(delay=0.05))

    async def two_tabs():
        o = overview()
        return await asyncio.gather(weekly_recap_service.weekly_recap(o, "es"), weekly_recap_service.weekly_recap(o, "es"))

    first, second = asyncio.run(two_tabs())
    assert first.text == second.text == "Buen trabajo, Maria."
    assert len(gemini.calls) == 1
