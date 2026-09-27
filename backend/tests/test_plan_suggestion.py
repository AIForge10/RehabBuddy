"""The therapist's plan suggestion, with Gemini, login and the database faked.

Most tests are about the guardrails: whatever Gemini proposes, a patient in pain
never gets a harder plan, the target moves at most 10° inside the exercise's range,
the exercise never changes, and thin data only ever holds.

Run from backend/:  python -m pytest tests/test_plan_suggestion.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from api.auth import CurrentUser, get_current_user
from api.core.config import settings
from api.data import plan_suggestion as route
from api.main import app
from api.schemas.plan_suggestion import PlanProposal
from api.services import plan_suggestion_service as service

URL = "/api/v1/patients/p-maria/plan-suggestion"
NOW = datetime(2026, 9, 26, 12, tzinfo=timezone.utc)


def session(n: int, days_ago: float, peak: float, pain=3, flagged=False, fade=1, joint_reps=10) -> dict:
    """A session as api/data/queries.py sessions() returns it, with its stats."""
    return {"id": f"s-{n}", "patient_id": "p-maria", "joint": "knee",
            "started_at": (NOW - timedelta(days=days_ago)).isoformat(), "reps_done": joint_reps,
            "max_angle": peak, "form_warnings": [], "duration_sec": 240, "pain_score": pain, "flagged": flagged,
            "stats": {"rep_peaks": [round(peak) - 1] * (joint_reps - 1) + [round(peak)], "fade": fade,
                      "end_range_sec": 6.0, "longest_hold_sec": 1.0}}


def climbing() -> list[dict]:
    """Maria's demo data: 74° → 86.5° over six sessions, newest first, pain ≤ 4."""
    return [session(6, 1, 86.5, pain=4), session(5, 2, 83.1), session(4, 4, 80.3, pain=2),
            session(3, 5, 78.7), session(2, 7, 76.1), session(1, 8, 74.0, pain=4)]


def reaching() -> list[dict]:
    """Reaches the 90° target in the last 3 sessions, pain ≤ 3."""
    return [session(6, 1, 90.4), session(5, 2, 89.0), session(4, 4, 91.2), session(3, 5, 86.0),
            session(2, 7, 84.0), session(1, 8, 82.0)]


def red_flag(session_id="s-6", days_ago=1.0, pain=8) -> dict:
    return {"session_id": session_id, "patient_id": "p-maria", "created_at": (NOW - timedelta(days=days_ago)).isoformat(),
            "pain_score": pain, "reason": "“Sharp, on the inside of the knee.”"}


def overview(sessions=None, red_flags=None, adherence=0.8, joint="knee", target=90.0, reps=10, weekly=5) -> dict:
    """The shape of q.overview(), most recent session first."""
    return {
        "patient": {"id": "p-maria", "full_name": "Maria Lopez", "language": "es",
                    "injury": "ACL reconstruction", "start_date": "2026-09-16"},
        "assignment": {"id": "a-p-maria", "patient_id": "p-maria", "therapist_id": "t-lee",
                       "exercise": {"id": f"ex-{joint}", "name": "Seated knee bends", "joint": joint, "instructions": ""},
                       "target_angle": target, "reps": reps, "times_per_week": weekly},
        "adherence_7d": adherence,
        "sessions": climbing() if sessions is None else sessions,
        "red_flags": red_flags or [],
        "latest_summary": None,
        "latest_summary_is_ai": False,
    }


def minutes(peaks=(84, 86, 85), tail=6) -> dict:
    """The newest session's rows from session_angle_1m: full minutes at 2 Hz, then a part-minute at rest."""
    rows = [{"max_angle": p, "avg_angle": 14.0, "samples": 120} for p in peaks]
    return {"s-6": rows + [{"max_angle": tail, "avg_angle": 4.5, "samples": 40}]}


def facts(o=None, mins=None):
    return service.plan_facts(o or overview(), mins or {}, NOW)


def proposal(action="progress", target=95, reps=10, weekly=5, rationale="Maria reached 90° in 2 of 3 sessions.",
             confidence="high") -> PlanProposal:
    return PlanProposal(action=action, target_angle=target, reps=reps, times_per_week=weekly,
                        rationale=rationale, confidence=confidence)


class FakeGemini:
    """Stands in for _ask_gemini: returns `answer`, or raises it if it's an exception."""

    def __init__(self, answer):
        self.answer, self.calls = answer, 0

    async def __call__(self, f):
        self.calls += 1
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


@pytest.fixture(autouse=True)
def fresh_cache():
    service._cache.clear()
    yield
    service._cache.clear()


def use_gemini(monkeypatch, answer) -> FakeGemini:
    fake = FakeGemini(answer)
    monkeypatch.setattr(service, "_ask_gemini", fake)
    return fake


def suggest(f):
    return asyncio.run(service.suggest(f))


# --- Facts -------------------------------------------------------------------

def test_facts_read_the_window_oldest_first_and_round_halves_up():
    f = facts(mins=minutes())
    assert [s.peak for s in f.recent] == [74, 76, 79, 80, 83, 87]  # 86.5 → 87, as the dashboard would
    assert f.sessions_7d == 4 and f.max_pain == 4 and f.red_flags == []
    assert f.target_min == 5 and f.target_max == 120


def test_facts_keep_only_the_full_minutes_from_the_continuous_aggregate():
    f = facts(mins=minutes(peaks=(84, 86, 85), tail=6))
    assert f.recent[-1].minute_peaks == [84, 86, 85]  # the 6° part-minute at the end is sitting still
    assert "≥ 84° every minute last session" in service.evidence(f)


def test_facts_count_a_recent_flag_from_another_exercise_but_not_an_old_one():
    recent_elsewhere = red_flag(session_id="s-hip-1", days_ago=2)
    old_elsewhere = red_flag(session_id="s-hip-0", days_ago=30)
    f = facts(overview(red_flags=[recent_elsewhere, old_elsewhere]))
    assert len(f.red_flags) == 1 and f.red_flags[0].startswith("pain 8/10 on Sep 24")
    assert f.max_pain == 8


# --- The rules ---------------------------------------------------------------

def test_rules_raise_the_target_once_it_is_reached():
    r = service.rule_suggestion(facts(overview(sessions=reaching())))
    assert r.action == "progress" and r.is_fallback
    assert r.proposed.target_angle == 95 and r.proposed.reps == 10 and r.proposed.times_per_week == 5
    assert r.proposed.joint == "knee"
    assert "3 of the last 3 sessions" in r.rationale and "95°" in r.rationale


def test_rules_hold_a_climbing_patient_below_the_target_and_say_when():
    r = service.rule_suggestion(facts())
    assert r.action == "hold" and r.proposed == r.current
    assert "74° to 87°" in r.rationale and "about 2 sessions away" in r.rationale


def test_rules_ease_off_after_a_red_flag():
    r = service.rule_suggestion(facts(overview(sessions=reaching(), red_flags=[red_flag()])))
    assert r.action == "regress" and r.proposed.target_angle == 85 and r.confidence == "high"
    assert "8/10" in r.rationale and "Sharp" in r.rationale


def test_rules_never_progress_with_pain_of_6():
    s = reaching()
    s[1]["pain_score"] = 6
    r = service.rule_suggestion(facts(overview(sessions=s)))
    assert r.action == "hold" and r.proposed == r.current and "6/10" in r.rationale


def test_rules_hold_on_thin_data():
    r = service.rule_suggestion(facts(overview(sessions=reaching()[:2])))
    assert r.action == "hold" and r.proposed == r.current and r.confidence == "low"
    assert r.rationale.startswith("Not enough data yet")


def test_rules_ease_off_after_a_red_flag_even_on_thin_data():
    r = service.rule_suggestion(facts(overview(sessions=reaching()[:1], red_flags=[red_flag()])))
    assert r.action == "regress" and r.proposed.target_angle == 85


def test_rules_hold_when_sessions_are_missed():
    r = service.rule_suggestion(facts(overview(sessions=reaching(), adherence=0.4)))
    assert r.action == "hold" and "2 of 5 planned sessions" in r.rationale


def test_rules_add_reps_when_peaks_stall_below_the_target():
    stalled = [session(4, 1, 81), session(3, 2, 80), session(2, 4, 82), session(1, 5, 80)]
    r = service.rule_suggestion(facts(overview(sessions=stalled)))
    assert r.action == "progress" and r.proposed.reps == 12 and r.proposed.target_angle == 90


def test_rules_hold_when_the_last_reps_fade():
    s = reaching()
    s[0]["stats"]["fade"], s[1]["stats"]["fade"] = 6, 7
    r = service.rule_suggestion(facts(overview(sessions=s)))
    assert r.action == "hold" and "7°" in r.rationale


def test_rules_stop_at_the_top_of_the_range():
    top = [session(3, 1, 120), session(2, 2, 119), session(1, 4, 120)]
    r = service.rule_suggestion(facts(overview(sessions=top, target=120)))
    assert r.action == "hold" and r.proposed.target_angle == 120


# --- Gemini, checked against the guardrails ----------------------------------

def test_a_sound_gemini_proposal_is_credited_to_gemini(monkeypatch):
    gemini = use_gemini(monkeypatch, proposal())
    r = suggest(facts(overview(sessions=reaching())))
    assert gemini.calls == 1
    assert r.action == "progress" and not r.is_fallback and r.guardrails == []
    assert r.proposed.target_angle == 95 and r.proposed.joint == "knee"
    assert r.current.target_angle == 90 and r.rationale == "Maria reached 90° in 2 of 3 sessions."


def test_gemini_cannot_progress_after_a_red_flag(monkeypatch):
    use_gemini(monkeypatch, proposal(target=95))
    r = suggest(facts(overview(sessions=reaching(), red_flags=[red_flag()])))
    assert r.action == "regress" and r.proposed.target_angle == 85 and r.is_fallback
    assert "red flag" in r.guardrails[0]


def test_gemini_cannot_add_load_under_a_regress_label_after_pain_of_6(monkeypatch):
    s = reaching()
    s[0]["pain_score"] = 6
    use_gemini(monkeypatch, proposal(action="regress", target=85, reps=12))
    r = suggest(facts(overview(sessions=s)))
    assert r.action == "hold" and r.proposed == r.current and r.is_fallback
    assert "6/10" in r.guardrails[0]


@pytest.mark.parametrize("target", [105, 75])
def test_gemini_cannot_move_the_target_more_than_10_degrees(monkeypatch, target):
    use_gemini(monkeypatch, proposal(action="progress" if target > 90 else "regress", target=target))
    r = suggest(facts(overview(sessions=reaching())))
    assert r.is_fallback and "more than 10°" in r.guardrails[0]
    assert abs(r.proposed.target_angle - 90) <= 10


def test_gemini_cannot_leave_the_exercises_range(monkeypatch):
    # Wrist lifts top out at 90°.
    use_gemini(monkeypatch, proposal(target=95))
    wrist = [session(3, 1, 85), session(2, 2, 86), session(1, 4, 85)]
    r = suggest(facts(overview(sessions=wrist, joint="wrist", target=85)))
    assert r.is_fallback and "range" in r.guardrails[0]
    assert r.proposed.target_angle <= 90 and r.proposed.joint == "wrist"


def test_gemini_cannot_raise_a_target_the_patient_is_far_from(monkeypatch):
    use_gemini(monkeypatch, proposal(target=95))
    far = [session(3, 1, 80), session(2, 2, 78), session(1, 4, 76)]
    r = suggest(facts(overview(sessions=far)))
    assert r.is_fallback and "latest peak is 80°" in r.guardrails[0] and r.proposed.target_angle == 90


def test_gemini_cannot_jump_reps_or_sessions(monkeypatch):
    use_gemini(monkeypatch, proposal(target=90, reps=20))
    assert suggest(facts(overview(sessions=reaching()))).is_fallback
    service._cache.clear()
    use_gemini(monkeypatch, proposal(target=90, weekly=8))
    assert suggest(facts(overview(sessions=reaching()))).is_fallback


def test_gemini_progress_that_changes_nothing_is_not_passed_off_as_progress(monkeypatch):
    use_gemini(monkeypatch, proposal(target=90))
    r = suggest(facts(overview(sessions=reaching())))
    assert r.is_fallback and "without changing the plan" in r.guardrails[0]


def test_a_gemini_hold_keeps_the_plan_exactly(monkeypatch):
    use_gemini(monkeypatch, proposal(action="hold", target=93, reps=11))
    r = suggest(facts())
    assert r.action == "hold" and not r.is_fallback and r.proposed == r.current


def test_a_sound_gemini_regress_is_kept(monkeypatch):
    use_gemini(monkeypatch, proposal(action="regress", target=85, rationale="Ease off."))
    r = suggest(facts(overview(red_flags=[red_flag()])))
    assert r.action == "regress" and not r.is_fallback and r.proposed.target_angle == 85


def test_thin_data_never_asks_gemini(monkeypatch):
    gemini = use_gemini(monkeypatch, proposal())
    r = suggest(facts(overview(sessions=reaching()[:2])))
    assert gemini.calls == 0 and r.action == "hold" and r.is_fallback


@pytest.mark.parametrize("answer", [RuntimeError("quota"), TimeoutError(), proposal(rationale="  ")])
def test_gemini_failing_falls_back_to_the_rules(monkeypatch, answer):
    use_gemini(monkeypatch, answer)
    r = suggest(facts(overview(sessions=reaching())))
    assert r.is_fallback and r.guardrails == [] and r.action == "progress" and r.proposed.target_angle == 95


def test_the_same_data_asks_gemini_once(monkeypatch):
    gemini = use_gemini(monkeypatch, proposal())
    suggest(facts(overview(sessions=reaching())))
    suggest(facts(overview(sessions=reaching())))
    assert gemini.calls == 1
    newer = [session(7, 0, 91.0)] + reaching()
    suggest(facts(overview(sessions=newer)))
    assert gemini.calls == 2


# --- The Gemini call itself: fallback model and timeouts ----------------------

class FakeModels:
    """Stands in for client.aio.models: each model name maps to "ok", "error" or "slow"."""

    def __init__(self, behaviour: dict):
        self.behaviour, self.calls = behaviour, []

    async def generate_content(self, model, contents, config):
        self.calls.append(model)
        how = self.behaviour[model]
        if how == "error":
            raise RuntimeError("404 NOT_FOUND")
        if how == "slow":
            await asyncio.sleep(5)
        return type("Response", (), {"text": proposal().model_dump_json()})()


def fake_client(monkeypatch, behaviour: dict) -> FakeModels:
    models = FakeModels(behaviour)
    client = type("Client", (), {"aio": type("Aio", (), {"models": models})()})()
    monkeypatch.setattr(service, "_client", lambda: client)
    monkeypatch.setattr(settings, "GEMINI_MODEL", "primary-model")
    return models


def test_a_failing_model_falls_back_to_flash_lite(monkeypatch):
    models = fake_client(monkeypatch, {"primary-model": "error", service.FALLBACK_MODEL: "ok"})
    p = asyncio.run(service._ask_gemini(facts()))
    assert p.target_angle == 95 and models.calls == ["primary-model", service.FALLBACK_MODEL]


def test_a_slow_model_leaves_time_for_the_fallback(monkeypatch):
    monkeypatch.setattr(service, "PRIMARY_TIMEOUT_S", 0.05)
    monkeypatch.setattr(service, "GEMINI_TIMEOUT_S", 0.5)
    models = fake_client(monkeypatch, {"primary-model": "slow", service.FALLBACK_MODEL: "ok"})
    p = asyncio.run(service._ask_gemini(facts()))
    assert p.action == "progress" and models.calls == ["primary-model", service.FALLBACK_MODEL]


def test_gemini_out_of_time_raises(monkeypatch):
    monkeypatch.setattr(service, "PRIMARY_TIMEOUT_S", 0.05)
    monkeypatch.setattr(service, "GEMINI_TIMEOUT_S", 0.1)
    fake_client(monkeypatch, {"primary-model": "slow", service.FALLBACK_MODEL: "slow"})
    with pytest.raises(TimeoutError):
        asyncio.run(service._ask_gemini(facts()))


# --- The route ---------------------------------------------------------------

def login_as(user: CurrentUser):
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture
def client(monkeypatch):
    # Maria's therapist is logged in (tests/test_auth_access.py covers the real rule against the database).
    login_as(CurrentUser("t-lee", "therapist", "Dr. Sarah Lee", "en"))
    monkeypatch.setattr(route, "can_view_patient", lambda viewer, patient: viewer == "t-lee")
    monkeypatch.setattr(service, "load_facts", lambda patient_id: facts(overview(sessions=reaching())))
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_the_route_returns_the_suggestion(client, monkeypatch):
    use_gemini(monkeypatch, proposal())
    res = client.post(URL)
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "progress" and body["is_fallback"] is False
    assert body["current"] == {"joint": "knee", "target_angle": 90.0, "reps": 10, "times_per_week": 5}
    assert body["proposed"] == {"joint": "knee", "target_angle": 95.0, "reps": 10, "times_per_week": 5}
    assert body["evidence"] and body["guardrails"] == []


def test_patients_cannot_ask_for_suggestions(client):
    login_as(CurrentUser("p-maria", "patient", "Maria Lopez", "es"))
    assert client.post(URL).status_code == 403


def test_other_therapists_cannot_ask(client):
    login_as(CurrentUser("t-other", "therapist", "Dr. Other", "en"))
    assert client.post(URL).status_code == 403


def test_a_patient_without_a_plan_is_404(client, monkeypatch):
    monkeypatch.setattr(service, "load_facts", lambda patient_id: None)
    assert client.post(URL).status_code == 404


def test_dates_are_the_clinics_calendar_day_not_utc(monkeypatch):
    # 10:14 PM in Miami on Sep 26 is already Sep 27 on the server's UTC clock.
    monkeypatch.setattr(settings, "CLINIC_TIMEZONE", "America/New_York")
    assert service._day("2026-09-27T02:14:00+00:00") == "Sep 26"
    monkeypatch.setattr(settings, "CLINIC_TIMEZONE", "UTC")
    assert service._day("2026-09-27T02:14:00+00:00") == "Sep 27"
