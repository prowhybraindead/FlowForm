# Temporary Upload Server (Pterodactyl)

This folder contains a lightweight Python upload API for temporary image storage.

## Endpoints

- `GET /health`
- `POST /upload` with multipart form field `file`
  - Optional form fields: `form_id`, `uploader_id`
- `GET /forms/<form_id>/status`
- `POST /forms/<form_id>/close`
- `POST /forms/<form_id>/open`
- `POST /maintenance/compress-now`
- `GET /files/<key>`
- `DELETE /files/<key>`

## Auto compression policy

- Files are tracked in SQLite metadata (`METADATA_DB_PATH`).
- Only files belonging to forms marked as closed are eligible.
- Default rule: after `7` days (`COMPRESS_AFTER_DAYS`), background worker compresses images on a schedule (`COMPRESSION_INTERVAL_SECONDS`).
- Compression is in-place to keep URLs unchanged.
- FlowForm frontend can auto-sync closed/open status through `POST /api/temp-storage/form-status`.

## Quota policy

- Per form file count: `MAX_FILES_PER_FORM`
- Per form total bytes: `MAX_BYTES_PER_FORM`
- Uploads exceeding quota are rejected with `429`.

## Pterodactyl startup notes

Your current startup command is:

```bash
if [[ -d .git ]] && [[ "0" == "1" ]]; then git pull; fi; if [[ ! -z "" ]]; then pip install -U --prefix .local ; fi; pip install -U --prefix .local -r ${REQUIREMENTS_FILE}; /usr/local/bin/python /home/container/app.py
```

If your panel does not support a startup path, upload the contents of this folder directly to the backend server root so `app.py` and `requirements.txt` sit beside each other.

To run files from this folder in a path-aware setup:

1. Set `REQUIREMENTS_FILE=server/requirements.txt`
2. Set app entrypoint to `server/app.py` in the panel (or copy `server/app.py` to `/home/container/app.py`)
3. Set `PORT=25534`
4. Optionally set additional env vars from `.env.example`

For manual root uploads, set `REQUIREMENTS_FILE=requirements.txt`, keep the startup command pointing at `/home/container/app.py`, and set `PORT=25534`.

If the panel uses Python 3.14, keep `Pillow==12.2.0` or newer in `requirements.txt`. Older Pillow pins can force a source build and may fail on small Pterodactyl disks with `No space left on device`.

## Cloudflare Tunnel inside backend container

Use this when your infrastructure exposes only one public port and you still need HTTPS for the upload API.

Files added in this folder:

- `cloudflared/config.example.yml` (template ingress mapping)

### 1) Prepare tunnel config

1. Copy `cloudflared/config.example.yml` to `cloudflared/config.yml`
2. Replace:
   - `YOUR_TUNNEL_ID`
   - `credentials-file` path to your real credentials JSON file
   - `hostname` values with your real domains
   - internal `service` targets (`frontend:3000`, `127.0.0.1:25534`, etc.)

Tip: keep frontend and API under the same host with path routing (`/api/temp-storage/*`) to avoid CORS and mixed content.

### 2) Set environment variables

Add these env vars in your panel if using tunnel:

```env
USE_CLOUDFLARE_TUNNEL=1
TUNNEL_REQUIRED=1
TUNNEL_CONFIG_PATH=./cloudflared/config.yml
TUNNEL_METRICS=127.0.0.1:60123
TUNNEL_LOG_LEVEL=info
TUNNEL_PROTOCOL=auto
TUNNEL_FAIL_ON_EXIT=1
TUNNEL_AUTO_INSTALL_CLOUDFLARED=1
CLOUDFLARED_BIN_PATH=./.cloudflared/bin/cloudflared
PUBLIC_BASE_URL=https://api.example.com
ALLOW_ORIGINS=https://app.example.com
```

Alternative: use token mode instead of config file:

```env
USE_CLOUDFLARE_TUNNEL=1
TUNNEL_REQUIRED=1
CLOUDFLARE_TUNNEL_TOKEN=your_cloudflare_tunnel_token
TUNNEL_METRICS=127.0.0.1:60123
TUNNEL_LOG_LEVEL=info
TUNNEL_PROTOCOL=auto
TUNNEL_FAIL_ON_EXIT=1
TUNNEL_AUTO_INSTALL_CLOUDFLARED=1
CLOUDFLARED_BIN_PATH=./.cloudflared/bin/cloudflared
```

Notes:

- `cloudflared` from PATH is used first when available.
- If `cloudflared` is missing, app auto-downloads binary when `TUNNEL_AUTO_INSTALL_CLOUDFLARED=1`.
- Startup command can stay fixed at `/usr/local/bin/python /home/container/app.py`.
- If you want backend only (no tunnel), set `USE_CLOUDFLARE_TUNNEL=0`.
- Set `TUNNEL_REQUIRED=1` to force startup failure when tunnel cannot run.
- Set `TUNNEL_FAIL_ON_EXIT=1` to force server exit if tunnel later dies.
- Console logs now stream raw `cloudflared` output and show binary path, command, PID, and exit code.
- `GET /health` includes tunnel diagnostics (`tunnel_running`, `tunnel_connected`, `tunnel_last_event`, `tunnel_last_error`, `tunnel_recent_logs`).
- In the frontend app env, set `TEMP_STORAGE_SERVER_URL` to the HTTPS tunnel URL.
- If logs show repeated `Failed to dial a quic connection ... timeout`, set `TUNNEL_PROTOCOL=http2` (common when UDP/7844 is blocked).

### Quick troubleshooting

- If you only see Flask lines (`Running on http://...`) and no `[tunnel] ...` lines:
  - `USE_CLOUDFLARE_TUNNEL` is not set to `1`, or
  - the running `/home/container/app.py` is an old copy without tunnel code.
- If logs show `[tunnel] bootstrap use=True ...` but then fail:
  - verify `cloudflared` exists in PATH,
  - verify token/config is valid,
  - verify route origin URL points to reachable internal backend (`127.0.0.1:25534` when same container).

## Security

- Set `UPLOAD_TOKEN` and require uploads through a backend proxy.
- Set `ALLOW_ORIGINS` to your web domain instead of `*` for production.
