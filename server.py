from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import json
import sqlite3
from datetime import date

ROOT = Path(__file__).parent
DB_PATH = ROOT / "budget.db"
STATIC_PATH = ROOT / "static"


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                amount INTEGER NOT NULL CHECK (amount >= 0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0)
            )
            """
        )
        connection.execute("INSERT OR IGNORE INTO settings (key, amount) VALUES ('monthly_income', 0)")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS incomes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount >= 0))"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS recurring_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount >= 0))"
        )
        legacy_income = connection.execute("SELECT amount FROM settings WHERE key = 'monthly_income'").fetchone()[0]
        income_count = connection.execute("SELECT COUNT(*) FROM incomes").fetchone()[0]
        if legacy_income and not income_count:
            connection.execute("INSERT INTO incomes (name, amount) VALUES (?, ?)", ("Miesięczny przychód", legacy_income))
        columns = {row[1] for row in connection.execute("PRAGMA table_info(expenses)")}
        if "expense_date" not in columns:
            connection.execute("ALTER TABLE expenses ADD COLUMN expense_date TEXT")
            connection.execute("UPDATE expenses SET expense_date = substr(created_at, 1, 10) WHERE expense_date IS NULL")


def get_dashboard_data():
    with get_connection() as connection:
        expenses = connection.execute(
            "SELECT id, name, category, amount, expense_date, created_at FROM expenses ORDER BY expense_date DESC, id DESC"
        ).fetchall()
        categories = connection.execute(
            """
            SELECT category, SUM(amount) AS total, COUNT(*) AS count
            FROM expenses
            GROUP BY category
            ORDER BY total DESC, category ASC
            """
        ).fetchall()
        total = connection.execute("SELECT COALESCE(SUM(amount), 0) FROM expenses").fetchone()[0]
        incomes = connection.execute("SELECT id, name, amount FROM incomes ORDER BY id ASC").fetchall()
        income = sum(item["amount"] for item in incomes)
        recurring_expenses = connection.execute("SELECT id, name, amount FROM recurring_expenses ORDER BY id ASC").fetchall()
        recurring_total = sum(item["amount"] for item in recurring_expenses)

    return {
        "expenses": [dict(expense) for expense in expenses],
        "categories": [dict(category) for category in categories],
        "total": total,
        "income": income,
        "incomes": [dict(item) for item in incomes],
        "recurring_expenses": [dict(item) for item in recurring_expenses],
        "recurring_total": recurring_total,
        "projected_savings": income - recurring_total - total,
    }


class BudgetHandler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/dashboard":
            self.send_json(get_dashboard_data())
            return

        if path in ("/", "/index.html"):
            file_path = STATIC_PATH / "index.html"
            content_type = "text/html; charset=utf-8"
        elif path == "/styles.css":
            file_path = STATIC_PATH / "styles.css"
            content_type = "text/css; charset=utf-8"
        elif path == "/app.js":
            file_path = STATIC_PATH / "app.js"
            content_type = "application/javascript; charset=utf-8"
        else:
            self.send_json({"error": "Not found"}, 404)
            return

        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/recurring-expenses":
            try:
                length = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(length))
                name = str(data.get("name", "")).strip()
                amount = float(data.get("amount", 0))
                if not name or amount <= 0:
                    raise ValueError
                amount_in_cents = round(amount * 100)
            except (ValueError, TypeError, json.JSONDecodeError):
                self.send_json({"error": "Podaj nazwę i kwotę stałego wydatku większą od zera."}, 400)
                return

            with get_connection() as connection:
                connection.execute("INSERT INTO recurring_expenses (name, amount) VALUES (?, ?)", (name, amount_in_cents))
            self.send_json(get_dashboard_data(), 201)
            return

        if path == "/api/incomes":
            try:
                length = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(length))
                name = str(data.get("name", "")).strip()
                amount = float(data.get("amount", 0))
                if not name or amount <= 0:
                    raise ValueError
                amount_in_cents = round(amount * 100)
            except (ValueError, TypeError, json.JSONDecodeError):
                self.send_json({"error": "Podaj nazwę i kwotę przychodu większą od zera."}, 400)
                return

            with get_connection() as connection:
                connection.execute("INSERT INTO incomes (name, amount) VALUES (?, ?)", (name, amount_in_cents))
            self.send_json(get_dashboard_data(), 201)
            return

        if path != "/api/expenses":
            self.send_json({"error": "Not found"}, 404)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length))
            name = str(data.get("name", "")).strip()
            category = str(data.get("category", "")).strip()
            amount = float(data.get("amount", 0))
            expense_date = str(data.get("date", "")).strip()
            date.fromisoformat(expense_date)
            if not name or not category or amount <= 0:
                raise ValueError
            amount_in_cents = round(amount * 100)
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_json({"error": "Podaj nazwę, kategorię i kwotę większą od zera."}, 400)
            return

        with get_connection() as connection:
            connection.execute(
                "INSERT INTO expenses (name, category, amount, expense_date) VALUES (?, ?, ?, ?)",
                (name, category, amount_in_cents, expense_date),
            )
        self.send_json(get_dashboard_data(), 201)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/recurring-expenses/"):
            try:
                expense_id = int(path.rsplit("/", 1)[1])
                length = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(length))
                name = str(data.get("name", "")).strip()
                amount = float(data.get("amount", 0))
                if not name or amount <= 0:
                    raise ValueError
                amount_in_cents = round(amount * 100)
            except (ValueError, TypeError, json.JSONDecodeError):
                self.send_json({"error": "Podaj nazwę i kwotę stałego wydatku większą od zera."}, 400)
                return
            with get_connection() as connection:
                connection.execute("UPDATE recurring_expenses SET name = ?, amount = ? WHERE id = ?", (name, amount_in_cents, expense_id))
            self.send_json(get_dashboard_data())
            return

        if not path.startswith("/api/incomes/"):
            self.send_json({"error": "Not found"}, 404)
            return

        try:
            income_id = int(path.rsplit("/", 1)[1])
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length))
            name = str(data.get("name", "")).strip()
            amount = float(data.get("amount", 0))
            if not name or amount <= 0:
                raise ValueError
            amount_in_cents = round(amount * 100)
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_json({"error": "Podaj nazwę i kwotę przychodu większą od zera."}, 400)
            return

        with get_connection() as connection:
            connection.execute(
                "UPDATE incomes SET name = ?, amount = ? WHERE id = ?",
                (name, amount_in_cents, income_id),
            )
        self.send_json(get_dashboard_data())

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/recurring-expenses/"):
            try:
                expense_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self.send_json({"error": "Invalid recurring expense id"}, 400)
                return
            with get_connection() as connection:
                connection.execute("DELETE FROM recurring_expenses WHERE id = ?", (expense_id,))
            self.send_json(get_dashboard_data())
            return
        if path.startswith("/api/incomes/"):
            try:
                income_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self.send_json({"error": "Invalid income id"}, 400)
                return
            with get_connection() as connection:
                connection.execute("DELETE FROM incomes WHERE id = ?", (income_id,))
            self.send_json(get_dashboard_data())
            return
        if not path.startswith("/api/expenses/"):
            self.send_json({"error": "Not found"}, 404)
            return
        try:
            expense_id = int(path.rsplit("/", 1)[1])
        except ValueError:
            self.send_json({"error": "Invalid expense id"}, 400)
            return

        with get_connection() as connection:
            connection.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        self.send_json(get_dashboard_data())

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    initialize_database()
    server = ThreadingHTTPServer(("0.0.0.0", 8000), BudgetHandler)
    print("Budget dashboard running on port 8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
        server.server_close()
