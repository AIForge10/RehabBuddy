from typing import Optional

from google import genai
from google.genai.types import GenerateContentConfig, AutomaticFunctionCallingConfig, ThinkingConfig
from fastapi import HTTPException, status
from api.core.config import settings
from api.schemas.pain_check import PainCheckReply, PainCheckRequest
from api.schemas.summary import SessionSummaryRequest, SessionSummaryResponse
from api.schemas.weekly_recap import RecapFacts, WeeklyRecapReply
from api.prompts import pain_check as pain_check_prompt
from api.prompts import weekly_recap as weekly_recap_prompt
from api.prompts.summary import SYSTEM_INSTRUCTION, build_summary_prompt


class GeminiService:
    def __init__(self):
        if not settings.GEMINI_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GEMINI_API_KEY is not configured in backend settings.",
            )
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.model = settings.GEMINI_MODEL

    async def generate_session_summary(self, data: SessionSummaryRequest) -> SessionSummaryResponse:
        prompt = build_summary_prompt(data.model_dump_json(indent=2))
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=SessionSummaryResponse,
                    temperature=0.25,
                    automatic_function_calling=AutomaticFunctionCallingConfig(disable=True)
                ),
            )

            if not response.text:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Empty response received from Gemini API.",
                )

            return SessionSummaryResponse.model_validate_json(response.text)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Gemini generation failed: {str(e)}",
            )

    async def generate_pain_reply(self, data: PainCheckRequest, rule_reason: Optional[str]) -> PainCheckReply:
        """The coach's spoken reply to a pain check-in. Raises on any failure; the caller falls back."""
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=pain_check_prompt.build_pain_check_prompt(data.pain_score, data.notes, data.language, rule_reason),
            config=GenerateContentConfig(
                system_instruction=pain_check_prompt.SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=PainCheckReply,
                temperature=0.4,
                max_output_tokens=1024,  # counts any thinking tokens too; the reply itself is ~60
                # The patient is waiting to hear this, so keep thinking to a minimum.
                thinking_config=ThinkingConfig(thinking_level=settings.GEMINI_THINKING_LEVEL.upper()),
                automatic_function_calling=AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        if not response.text:
            raise ValueError("Empty response received from Gemini API.")
        return PainCheckReply.model_validate_json(response.text)

    async def generate_weekly_recap(self, facts: RecapFacts, language: str) -> WeeklyRecapReply:
        """The coach's spoken recap of the patient's last 7 days. Raises on any failure; the caller falls back."""
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=weekly_recap_prompt.build_weekly_recap_prompt(facts, language),
            config=GenerateContentConfig(
                system_instruction=weekly_recap_prompt.SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=WeeklyRecapReply,
                temperature=0.5,
                max_output_tokens=1024,  # counts any thinking tokens too; the recap itself is ~100
                thinking_config=ThinkingConfig(thinking_level=settings.GEMINI_THINKING_LEVEL.upper()),
                automatic_function_calling=AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        if not response.text:
            raise ValueError("Empty response received from Gemini API.")
        return WeeklyRecapReply.model_validate_json(response.text)
