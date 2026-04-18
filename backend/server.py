import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

from arabic import normalize_arabic_text, slugify_label
from whisper_service import transcribe_audio_bytes


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = BASE_DIR / "uploads"
DB_PATH = DATA_DIR / "app.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def dict_factory(cursor, row):
    return {cursor.description[index][0]: value for index, value in enumerate(row)}


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = dict_factory
    return connection


def initialize_database():
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS animations (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          title_ar TEXT NOT NULL,
          notes TEXT DEFAULT '',
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS phrases (
          id TEXT PRIMARY KEY,
          animation_id TEXT NOT NULL,
          text_original TEXT NOT NULL,
          text_normalized TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (animation_id) REFERENCES animations(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_phrases_animation_id ON phrases(animation_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_phrases_text_normalized ON phrases(text_normalized)"
    )
    connection.commit()
    connection.close()


def list_animations():
    connection = get_connection()
    rows = connection.execute(
        """
        SELECT id, slug, title_ar, notes, file_name, file_path, file_size, created_at
        FROM animations
        ORDER BY created_at DESC
        """
    ).fetchall()
    connection.close()
    return rows


def list_phrases():
    connection = get_connection()
    rows = connection.execute(
        """
        SELECT id, animation_id, text_original, text_normalized, created_at
        FROM phrases
        ORDER BY created_at DESC
        """
    ).fetchall()
    connection.close()
    return rows


def insert_animation(record):
    connection = get_connection()
    connection.execute(
        """
        INSERT INTO animations (id, slug, title_ar, notes, file_name, file_path, file_size, created_at)
        VALUES (:id, :slug, :title_ar, :notes, :file_name, :file_path, :file_size, :created_at)
        """,
        record,
    )
    connection.commit()
    connection.close()


def insert_phrase(record):
    connection = get_connection()
    connection.execute(
        """
        INSERT INTO phrases (id, animation_id, text_original, text_normalized, created_at)
        VALUES (:id, :animation_id, :text_original, :text_normalized, :created_at)
        """,
        record,
    )
    connection.commit()
    connection.close()


def delete_animation(animation_id: str):
    connection = get_connection()
    animation = connection.execute(
        "SELECT file_path FROM animations WHERE id = ?", (animation_id,)
    ).fetchone()
    connection.execute("DELETE FROM phrases WHERE animation_id = ?", (animation_id,))
    connection.execute("DELETE FROM animations WHERE id = ?", (animation_id,))
    connection.commit()
    connection.close()

    if animation:
        file_path = BASE_DIR.parent / animation["file_path"]
        if file_path.exists():
            file_path.unlink()


def delete_phrase(phrase_id: str):
    connection = get_connection()
    connection.execute("DELETE FROM phrases WHERE id = ?", (phrase_id,))
    connection.commit()
    connection.close()


def find_best_match(query: str):
    normalized_query = normalize_arabic_text(query)
    if not normalized_query:
        return None

    connection = get_connection()
    phrase = connection.execute(
        """
        SELECT id, animation_id, text_original, text_normalized, created_at
        FROM phrases
        WHERE text_normalized = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (normalized_query,),
    ).fetchone()

    if not phrase:
        connection.close()
        return None

    animation = connection.execute(
        """
        SELECT id, slug, title_ar, notes, file_name, file_path, file_size, created_at
        FROM animations
        WHERE id = ?
        LIMIT 1
        """,
        (phrase["animation_id"],),
    ).fetchone()
    connection.close()

    if not animation:
        return None

    return {
        "animation": serialize_animation(animation),
        "phrase": phrase,
        "normalized_query": normalized_query,
        "match_type": "exact_alias",
    }


def serialize_animation(animation):
    file_name = Path(animation["file_path"]).name
    return {
        **animation,
        "file_url": f"/media/{file_name}",
    }


def json_response(handler, status, payload):
    encoded = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(encoded)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(encoded)


def file_response(handler, status, file_path: Path, content_type: str):
    payload = file_path.read_bytes()
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(payload)


def parse_multipart_request(handler):
    content_type = handler.headers.get("Content-Type", "")
    content_length = int(handler.headers.get("Content-Length", "0"))
    body = handler.rfile.read(content_length) if content_length else b""

    message = BytesParser(policy=default).parsebytes(
        (
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
            + body
        )
    )

    fields = {}
    files = {}

    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        payload = part.get_payload(decode=True)

        if not name:
            continue

        if filename:
            files[name] = {
                "filename": filename,
                "content": payload,
                "content_type": part.get_content_type(),
            }
        else:
            fields[name] = (payload or b"").decode("utf-8")

    return fields, files


def is_local_admin_request(handler):
    origin = handler.headers.get("Origin") or handler.headers.get("Referer")
    if origin:
        hostname = urlparse(origin).hostname
        return hostname in LOCAL_HOSTS

    client_host = handler.client_address[0]
    return client_host in LOCAL_HOSTS


class AppHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/admin/state":
            if not is_local_admin_request(self):
                return json_response(
                    self, HTTPStatus.FORBIDDEN, {"error": "Admin is local-only"}
                )
            return json_response(
                self,
                HTTPStatus.OK,
                {
                    "animations": [serialize_animation(entry) for entry in list_animations()],
                    "phrases": list_phrases(),
                },
            )

        if parsed.path.startswith("/api/lookup"):
            query = ""
            if "?" in self.path:
                query_string = self.path.split("?", 1)[1]
                for pair in query_string.split("&"):
                    if pair.startswith("query="):
                        query = pair.split("=", 1)[1]
                        query = query.replace("+", " ")
                        query = unquote(query)
                        break

            match = find_best_match(query)
            return json_response(self, HTTPStatus.OK, {"match": match})

        if parsed.path.startswith("/media/"):
            file_name = Path(unquote(parsed.path.rsplit("/", 1)[-1])).name
            file_path = UPLOADS_DIR / file_name
            if not file_path.exists():
                return json_response(self, HTTPStatus.NOT_FOUND, {"error": "File not found"})
            return file_response(self, HTTPStatus.OK, file_path, "model/gltf-binary")

        return json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/admin/animations":
            if not is_local_admin_request(self):
                return json_response(
                    self, HTTPStatus.FORBIDDEN, {"error": "Admin is local-only"}
                )
            return self.handle_animation_upload()

        if parsed.path == "/api/admin/phrases":
            if not is_local_admin_request(self):
                return json_response(
                    self, HTTPStatus.FORBIDDEN, {"error": "Admin is local-only"}
                )
            return self.handle_phrase_create()

        if parsed.path == "/api/transcribe":
            return self.handle_transcription()

        return json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)

        if parsed.path.startswith("/api/admin/animations/"):
            if not is_local_admin_request(self):
                return json_response(
                    self, HTTPStatus.FORBIDDEN, {"error": "Admin is local-only"}
                )
            animation_id = parsed.path.rsplit("/", 1)[-1]
            delete_animation(animation_id)
            return json_response(self, HTTPStatus.OK, {"ok": True})

        if parsed.path.startswith("/api/admin/phrases/"):
            if not is_local_admin_request(self):
                return json_response(
                    self, HTTPStatus.FORBIDDEN, {"error": "Admin is local-only"}
                )
            phrase_id = parsed.path.rsplit("/", 1)[-1]
            delete_phrase(phrase_id)
            return json_response(self, HTTPStatus.OK, {"ok": True})

        return json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def handle_animation_upload(self):
        fields, files = parse_multipart_request(self)

        title_ar = fields.get("title_ar", "").strip()
        slug_input = fields.get("slug", "").strip()
        notes = fields.get("notes", "").strip()
        file_item = files.get("file")

        if not title_ar or file_item is None or not file_item.get("filename"):
            return json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "title_ar and .glb file are required"},
            )

        filename = Path(file_item["filename"]).name
        if Path(filename).suffix.lower() != ".glb":
            return json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "Only .glb files are allowed"},
            )

        animation_id = str(uuid.uuid4())
        slug = slugify_label(slug_input or title_ar)
        saved_filename = f"{animation_id}.glb"
        saved_path = UPLOADS_DIR / saved_filename
        file_bytes = file_item["content"]
        saved_path.write_bytes(file_bytes)

        created_at = datetime.now(timezone.utc).isoformat()
        record = {
            "id": animation_id,
            "slug": slug,
            "title_ar": title_ar,
            "notes": notes,
            "file_name": filename,
            "file_path": f"backend/uploads/{saved_filename}",
            "file_size": len(file_bytes),
            "created_at": created_at,
        }

        try:
            insert_animation(record)
        except sqlite3.IntegrityError:
            saved_path.unlink(missing_ok=True)
            return json_response(
                self,
                HTTPStatus.CONFLICT,
                {"error": "Animation slug already exists"},
            )

        return json_response(self, HTTPStatus.CREATED, {"animation": record})

    def handle_phrase_create(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length else b"{}"
        payload = json.loads(body.decode("utf-8"))

        animation_id = payload.get("animation_id", "").strip()
        text_original = payload.get("text_original", "").strip()
        if not animation_id or not text_original:
            return json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "animation_id and text_original are required"},
            )

        normalized_text = normalize_arabic_text(text_original)
        if not normalized_text:
            return json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "Alias becomes empty after normalization"},
            )

        connection = get_connection()
        existing_phrase = connection.execute(
            """
            SELECT id
            FROM phrases
            WHERE text_normalized = ?
            LIMIT 1
            """,
            (normalized_text,),
        ).fetchone()
        connection.close()

        if existing_phrase:
            return json_response(
                self,
                HTTPStatus.CONFLICT,
                {"error": "This normalized alias already exists"},
            )

        record = {
            "id": str(uuid.uuid4()),
            "animation_id": animation_id,
            "text_original": text_original,
            "text_normalized": normalized_text,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        insert_phrase(record)
        return json_response(self, HTTPStatus.CREATED, {"phrase": record})

    def handle_transcription(self):
        fields, files = parse_multipart_request(self)
        del fields

        audio_item = files.get("audio")
        if audio_item is None or not audio_item.get("content"):
            return json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "audio file is required"},
            )

        try:
            transcript = transcribe_audio_bytes(
                audio_item["content"],
                audio_item.get("filename") or "recording.webm",
            )
            if not transcript:
                return json_response(
                    self,
                    HTTPStatus.UNPROCESSABLE_ENTITY,
                    {"error": "No speech detected"},
                )

            normalized_query = normalize_arabic_text(transcript)
            match = find_best_match(transcript)
            return json_response(
                self,
                HTTPStatus.OK,
                {
                    "transcript": transcript,
                    "normalized_query": normalized_query,
                    "match": match,
                },
            )
        except RuntimeError as error:
            return json_response(
                self,
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"error": str(error)},
            )
        except Exception as error:
            return json_response(
                self,
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"Transcription failed: {error}"},
            )

    def log_message(self, format, *args):
        return


def main():
    initialize_database()
    host = os.environ.get("APP_HOST", "127.0.0.1")
    port = int(os.environ.get("APP_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Backend listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
