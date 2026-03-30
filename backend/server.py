import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = BASE_DIR / "uploads"
DB_PATH = DATA_DIR / "app.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


DIACRITICS_REGEX = re.compile(r"[\u064B-\u065F\u0670\u06D6-\u06ED]")
NON_WORD_GAP_REGEX = re.compile(r"[^\w\s\u0600-\u06FF]+", re.UNICODE)
MULTISPACE_REGEX = re.compile(r"\s+")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def normalize_arabic_text(value: str) -> str:
    normalized = value.strip()
    normalized = DIACRITICS_REGEX.sub("", normalized)
    normalized = normalized.replace("\u0640", "")
    normalized = re.sub(r"[إأآٱ]", "ا", normalized)
    normalized = normalized.replace("ى", "ي")
    normalized = normalized.replace("ؤ", "و")
    normalized = normalized.replace("ئ", "ي")
    normalized = normalized.replace("ة", "ه")
    normalized = NON_WORD_GAP_REGEX.sub(" ", normalized)
    normalized = MULTISPACE_REGEX.sub(" ", normalized)
    return normalized.strip()


def slugify_label(value: str) -> str:
    lowered = value.strip().lower()
    cleaned = re.sub(r"[^\w\s\u0600-\u06FF-]+", "", lowered, flags=re.UNICODE)
    return MULTISPACE_REGEX.sub("-", cleaned).strip("-")


def tokenize(text: str):
    if not text:
        return []

    return [token for token in text.split(" ") if token]


def score_phrase_match(query: str, candidate: str) -> float:
    if not query or not candidate:
        return 0.0

    if query == candidate:
        return 1.0

    query_tokens = tokenize(query)
    candidate_tokens = tokenize(candidate)
    if not query_tokens or not candidate_tokens:
        return 0.0

    # Reject tiny fragments so a single letter does not trigger a full phrase.
    if len(query_tokens) == 1 and len(query_tokens[0]) < 3:
        return 0.0

    shorter_tokens, longer_tokens = (
        (query_tokens, candidate_tokens)
        if len(query_tokens) <= len(candidate_tokens)
        else (candidate_tokens, query_tokens)
    )

    # Allow phrase-prefix matching like "السلام عليكم" -> "السلام عليكم ورحمة الله"
    if len(shorter_tokens) >= 2 and longer_tokens[: len(shorter_tokens)] == shorter_tokens:
        return 0.75 + (len(shorter_tokens) / len(longer_tokens)) * 0.2

    overlap = len(set(query_tokens) & set(candidate_tokens))
    if overlap < 2:
        return 0.0

    return overlap / max(len(query_tokens), len(candidate_tokens))


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
          priority INTEGER NOT NULL DEFAULT 100,
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
        SELECT id, animation_id, text_original, text_normalized, priority, created_at
        FROM phrases
        ORDER BY priority DESC, created_at DESC
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
        INSERT INTO phrases (id, animation_id, text_original, text_normalized, priority, created_at)
        VALUES (:id, :animation_id, :text_original, :text_normalized, :priority, :created_at)
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

    animations = list_animations()
    phrases = list_phrases()

    ranked = []
    for phrase in phrases:
        score = score_phrase_match(normalized_query, phrase["text_normalized"])
        if score >= 0.6:
            ranked.append((score, phrase["priority"], phrase))

    if not ranked:
        return None

    ranked.sort(key=lambda item: (-item[0], -item[1]))
    best_score, _priority, best_phrase = ranked[0]
    animation = next(
        (entry for entry in animations if entry["id"] == best_phrase["animation_id"]),
        None,
    )
    if not animation:
        return None

    return {
        "animation": serialize_animation(animation),
        "phrase": best_phrase,
        "normalized_query": normalized_query,
        "score": best_score,
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
        priority = int(payload.get("priority", 100))

        if not animation_id or not text_original:
            return json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"error": "animation_id and text_original are required"},
            )

        record = {
            "id": str(uuid.uuid4()),
            "animation_id": animation_id,
            "text_original": text_original,
            "text_normalized": normalize_arabic_text(text_original),
            "priority": priority,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        insert_phrase(record)
        return json_response(self, HTTPStatus.CREATED, {"phrase": record})

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
