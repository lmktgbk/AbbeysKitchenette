import re
import secrets
from fastapi import Header, HTTPException
from config import ML_SERVICE_KEY


def validate_service_key():
    if not re.fullmatch(r"[a-fA-F0-9]{64}", ML_SERVICE_KEY or ""):
        raise RuntimeError("ML_SERVICE_KEY must contain 64 hexadecimal characters")


async def require_service_key(key: str | None = Header(default=None, alias="X-ML-Service-Key")):
    try:
        validate_service_key()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Service unavailable") from None
    # Byte comparison also handles malformed non-ASCII headers without a server error.
    if key is None or not secrets.compare_digest(key.encode("utf-8"), ML_SERVICE_KEY.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Unauthorized")
