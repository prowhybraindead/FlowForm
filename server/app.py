import atexit
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from platform import machine
from typing import Any
from urllib.request import urlretrieve

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS
from PIL import Image, UnidentifiedImageError
from werkzeug.utils import secure_filename


def load_local_env_files() -> None:
    """Load simple KEY=VALUE lines from local .env files when process env is missing."""
    for file_name in (".env.local", ".env"):
        env_path = Path(file_name)
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()

            if not key:
                continue

            if len(value) >= 2 and (
                (value.startswith('"') and value.endswith('"'))
                or (value.startswith("'") and value.endswith("'"))
            ):
                value = value[1:-1]

            os.environ.setdefault(key, value)


load_local_env_files()

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
USE_CLOUDFLARE_TUNNEL = os.getenv("USE_CLOUDFLARE_TUNNEL", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
TUNNEL_REQUIRED = os.getenv("TUNNEL_REQUIRED", "0").strip().lower() in {"1", "true", "yes", "on"}
TUNNEL_CONFIG_PATH = Path(os.getenv("TUNNEL_CONFIG_PATH", "./cloudflared/config.yml")).resolve()
TUNNEL_METRICS = os.getenv("TUNNEL_METRICS", "127.0.0.1:60123").strip()
CLOUDFLARE_TUNNEL_TOKEN = os.getenv("CLOUDFLARE_TUNNEL_TOKEN", "").strip()
TUNNEL_LOG_LEVEL = os.getenv("TUNNEL_LOG_LEVEL", "info").strip() or "info"
TUNNEL_PROTOCOL = os.getenv("TUNNEL_PROTOCOL", "auto").strip().lower() or "auto"
TUNNEL_FAIL_ON_EXIT = os.getenv("TUNNEL_FAIL_ON_EXIT", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
TUNNEL_AUTO_INSTALL_CLOUDFLARED = os.getenv(
    "TUNNEL_AUTO_INSTALL_CLOUDFLARED", "1"
).strip().lower() in {"1", "true", "yes", "on"}
CLOUDFLARED_BIN_PATH = Path(
    os.getenv("CLOUDFLARED_BIN_PATH", "./.cloudflared/bin/cloudflared")
).resolve()

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

if ALLOW_ORIGINS == "*":
    CORS(app)
else:
    CORS(app, origins=[origin.strip() for origin in ALLOW_ORIGINS.split(",") if origin.strip()])

stop_event = threading.Event()
tunnel_process: subprocess.Popen[Any] | None = None
tunnel_exit_code: int | None = None
tunnel_connected = False
tunnel_last_event = "not_started"
tunnel_last_error = ""
tunnel_recent_logs: deque[str] = deque(maxlen=20)
tunnel_state_lock = threading.Lock()
SENSITIVE_LOG_PATTERNS = [
    re.compile(r"(CLOUDFLARE_TUNNEL_TOKEN:)(\S+)"),
    re.compile(r"(--token\s+)(\S+)"),
]


def log_line(message: str) -> None:
    print(message, flush=True)


def redact_sensitive_text(text: str) -> str:
    sanitized = text
    for pattern in SENSITIVE_LOG_PATTERNS:
        sanitized = pattern.sub(r"\1[REDACTED]", sanitized)
    return sanitized


def log_tunnel_bootstrap_config() -> None:
    mode = "token" if CLOUDFLARE_TUNNEL_TOKEN else "config"
    token_set = bool(CLOUDFLARE_TUNNEL_TOKEN)
    config_exists = TUNNEL_CONFIG_PATH.exists()
    log_line(
        "[tunnel] bootstrap "
        f"use={USE_CLOUDFLARE_TUNNEL} required={TUNNEL_REQUIRED} fail_on_exit={TUNNEL_FAIL_ON_EXIT} "
        f"mode={mode} token_set={token_set} config_path={TUNNEL_CONFIG_PATH} config_exists={config_exists} "
        f"metrics={TUNNEL_METRICS} loglevel={TUNNEL_LOG_LEVEL} protocol={TUNNEL_PROTOCOL} "
        f"auto_install_cloudflared={TUNNEL_AUTO_INSTALL_CLOUDFLARED} cloudflared_bin_path={CLOUDFLARED_BIN_PATH}"
    )


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
            log_line(f"[compression-worker] error: {error}")

        stop_event.wait(COMPRESSION_INTERVAL_SECONDS)


def get_tunnel_command() -> list[str]:
    base = [
        "cloudflared",
        "tunnel",
        "--metrics",
        TUNNEL_METRICS,
        "--protocol",
        TUNNEL_PROTOCOL,
        "--loglevel",
        TUNNEL_LOG_LEVEL,
        "run",
    ]

    if CLOUDFLARE_TUNNEL_TOKEN:
        return [*base, "--token", CLOUDFLARE_TUNNEL_TOKEN]

    if not TUNNEL_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Tunnel config not found at {TUNNEL_CONFIG_PATH}. "
            "Set CLOUDFLARE_TUNNEL_TOKEN or provide TUNNEL_CONFIG_PATH."
        )

    return [
        "cloudflared",
        "tunnel",
        "--config",
        str(TUNNEL_CONFIG_PATH),
        "--metrics",
        TUNNEL_METRICS,
        "--loglevel",
        TUNNEL_LOG_LEVEL,
        "run",
    ]


def get_cloudflared_download_url() -> str:
    architecture = machine().lower()
    if architecture in {"x86_64", "amd64"}:
        artifact = "cloudflared-linux-amd64"
    elif architecture in {"aarch64", "arm64"}:
        artifact = "cloudflared-linux-arm64"
    else:
        raise RuntimeError(
            f"Unsupported architecture for auto-install cloudflared: {architecture}"
        )

    return f"https://github.com/cloudflare/cloudflared/releases/latest/download/{artifact}"


def ensure_cloudflared_binary() -> str:
    existing_path = shutil.which("cloudflared")
    if existing_path:
        return existing_path

    if CLOUDFLARED_BIN_PATH.exists():
        CLOUDFLARED_BIN_PATH.chmod(0o755)
        return str(CLOUDFLARED_BIN_PATH)

    if not TUNNEL_AUTO_INSTALL_CLOUDFLARED:
        raise FileNotFoundError("cloudflared binary not found in PATH")

    CLOUDFLARED_BIN_PATH.parent.mkdir(parents=True, exist_ok=True)
    download_url = get_cloudflared_download_url()
    log_line(f"[tunnel] cloudflared not found, downloading from {download_url}")
    urlretrieve(download_url, str(CLOUDFLARED_BIN_PATH))
    CLOUDFLARED_BIN_PATH.chmod(0o755)
    log_line(f"[tunnel] cloudflared downloaded to {CLOUDFLARED_BIN_PATH}")
    return str(CLOUDFLARED_BIN_PATH)


def remember_tunnel_log(line: str) -> None:
    global tunnel_connected
    global tunnel_last_event
    global tunnel_last_error

    normalized = line.lower()
    with tunnel_state_lock:
        tunnel_recent_logs.append(line)

        if "registered tunnel connection" in normalized:
            tunnel_connected = True
            tunnel_last_event = "connected"
            tunnel_last_error = ""
            return

        if "cloudflared exited with code" in normalized:
            tunnel_connected = False
            tunnel_last_event = "exited"
            return

        if "error" in normalized or " err " in f" {normalized} ":
            tunnel_last_error = line
            tunnel_last_event = "error"


def stream_cloudflared_output(stream: Any, stream_name: str) -> None:
    try:
        for raw_line in iter(stream.readline, ""):
            line = raw_line.strip()
            if not line:
                continue
            sanitized_line = redact_sensitive_text(line)
            log_line(f"[tunnel:{stream_name}] {sanitized_line}")
            remember_tunnel_log(sanitized_line)
    finally:
        try:
            stream.close()
        except Exception:
            pass


def verify_tunnel_boot() -> None:
    time.sleep(12)
    with tunnel_state_lock:
        running = bool(tunnel_process and tunnel_process.poll() is None)
        connected = tunnel_connected
        last_error = tunnel_last_error

    if running and not connected:
        if last_error:
            log_line(
                "[tunnel] process is running but still not connected yet. "
                f"Last error: {last_error}"
            )
        else:
            log_line(
                "[tunnel] process is running but no successful connector registration yet."
            )


def monitor_cloudflare_tunnel() -> None:
    global tunnel_process
    global tunnel_exit_code
    global tunnel_connected
    global tunnel_last_event

    current_process = tunnel_process
    if current_process is None:
        return

    exit_code = current_process.wait()
    tunnel_exit_code = int(exit_code)
    tunnel_connected = False
    tunnel_last_event = "exited"
    log_line(f"[tunnel] cloudflared exited with code {exit_code}")
    tunnel_process = None

    if USE_CLOUDFLARE_TUNNEL and TUNNEL_FAIL_ON_EXIT:
        log_line("[tunnel] exiting server because TUNNEL_FAIL_ON_EXIT=1")
        os._exit(1)


def start_cloudflare_tunnel() -> None:
    global tunnel_process
    global tunnel_last_event

    if not USE_CLOUDFLARE_TUNNEL:
        return

    try:
        binary_path = ensure_cloudflared_binary()

        command = get_tunnel_command()
        command[0] = binary_path
        safe_command = [part for part in command if part != CLOUDFLARE_TUNNEL_TOKEN]
        mode = "token" if CLOUDFLARE_TUNNEL_TOKEN else "config"
        if mode == "token":
            log_line(
                "[tunnel] starting cloudflared in token mode "
                f"(metrics={TUNNEL_METRICS}, protocol={TUNNEL_PROTOCOL}, loglevel={TUNNEL_LOG_LEVEL})"
            )
        else:
            log_line(
                "[tunnel] starting cloudflared in config mode "
                f"(config={TUNNEL_CONFIG_PATH}, metrics={TUNNEL_METRICS}, protocol={TUNNEL_PROTOCOL}, loglevel={TUNNEL_LOG_LEVEL})"
            )
        log_line(f"[tunnel] cloudflared binary: {binary_path}")
        log_line(f"[tunnel] command: {' '.join(safe_command)}")
        tunnel_process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        tunnel_last_event = "starting"
        log_line(f"[tunnel] cloudflared process started (pid={tunnel_process.pid})")

        if tunnel_process.stdout is not None:
            stdout_thread = threading.Thread(
                target=stream_cloudflared_output,
                args=(tunnel_process.stdout, "stdout"),
                name="cloudflared-stdout",
                daemon=True,
            )
            stdout_thread.start()
        if tunnel_process.stderr is not None:
            stderr_thread = threading.Thread(
                target=stream_cloudflared_output,
                args=(tunnel_process.stderr, "stderr"),
                name="cloudflared-stderr",
                daemon=True,
            )
            stderr_thread.start()

        watcher = threading.Thread(
            target=monitor_cloudflare_tunnel,
            name="cloudflared-monitor",
            daemon=True,
        )
        watcher.start()
        boot_verifier = threading.Thread(
            target=verify_tunnel_boot,
            name="cloudflared-boot-verifier",
            daemon=True,
        )
        boot_verifier.start()
    except Exception as error:
        message = f"[tunnel] failed to start: {error}"
        if TUNNEL_REQUIRED:
            raise RuntimeError(message) from error
        log_line(message)


def stop_cloudflare_tunnel() -> None:
    global tunnel_process

    if tunnel_process is None:
        return

    if tunnel_process.poll() is not None:
        tunnel_process = None
        return

    tunnel_process.terminate()
    try:
        tunnel_process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        tunnel_process.kill()
    finally:
        tunnel_process = None


atexit.register(stop_cloudflare_tunnel)


@app.get("/health")
def healthcheck():
    disk_usage = shutil.disk_usage(UPLOAD_DIR)
    tunnel_running = bool(tunnel_process and tunnel_process.poll() is None)
    with tunnel_state_lock:
        recent_logs = list(tunnel_recent_logs)
        last_event = tunnel_last_event
        last_error = tunnel_last_error
        connected = tunnel_connected
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
            "use_cloudflare_tunnel": USE_CLOUDFLARE_TUNNEL,
            "tunnel_required": TUNNEL_REQUIRED,
            "tunnel_running": tunnel_running,
            "tunnel_connected": connected,
            "tunnel_last_event": last_event,
            "tunnel_last_error": last_error,
            "tunnel_log_level": TUNNEL_LOG_LEVEL,
            "tunnel_protocol": TUNNEL_PROTOCOL,
            "tunnel_metrics": TUNNEL_METRICS,
            "tunnel_pid": tunnel_process.pid if tunnel_running and tunnel_process else None,
            "tunnel_exit_code": tunnel_exit_code,
            "tunnel_recent_logs": recent_logs,
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
log_tunnel_bootstrap_config()
start_cloudflare_tunnel()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=APP_PORT)
