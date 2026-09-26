from typing import Optional

from google import genai
from google.genai.types import GenerateContentConfig, AutomaticFunctionCallingConfig, ThinkingConfig
from fastapi import HTTPException, status
from api.core.config import settings
from api.schemas.pain_check import PainCheckReply, PainCheckRequest
from api.schemas.summary import SessionSummaryRequest, SessionSummaryResponse
from api.prompts import pain_check as pain_check_prompt
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
        cfg = GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=SessionSummaryResponse,
            temperature=0.25,
            automatic_function_calling=AutomaticFunctionCallingConfig(disable=True)
        )
        models_to_try = [self.model]
        if self.model != "gemini-3.5-flash-lite":
            models_to_try.append("gemini-3.5-flash-lite")

        last_exc = None
        for m in models_to_try:
            try:
                response = await self.client.aio.models.generate_content(
                    model=m,
                    contents=prompt,
                    config=cfg,
                )
                if response.text:
                    return SessionSummaryResponse.model_validate_json(response.text)
            except Exception as e:
                last_exc = e
                continue

        if last_exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Gemini generation failed: {str(last_exc)}",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Empty response received from Gemini API.",
        )

    async def generate_pain_reply(self, data: PainCheckRequest, rule_reason: Optional[str]) -> PainCheckReply:
        """The coach's spoken reply to a pain check-in. Raises on any failure; the caller falls back."""
        cfg = GenerateContentConfig(
            system_instruction=pain_check_prompt.SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=PainCheckReply,
            temperature=0.4,
            max_output_tokens=1024,
            thinking_config=ThinkingConfig(thinking_level=settings.GEMINI_THINKING_LEVEL.upper()),
            automatic_function_calling=AutomaticFunctionCallingConfig(disable=True),
        )
        models_to_try = [self.model]
        if self.model != "gemini-3.5-flash-lite":
            models_to_try.append("gemini-3.5-flash-lite")

        last_exc = None
        for m in models_to_try:
            try:
                response = await self.client.aio.models.generate_content(
                    model=m,
                    contents=pain_check_prompt.build_pain_check_prompt(data.pain_score, data.notes, data.language, rule_reason),
                    config=cfg,
                )
                if response.text:
                    return PainCheckReply.model_validate_json(response.text)
            except Exception as e:
                last_exc = e
                continue

        if last_exc:
            raise last_exc
        raise ValueError("Empty response received from Gemini API.")