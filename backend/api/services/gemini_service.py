from google import genai
from google.genai.types import GenerateContentConfig, AutomaticFunctionCallingConfig
from fastapi import HTTPException, status
from api.core.config import settings
from api.schemas.summary import SessionSummaryRequest, SessionSummaryResponse
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