"""Local Python server for the Hail road-safety demo."""

from __future__ import annotations

import json
import mimetypes
import os
import random
import sqlite3
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "data" / "reports.sqlite3"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
MAX_REQUEST_BYTES = 16_384
VALID_STATES = {"open", "closed"}
VALID_SEVERITIES = {"عالية", "متوسطة", "منخفضة"}
SEED_REPORTS = [
    ("شارع الملك عبدالعزيز", "النقرة", "open", "عالية", 43, 42, "حفرة قرب تقاطع رئيسي"),
    ("طريق عقدة", "الوسيطاء", "open", "متوسطة", 23, 59, "تآكل بطبقة الرصف"),
    ("شارع الأمير سلطان", "الجامعيين", "open", "عالية", 79, 35, "حفرة مؤثرة على المسار"),
    ("طريق صديان", "صديان", "open", "منخفضة", 68, 78, "هبوط موضعي في الطريق"),
    ("شارع فهد العلي العريفي", "الزهراء", "closed", "—", 63, 58, "تمت المعالجة والتحقق"),
    ("شارع النقرة العام", "النقرة", "closed", "—", 48, 28, "تمت المعالجة"),
]


def connect_database() -> sqlite3.Connection:
    """Open a short-lived SQLite connection for one request."""
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    """Create the reports table and add demo rows on the first run."""
    with connect_database() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place TEXT NOT NULL,
                district TEXT NOT NULL,
                state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
                severity TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        existing_count = connection.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
        if existing_count == 0:
            connection.executemany(
                """INSERT INTO reports
                   (place, district, state, severity, x, y, note)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                SEED_REPORTS,
            )


def list_reports() -> list[dict]:
    with connect_database() as connection:
        rows = connection.execute(
            """SELECT id, place, district, state, severity, x, y, note, created_at
               FROM reports ORDER BY id"""
        ).fetchall()
    return [dict(row) for row in rows]


def clean_text(value: object, field: str, limit: int, required: bool = True) -> str:
    if not isinstance(value, str):
        raise ValueError(f"الحقل {field} غير صالح")
    value = value.strip()
    if required and not value:
        raise ValueError(f"الحقل {field} مطلوب")
    if len(value) > limit:
        raise ValueError(f"الحقل {field} أطول من المسموح")
    return value


def create_report(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("صيغة البلاغ غير صحيحة")

    place = clean_text(payload.get("place"), "الموقع", 100)
    district = clean_text(payload.get("district"), "الحي", 40)
    state = clean_text(payload.get("state"), "الحالة", 10)
    severity = clean_text(payload.get("severity", "متوسطة"), "الأولوية", 20)
    note = clean_text(payload.get("note", ""), "الوصف", 160, required=False) or "بلاغ جديد"

    if state not in VALID_STATES:
        raise ValueError("الحالة المختارة غير معروفة")
    if state == "open" and severity not in VALID_SEVERITIES:
        raise ValueError("الأولوية المختارة غير معروفة")
    if state == "closed":
        severity = "—"
        note = note or "تمت المعالجة والتحقق"

    x = round(random.uniform(20, 80), 2)
    y = round(random.uniform(22, 80), 2)
    with connect_database() as connection:
        cursor = connection.execute(
            """INSERT INTO reports (place, district, state, severity, x, y, note)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (place, district, state, severity, x, y, note),
        )
        report_id = cursor.lastrowid
        row = connection.execute(
            """SELECT id, place, district, state, severity, x, y, note, created_at
               FROM reports WHERE id = ?""",
            (report_id,),
        ).fetchone()
    return dict(row)


class HailSiteHandler(BaseHTTPRequestHandler):
    """Serve the web page and its small JSON API."""

    server_version = "HailRoadMonitor/1.0"

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path in {"/", "/index.html"}:
            self.send_file(ROOT / "templates" / "index.html", "text/html; charset=utf-8")
        elif path == "/static/styles.css":
            self.send_file(ROOT / "static" / "styles.css", "text/css; charset=utf-8")
        elif path == "/static/app.js":
            self.send_file(ROOT / "static" / "app.js", "text/javascript; charset=utf-8")
        elif path == "/api/reports":
            self.send_json(HTTPStatus.OK, list_reports())
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "الصفحة غير موجودة"})

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/reports":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "المسار غير موجود"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("حجم الطلب غير صالح")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            report = create_report(payload)
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "تعذر قراءة بيانات البلاغ"})
            return
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        self.send_json(HTTPStatus.CREATED, report)

    def send_file(self, file_path: Path, content_type: str) -> None:
        try:
            content = file_path.read_bytes()
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, status: HTTPStatus, value: object) -> None:
        content = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format_string % args}")


def main() -> None:
    initialize_database()
    server = ThreadingHTTPServer((HOST, PORT), HailSiteHandler)
    print(f"مرصد حائل يعمل على http://{HOST}:{PORT}")
    print("اضغط Ctrl+C لإيقاف الخادم")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nتم إيقاف الخادم")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
