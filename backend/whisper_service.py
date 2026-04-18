import os
import tempfile
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None


WHISPER_MODEL = None
ALLOWED_AUDIO_SUFFIXES = {".webm", ".wav", ".mp3", ".m4a", ".ogg"}


def get_whisper_model():
    global WHISPER_MODEL

    if WhisperModel is None:
        raise RuntimeError("faster-whisper is not installed")

    if WHISPER_MODEL is None:
        model_size = os.environ.get("WHISPER_MODEL_SIZE", "small")
        device = os.environ.get("WHISPER_DEVICE", "cpu")
        compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
        WHISPER_MODEL = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
        )

    return WHISPER_MODEL


def normalize_audio_suffix(filename: str) -> str:
    suffix = Path(filename or "recording.webm").suffix.lower() or ".webm"
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        return ".webm"
    return suffix


def transcribe_audio_file(file_path: Path) -> str:
    model = get_whisper_model()
    segments, _info = model.transcribe(
        str(file_path),
        language="ar",
        task="transcribe",
        vad_filter=True,
        beam_size=5,
    )
    transcript_parts = [segment.text.strip() for segment in segments if segment.text.strip()]
    return " ".join(transcript_parts).strip()


def transcribe_audio_bytes(audio_bytes: bytes, filename: str) -> str:
    temp_path = None
    try:
        suffix = normalize_audio_suffix(filename)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = Path(temp_file.name)

        return transcribe_audio_file(temp_path)
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()
