import os
import platform
import tempfile
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None

try:
    import mlx_whisper
except ImportError:
    mlx_whisper = None


WHISPER_MODEL = None
ALLOWED_AUDIO_SUFFIXES = {".webm", ".wav", ".mp3", ".m4a", ".ogg"}


def is_apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine() == "arm64"


def resolve_whisper_backend() -> str:
    backend = os.environ.get("WHISPER_BACKEND", "").strip().lower()
    if backend:
        return backend

    device = os.environ.get("WHISPER_DEVICE", "").strip().lower()
    if device == "mlx":
        return "mlx"

    if is_apple_silicon():
        return "mlx"

    return "faster-whisper"


def get_mlx_model_name(model_size: str) -> str:
    return os.environ.get("WHISPER_MODEL_REPO", f"mlx-community/whisper-{model_size}-mlx")


def get_whisper_model():
    global WHISPER_MODEL

    if WHISPER_MODEL is None:
        backend = resolve_whisper_backend()
        model_size = os.environ.get("WHISPER_MODEL_SIZE", "small")
        if backend == "mlx":
            if mlx_whisper is None:
                raise RuntimeError(
                    "mlx-whisper is not installed. Install backend requirements on Apple Silicon "
                    "or set WHISPER_BACKEND=faster-whisper to force the CPU/CUDA path."
                )
            WHISPER_MODEL = {
                "backend": "mlx",
                "model": get_mlx_model_name(model_size),
            }
        else:
            if WhisperModel is None:
                raise RuntimeError("faster-whisper is not installed")

            device = os.environ.get("WHISPER_DEVICE", "cpu")
            compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
            WHISPER_MODEL = {
                "backend": "faster-whisper",
                "model": WhisperModel(
                    model_size,
                    device=device,
                    compute_type=compute_type,
                ),
            }

    return WHISPER_MODEL


def normalize_audio_suffix(filename: str) -> str:
    suffix = Path(filename or "recording.webm").suffix.lower() or ".webm"
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        return ".webm"
    return suffix


def transcribe_audio_file(file_path: Path) -> str:
    whisper_model = get_whisper_model()

    if whisper_model["backend"] == "mlx":
        result = mlx_whisper.transcribe(
            str(file_path),
            path_or_hf_repo=whisper_model["model"],
            language="ar",
        )
        return result.get("text", "").strip()

    segments, _info = whisper_model["model"].transcribe(
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
