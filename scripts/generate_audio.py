"""Pre-generate the voice coach's fixed cue clips with ElevenLabs.

Writes frontend/public/audio/{lang}/{clip}.mp3 for every cue line in
frontend/src/lib/coach.ts, which plays them during a live session (a missing
clip is read by the browser's speech synthesis instead). Only new or changed
lines are generated, so re-running is cheap: audio_lines.json next to this
script records the text, voice and model each clip was made from.

Run from the repo root. Needs `npm install` in frontend/ and the ElevenLabs
key and voice IDs in .env:
    python scripts/generate_audio.py            # generate what's missing or changed
    python scripts/generate_audio.py --dry-run  # list it without calling ElevenLabs
    python scripts/generate_audio.py --force    # regenerate everything
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
AUDIO_DIR = FRONTEND / "public" / "audio"
LEDGER = Path(__file__).with_name("audio_lines.json")

# Made ahead of time, so quality over latency (live replies use eleven_flash_v2_5).
DEFAULT_MODEL = "eleven_multilingual_v2"
OUTPUT_FORMAT = "mp3_44100_128"


def cue_lines() -> list[dict]:
    out = subprocess.run(["node", "scripts/cue-lines.mjs"], cwd=FRONTEND, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"Couldn't read the cue lines from the frontend:\n{out.stderr}")
    return json.loads(out.stdout)


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-generate the voice coach's cue clips with ElevenLabs.")
    parser.add_argument("--dry-run", action="store_true", help="list the clips that would be generated")
    parser.add_argument("--force", action="store_true", help="regenerate every clip")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"ElevenLabs model id (default {DEFAULT_MODEL})")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    voices = {"en": os.getenv("ELEVENLABS_VOICE_ID_EN", ""), "es": os.getenv("ELEVENLABS_VOICE_ID_ES", "")}
    ledger = json.loads(LEDGER.read_text()) if LEDGER.exists() else {}

    todo = []
    for line in cue_lines():
        key = f"{line['lang']}/{line['clip']}"
        path = AUDIO_DIR / f"{key}.mp3"
        source = {"text": line["text"], "voice": voices[line["lang"]], "model": args.model}
        if args.force or not path.exists() or ledger.get(key) != source:
            todo.append((key, path, source))

    if not todo:
        print("All cue clips are up to date.")
        return
    for key, _, source in todo:
        print(f"{key:<24} {source['text']}")
    if args.dry_run:
        print(f"\n{len(todo)} clip(s) would be generated.")
        return

    api_key = os.getenv("ELEVENLABS_API_KEY")
    missing = [] if api_key else ["ELEVENLABS_API_KEY"]
    missing += sorted({f"ELEVENLABS_VOICE_ID_{key.split('/')[0].upper()}" for key, _, source in todo if not source["voice"]})
    if missing:
        sys.exit(f"\nMissing in .env: {', '.join(missing)}")

    from elevenlabs.client import ElevenLabs

    client = ElevenLabs(api_key=api_key)
    for i, (key, path, source) in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {key}")
        audio = client.text_to_speech.convert(
            source["voice"], text=source["text"], model_id=args.model, output_format=OUTPUT_FORMAT
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"".join(audio))
        ledger[key] = source
        # Saved after every clip, so an interrupted run picks up where it stopped.
        LEDGER.write_text(json.dumps(ledger, indent=2, ensure_ascii=False, sort_keys=True) + "\n")

    print(f"\nGenerated {len(todo)} clip(s) in {AUDIO_DIR.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
