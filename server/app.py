import os
import secrets
import shutil
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS
from PIL import Image, UnidentifiedImageError
from werkzeug.utils import secure_filename

APP_PORT = int(os.getenv("PORT", "25534"))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads")).resolve()
DB_PATH = Path(os.getenv("METADATA_DB_PATH", "./data/metadata.db")).resolve()
UPLOAD_TOKEN = os.getenv("UPLOAD_TOKEN", "").strip()
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip()
ALLOW_ORIGINS = os.getenv("ALLOW_ORIGINS", "*").strip()
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "5"))
ALLOWED_EXTENSIONS = {
    ext.strip().lower()
    for ext in os.getenv("ALLOWED_EXTENSIONS", "jpg,jpeg,png,webp,gif").split(",")
    if ext.strip()
}
MAX_FILES_PER_FORM = int(os.getenv("MAX_FILES_PER_FORM", "5000"))
MAX_BYTES_PER_FORM = int(os.getenv("MAX_BYTES_PER_FORM", str(5 * 1024 * 1024 * 1024)))

COMPRESS_AFTER_DAYS = int(os.getenv("COMPRESS_AFTER_DAYS", "7"))
COMPRESSION_INTERVAL_SECONDS = int(os.getenv("COMPRESSION_INTERVAL_SECONDS", "3600"))
COMPRESSION_BATCH_SIZE = int(os.getenv("COMPRESSION_BATCH_SIZE", "100"))
COMPRESSION_MIN_SAVINGS_BYTES = int(os.getenv("COMPRESSION_MIN_SAVINGS_BYTES", "4096"))
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "72"))
WEBP_QUALITY = int(os.getenv("WEBP_QUALITY", "70"))
CLOSED_FORM_IDS = {
    form_id.strip() for form_id in os.getenv("CLOSED_FORM_IDS", "").split(",") if form_id.strip()
}

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

if ALLOW_ORIGINS == "*":
    CORS(app)
else:
    CORS(app, origins=[origin.strip() for origin in ALLOW_ORIGINS.split(",") if origin.strip()])

stop_event = threading.Event()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def get_db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS forms (
              form_id TEXT PRIMARY KEY,
              is_closed INTEGER NOT NULL DEFAULT 0,
              closed_at TEXT,
              updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS uploads (
              file_key TEXT PRIMARY KEY,
              form_id TEXT,
              uploader_id TEXT,
              original_name TEXT,
              extension TEXT NOT NULL,
              mime_type TEXT,
              size_bytes INTEGER NOT NULL,
              original_size_bytes INTEGER,
              created_at TEXT NOT NULL,
              compressed_at TEXT,
              is_compressed INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_uploads_form_id ON uploads(form_id)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_uploads_deleted ON uploads(deleted_at)"
        )
        connection.commit()


def seed_closed_forms() -> None:
    if not CLOSED_FORM_IDS:
        return

    for form_id in CLOSED_FORM_IDS:
        set_form_status(form_id, True)


def require_upload_token() -> None:
    if not UPLOAD_TOKEN:
        return

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        abort(401, description="Missing bearer token")

    token = auth_header.removeprefix("Bearer ").strip()
    if token != UPLOAD_TOKEN:
        abort(401, description="Invalid bearer token")


def make_public_url(file_key: str) -> str:
    if PUBLIC_BASE_URL:
        return f"{PUBLIC_BASE_URL.rstrip('/')}/files/{file_key}"
    return f"{request.host_url.rstrip('/')}/files/{file_key}"


def sanitize_file_key(file_key: str) -> str:
    normalized = Path(file_key).as_posix().lstrip("/")
    if ".." in normalized:
        abort(400, description="Invalid file key")
    return normalized


def sanitize_form_id(form_id: str) -> str:
    trimmed = form_id.strip()
    if not trimmed:
        abort(400, description="form_id cannot be empty")
    if len(trimmed) > 128:
        abort(400, description="form_id too long")
    return trimmed


def set_form_status(form_id: str, is_closed: bool) -> None:
    sanitized_form_id = sanitize_form_id(form_id)
    now_iso = utc_now_iso()
    closed_at = now_iso if is_closed else None

    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT INTO forms(form_id, is_closed, closed_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(form_id) DO UPDATE SET
              is_closed = excluded.is_closed,
              closed_at = excluded.closed_at,
              updated_at = excluded.updated_at
            """,
            (sanitized_form_id, 1 if is_closed else 0, closed_at, now_iso),
        )
        connection.commit()


def get_form_status(form_id: str) -> dict[str, Any]:
    sanitized_form_id = sanitize_form_id(form_id)
    with get_db_connection() as connection:
        row = connection.execute(
            "SELECT form_id, is_closed, closed_at, updated_at FROM forms WHERE form_id = ?",
            (sanitized_form_id,),
        ).fetchone()

    if row is None:
        return {
            "form_id": sanitized_form_id,
            "is_closed": False,
            "closed_at": None,
            "updated_at": None,
            "exists": False,
        }

    return {
        "form_id": row["form_id"],
        "is_closed": bool(row["is_closed"]),
        "closed_at": row["closed_at"],
        "updated_at": row["updated_at"],
        "exists": True,
    }


def register_upload(
    file_key: str,
    form_id: str | None,
    uploader_id: str | None,
    original_name: str,
    extension: str,
    mime_type: str | None,
    size_bytes: int,
) -> None:
    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO uploads(
              file_key, form_id, uploader_id, original_name, extension, mime_type,
              size_bytes, original_size_bytes, created_at, compressed_at, is_compressed, deleted_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 0, NULL)
            """,
            (
                file_key,
                form_id,
                uploader_id,
                original_name,
                extension,
                mime_type,
                size_bytes,
                utc_now_iso(),
            ),
        )
        connection.commit()


def mark_upload_deleted(file_key: str) -> None:
    with get_db_connection() as connection:
        connection.execute(
            "UPDATE uploads SET deleted_at = ? WHERE file_key = ?",
            (utc_now_iso(), file_key),
        )
        connection.commit()


def get_form_usage(form_id: str) -> tuple[int, int]:
    with get_db_connection() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS files_count, COALESCE(SUM(size_bytes), 0) AS total_bytes
            FROM uploads
            WHERE form_id = ? AND deleted_at IS NULL
            """,
            (form_id,),
        ).fetchone()

    return int(row["files_count"] or 0), int(row["total_bytes"] or 0)


def enforce_form_quota(form_id: str | None, incoming_size: int) -> None:
    if not form_id:
        return

    files_count, total_bytes = get_form_usage(form_id)
    if files_count >= MAX_FILES_PER_FORM:
        abort(
            429,
            description=f"Form quota exceeded: max {MAX_FILES_PER_FORM} files per form",
        )
    if total_bytes + incoming_size > MAX_BYTES_PER_FORM:
        abort(
            429,
            description=f"Form quota exceeded: max {MAX_BYTES_PER_FORM} bytes per form",
        )


def compress_image_in_place(file_path: Path, extension: str) -> tuple[int, str]:
    original_size = file_path.stat().st_size
    temp_path = file_path.with_suffix(file_path.suffix + ".compressing")

    try:
        with Image.open(file_path) as image:
            ext = extension.lower()

            if ext in {"jpg", "jpeg"}:
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")
                image.save(
                    temp_path,
                    format="JPEG",
                    quality=JPEG_QUALITY,
                    optimize=True,
                    progressive=True,
                )
            elif ext == "png":
                if image.mode in ("RGBA", "LA"):
                    image.save(temp_path, format="PNG", optimize=True, compress_level=9)
                else:
                    quantized = image.convert("P", palette=Image.ADAPTIVE, colors=256)
                    quantized.save(temp_path, format="PNG", optimize=True, compress_level=9)
            elif ext == "webp":
                image.save(temp_path, format="WEBP", quality=WEBP_QUALITY, method=6)
            else:
                return 0, "unsupported_extension"
    except UnidentifiedImageError:
        if temp_path.exists():
            temp_path.unlink()
        return 0, "not_an_image"
    except Exception:
        if temp_path.exists():
            temp_path.unlink()
        return 0, "compression_failed"

    compressed_size = temp_path.stat().st_size if temp_path.exists() else original_size
    bytes_saved = original_size - compressed_size

    if bytes_saved >= COMPRESSION_MIN_SAVINGS_BYTES:
        temp_path.replace(file_path)
        return bytes_saved, "compressed"

    temp_path.unlink(missing_ok=True)
    return 0, "no_saving"


def compress_old_files_for_closed_forms() -> dict[str, int]:
    threshold_iso = (utc_now() - timedelta(days=COMPRESS_AFTER_DAYS)).isoformat()
    stats = {"scanned": 0, "compressed": 0, "skipped": 0, "missing": 0}

    with get_db_connection() as connection:
        rows = connection.execute(
            """
            SELECT u.file_key, u.extension, u.size_bytes
            FROM uploads u
            INNER JOIN forms f ON f.form_id = u.form_id
            WHERE u.deleted_at IS NULL
              AND u.is_compressed = 0
              AND f.is_closed = 1
              AND u.created_at <= ?
            ORDER BY u.created_at ASC
            LIMIT ?
            """,
            (threshold_iso, COMPRESSION_BATCH_SIZE),
        ).fetchall()

    for row in rows:
        stats["scanned"] += 1
        file_key = row["file_key"]
        extension = row["extension"]
        current_size = int(row["size_bytes"] or 0)
        file_path = (UPLOAD_DIR / file_key).resolve()

        if not file_path.exists():
            mark_upload_deleted(file_key)
            stats["missing"] += 1
            continue

        bytes_saved, status = compress_image_in_place(file_path, extension)
        new_size = file_path.stat().st_size

        with get_db_connection() as connection:
            if status == "compressed":
                connection.execute(
                    """
                    UPDATE uploads
                    SET size_bytes = ?,
                        original_size_bytes = COALESCE(original_size_bytes, ?),
                        is_compressed = 1,
                        compressed_at = ?
                    WHERE file_key = ?
                    """,
                    (new_size, current_size, utc_now_iso(), file_key),
                )
                stats["compressed"] += 1
            elif status in {"unsupported_extension", "not_an_image", "no_saving"}:
                connection.execute(
                    """
                    UPDATE uploads
                    SET is_compressed = 1,
                        compressed_at = ?
                    WHERE file_key = ?
                    """,
                    (utc_now_iso(), file_key),
                )
                stats["skipped"] += 1
            connection.commit()

    return stats


def compression_worker() -> None:
    while not stop_event.is_set():
        try:
            compress_old_files_for_closed_forms()
        except Exception as error:
            print(f"[compression-worker] error: {error}")

        stop_event.wait(COMPRESSION_INTERVAL_SECONDS)


@app.get("/health")
def healthcheck():
    disk_usage = shutil.disk_usage(UPLOAD_DIR)
    return jsonify(
        {
            "ok": True,
            "storage_path": str(UPLOAD_DIR),
            "db_path": str(DB_PATH),
            "max_upload_mb": MAX_UPLOAD_MB,
            "allowed_extensions": sorted(ALLOWED_EXTENSIONS),
            "disk_free_bytes": disk_usage.free,
            "disk_total_bytes": disk_usage.total,
            "compress_after_days": COMPRESS_AFTER_DAYS,
            "compression_interval_seconds": COMPRESSION_INTERVAL_SECONDS,
            "max_files_per_form": MAX_FILES_PER_FORM,
            "max_bytes_per_form": MAX_BYTES_PER_FORM,
        }
    )


@app.post("/upload")
def upload_file():
    require_upload_token()

    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "Missing file field"}), 400

    form_id = request.form.get("form_id", "").strip() or None
    uploader_id = request.form.get("uploader_id", "").strip() or None

    if form_id is not None:
        form_id = sanitize_form_id(form_id)

    original_name = secure_filename(file.filename or "")
    if not original_name:
        return jsonify({"error": "Invalid file name"}), 400

    suffix = Path(original_name).suffix.lower().removeprefix(".")
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Unsupported extension: {suffix}"}), 400

    scope_prefix = form_id or "unassigned"
    date_prefix = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    destination_dir = UPLOAD_DIR / scope_prefix / date_prefix
    destination_dir.mkdir(parents=True, exist_ok=True)

    unique_name = f"{secrets.token_hex(16)}.{suffix}"
    destination_path = destination_dir / unique_name
    file.save(destination_path)

    file_size = destination_path.stat().st_size
    try:
        enforce_form_quota(form_id, file_size)
    except Exception:
        destination_path.unlink(missing_ok=True)
        raise

    file_key = f"{scope_prefix}/{date_prefix}/{unique_name}"
    register_upload(
        file_key=file_key,
        form_id=form_id,
        uploader_id=uploader_id,
        original_name=original_name,
        extension=suffix,
        mime_type=file.mimetype,
        size_bytes=file_size,
    )

    return (
        jsonify(
            {
                "url": make_public_url(file_key),
                "key": file_key,
                "size_bytes": file_size,
                "form_id": form_id,
            }
        ),
        201,
    )


@app.get("/forms/<form_id>/status")
def get_form_status_endpoint(form_id: str):
    require_upload_token()
    return jsonify(get_form_status(form_id))


@app.post("/forms/<form_id>/close")
def close_form_endpoint(form_id: str):
    require_upload_token()
    set_form_status(form_id, True)
    return jsonify(get_form_status(form_id))


@app.post("/forms/<form_id>/open")
def open_form_endpoint(form_id: str):
    require_upload_token()
    set_form_status(form_id, False)
    return jsonify(get_form_status(form_id))


@app.post("/maintenance/compress-now")
def compress_now_endpoint():
    require_upload_token()
    stats = compress_old_files_for_closed_forms()
    return jsonify({"ok": True, "stats": stats})


@app.delete("/files/<path:file_key>")
def delete_file(file_key: str):
    require_upload_token()

    normalized_key = sanitize_file_key(file_key)
    file_path = (UPLOAD_DIR / normalized_key).resolve()
    upload_root = UPLOAD_DIR.resolve()

    if not str(file_path).startswith(str(upload_root)):
        return jsonify({"error": "Invalid file path"}), 400

    if file_path.exists():
        file_path.unlink()
        mark_upload_deleted(normalized_key)
        return jsonify({"deleted": True, "key": normalized_key})

    mark_upload_deleted(normalized_key)
    return jsonify({"deleted": False, "key": normalized_key}), 404


@app.get("/files/<path:file_key>")
def serve_file(file_key: str):
    normalized_key = sanitize_file_key(file_key)
    return send_from_directory(UPLOAD_DIR, normalized_key, as_attachment=False)


@app.errorhandler(413)
def payload_too_large(_error):
    return jsonify({"error": f"File is too large. Max allowed: {MAX_UPLOAD_MB}MB"}), 413


@app.errorhandler(429)
def too_many_requests(error):
    description = getattr(error, "description", "Too many requests")
    return jsonify({"error": str(description)}), 429


@app.errorhandler(401)
def unauthorized(error):
    return jsonify({"error": str(error.description)}), 401


@app.errorhandler(400)
def bad_request(error):
    description = getattr(error, "description", "Bad request")
    return jsonify({"error": str(description)}), 400


def start_background_workers() -> None:
    worker = threading.Thread(target=compression_worker, name="compression-worker", daemon=True)
    worker.start()


init_db()
seed_closed_forms()
start_background_workers()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=APP_PORT)
