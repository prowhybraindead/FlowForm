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

## Security

- Set `UPLOAD_TOKEN` and require uploads through a backend proxy.
- Set `ALLOW_ORIGINS` to your web domain instead of `*` for production.
