import os
import platform

from server import main


def is_apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine() == "arm64"


if is_apple_silicon():
    os.environ.setdefault("WHISPER_BACKEND", "mlx")
else:
    os.environ.setdefault("WHISPER_BACKEND", "faster-whisper")
    os.environ.setdefault("WHISPER_DEVICE", "cuda")
    os.environ.setdefault("WHISPER_COMPUTE_TYPE", "float16")


if __name__ == "__main__":
    main()
