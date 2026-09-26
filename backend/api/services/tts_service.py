"""ElevenLabs voice for lines the backend writes (the pain-check reply).

`start()` begins synthesis as soon as the text exists and returns a clip id.
The browser then GETs /tts/{id} and plays the audio while it is still arriving,
so by the time it asks, the first chunks are usually already here. Clips stay
in memory keyed by voice + text, so a line said again is replayed without
spending credits.
"""
import asyncio
import hashlib
import logging
from collections import OrderedDict
from typing import AsyncIterator, Optional

from elevenlabs.client import AsyncElevenLabs

from api.core.config import settings

log = logging.getLogger(__name__)

OUTPUT_FORMAT = "mp3_44100_64"  # plenty for speech, half the bytes of 128k
MAX_CLIPS = 200  # short replies are ~40 KB each


class Clip:
    """One line's audio, readable by any number of listeners while it is still being generated."""

    def __init__(self) -> None:
        self.chunks: list[bytes] = []
        self.done = False
        self.failed = False
        self._changed = asyncio.Event()

    def _notify(self) -> None:
        # Wake everyone waiting on the current event, then hand out a fresh one.
        self._changed.set()
        self._changed = asyncio.Event()

    def push(self, chunk: bytes) -> None:
        self.chunks.append(chunk)
        self._notify()

    def finish(self, failed: bool = False) -> None:
        self.done = True
        self.failed = failed
        self._notify()

    async def started(self) -> None:
        """Wait for the first chunk, or for the end if synthesis failed before producing any."""
        while True:
            changed = self._changed
            if self.chunks or self.done:
                return
            await changed.wait()

    async def stream(self) -> AsyncIterator[bytes]:
        i = 0
        while True:
            changed = self._changed
            while i < len(self.chunks):
                yield self.chunks[i]
                i += 1
            if self.done:
                return
            await changed.wait()


class TTSService:
    def __init__(self) -> None:
        self._clips: OrderedDict[str, Clip] = OrderedDict()
        self._tasks: set[asyncio.Task] = set()
        self._client: Optional[AsyncElevenLabs] = None

    def start(self, text: str, language: str) -> Optional[str]:
        """Begin voicing `text`; returns its clip id, or None when ElevenLabs isn't configured."""
        voice = settings.ELEVENLABS_VOICE_ID_ES if language == "es" else settings.ELEVENLABS_VOICE_ID_EN
        if not (settings.ELEVENLABS_API_KEY and voice):
            return None

        clip_id = hashlib.sha256(f"{settings.ELEVENLABS_MODEL}|{voice}|{text}".encode()).hexdigest()[:24]
        cached = self._clips.get(clip_id)
        if cached and not cached.failed:
            self._clips.move_to_end(clip_id)
            return clip_id

        clip = Clip()
        self._clips[clip_id] = clip
        while len(self._clips) > MAX_CLIPS:
            self._clips.popitem(last=False)
        task = asyncio.create_task(self._synthesize(clip, text, voice))
        self._tasks.add(task)  # keep a reference so the task isn't garbage-collected mid-stream
        task.add_done_callback(self._tasks.discard)
        return clip_id

    def get(self, clip_id: str) -> Optional[Clip]:
        return self._clips.get(clip_id)

    async def _synthesize(self, clip: Clip, text: str, voice: str) -> None:
        try:
            if self._client is None:
                self._client = AsyncElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
            async for chunk in self._client.text_to_speech.stream(
                voice_id=voice,
                text=text,
                model_id=settings.ELEVENLABS_MODEL,
                output_format=OUTPUT_FORMAT,
            ):
                if chunk:
                    clip.push(chunk)
        except Exception:
            log.exception("ElevenLabs synthesis failed")
            clip.finish(failed=True)
        else:
            clip.finish()


tts_service = TTSService()
