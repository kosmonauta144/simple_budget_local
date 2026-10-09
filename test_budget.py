import base64
import http.client
import json
import os
import socket
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
from http.server import ThreadingHTTPServer

import server


class RecurringExpenseCategoryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = server.DB_PATH
        server.DB_PATH = os.path.join(self.temp_dir.name, "budget.db")
        server.initialize_database()

    def tearDown(self):
        server.DB_PATH = self.original_db_path

    def test_initialize_database_adds_category_column(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            columns = [row[1] for row in connection.execute("PRAGMA table_info(recurring_expenses)")]
        self.assertIn("category", columns)

    def test_initialize_database_adds_payment_deadline_column(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            columns = [row[1] for row in connection.execute("PRAGMA table_info(recurring_expenses)")]
        self.assertIn("payment_deadline", columns)

    def test_initialize_database_adds_paid_flag_column(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            columns = [row[1] for row in connection.execute("PRAGMA table_info(recurring_expenses)")]
        self.assertIn("is_paid", columns)

    def test_initialize_database_migrates_receipt_id_and_preserves_existing_expenses(self):
        legacy_db_path = os.path.join(self.temp_dir.name, "legacy.db")
        with sqlite3.connect(legacy_db_path) as connection:
            connection.execute(
                "CREATE TABLE expenses (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL, created_at TEXT NOT NULL, expense_date TEXT)"
            )
            connection.execute(
                "INSERT INTO expenses (name, category, amount, created_at, expense_date) VALUES (?, ?, ?, ?, ?)",
                ("Chleb", "Jedzenie", 425, "2026-09-14 12:00:00", "2026-09-14"),
            )

        original_db_path = server.DB_PATH
        server.DB_PATH = legacy_db_path
        try:
            server.initialize_database()
            with sqlite3.connect(server.DB_PATH) as connection:
                columns = [row[1] for row in connection.execute("PRAGMA table_info(expenses)")]
                receipt_id = connection.execute("SELECT receipt_id FROM expenses WHERE id = 1").fetchone()[0]
            dashboard = server.get_dashboard_data_for_month(2026, 9)
        finally:
            server.DB_PATH = original_db_path

        self.assertIn("receipt_id", columns)
        self.assertIsNone(receipt_id)
        self.assertIsNone(dashboard["expenses"][0]["receipt_id"])

    def test_recurring_expense_category_is_saved_and_loaded(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.execute(
                "INSERT INTO recurring_expenses (name, category, amount) VALUES (?, ?, ?)",
                ("Rata kredytu", "Dom", 25000),
            )
            connection.commit()

        dashboard = server.get_dashboard_data()
        self.assertEqual(dashboard["recurring_expenses"][0]["category"], "Dom")
        self.assertEqual(dashboard["recurring_total"], 25000)

    def test_recurring_categories_are_marked_as_fixed_costs(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.executemany(
                "INSERT INTO recurring_expenses (name, category, amount, month, is_paid) VALUES (?, ?, ?, ?, ?)",
                [
                    ("Internet", "Media", 9900, "2026-09", 0),
                    ("Rata kredytu", "Dom", 25000, "2026-09", 1),
                ],
            )
            connection.commit()

        dashboard = server.get_dashboard_data_for_month(2026, 9)
        self.assertIn("Media_stałe", [item["category"] for item in dashboard["recurring_categories"]])
        self.assertIn("Dom_stałe", [item["category"] for item in dashboard["recurring_categories"]])

    def test_recurring_expense_payment_deadline_is_saved_and_loaded(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.execute(
                "INSERT INTO recurring_expenses (name, category, amount, payment_deadline, month, is_paid) VALUES (?, ?, ?, ?, ?, ?)",
                ("Internet", "Media", 9900, 15, "2026-09", 0),
            )
            connection.commit()

        dashboard = server.get_dashboard_data_for_month(2026, 9)
        self.assertEqual(dashboard["recurring_expenses"][0]["payment_deadline"], 15)
        self.assertEqual(dashboard["recurring_expenses"][0]["is_paid"], 0)

    def test_recurring_expenses_are_scoped_to_month(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.execute(
                "INSERT INTO recurring_expenses (name, category, amount, month, is_paid) VALUES (?, ?, ?, ?, ?)",
                ("Internet", "Media", 9900, "2026-08", 1),
            )
            connection.execute(
                "INSERT INTO recurring_expenses (name, category, amount, month, is_paid) VALUES (?, ?, ?, ?, ?)",
                ("Internet", "Media", 9900, "2026-09", 0),
            )
            connection.commit()

        dashboard = server.get_dashboard_data_for_month(2026, 9)
        self.assertEqual(len(dashboard["recurring_expenses"]), 1)
        self.assertEqual(dashboard["recurring_expenses"][0]["is_paid"], 0)

    def test_recurring_expense_template_is_propagated_to_future_months(self):
        template_id = "template-2026-09"
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.execute(
                "INSERT INTO recurring_expenses (name, category, amount, month, template_id) VALUES (?, ?, ?, ?, ?)",
                ("Internet", "Media", 9900, "2026-09", template_id),
            )
            connection.commit()

        server.propagate_future_recurring_expenses(template_id, "2026-09")

        with sqlite3.connect(server.DB_PATH) as connection:
            months = [row[0] for row in connection.execute(
                "SELECT month FROM recurring_expenses WHERE template_id = ? ORDER BY month ASC",
                (template_id,),
            ).fetchall()]

        self.assertIn("2026-09", months)
        self.assertIn("2026-10", months)
        self.assertIn("2026-11", months)

    def test_removing_a_future_template_keeps_previous_months(self):
        template_id = "template-delete-cutoff"
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.executemany(
                "INSERT INTO recurring_expenses (name, category, amount, month, template_id) VALUES (?, ?, ?, ?, ?)",
                [
                    ("Internet", "Media", 9900, "2026-09", template_id),
                    ("Internet", "Media", 9900, "2026-10", template_id),
                    ("Internet", "Media", 9900, "2026-11", template_id),
                ],
            )
            connection.commit()

        server.delete_future_recurring_expenses(template_id, "2026-10")

        with sqlite3.connect(server.DB_PATH) as connection:
            months = [row[0] for row in connection.execute(
                "SELECT month FROM recurring_expenses WHERE template_id = ? ORDER BY month ASC",
                (template_id,),
            ).fetchall()]

        self.assertEqual(months, ["2026-09"])

    def test_income_is_scoped_to_month(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.executemany(
                "INSERT INTO incomes (name, amount, month, template_id) VALUES (?, ?, ?, ?)",
                [
                    ("Wynagrodzenie", 40000, "2026-08", "template-income-old"),
                    ("Wynagrodzenie", 45000, "2026-09", "template-income-new"),
                ],
            )
            connection.commit()

        dashboard = server.get_dashboard_data_for_month(2026, 9)
        self.assertEqual(len(dashboard["incomes"]), 1)
        self.assertEqual(dashboard["incomes"][0]["amount"], 45000)
        self.assertEqual(dashboard["income"], 45000)

    def test_income_template_is_propagated_to_future_months(self):
        template_id = "template-income-2026-09"
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.execute(
                "INSERT INTO incomes (name, amount, month, template_id) VALUES (?, ?, ?, ?)",
                ("Wynagrodzenie", 45000, "2026-09", template_id),
            )
            connection.commit()

        server.propagate_future_incomes(template_id, "2026-09")

        with sqlite3.connect(server.DB_PATH) as connection:
            months = [row[0] for row in connection.execute(
                "SELECT month FROM incomes WHERE template_id = ? ORDER BY month ASC",
                (template_id,),
            ).fetchall()]

        self.assertIn("2026-09", months)
        self.assertIn("2026-10", months)
        self.assertIn("2026-11", months)

    def test_temporary_income_is_month_scoped_and_counted_in_savings(self):
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.executemany(
                "INSERT INTO temporary_incomes (name, amount, month) VALUES (?, ?, ?)",
                [
                    ("Premia", 5000, "2026-08"),
                    ("Premia", 6000, "2026-09"),
                ],
            )
            connection.execute(
                "INSERT INTO incomes (name, amount, month, template_id) VALUES (?, ?, ?, ?)",
                ("Wynagrodzenie", 45000, "2026-09", "template-income-2026-09"),
            )
            connection.commit()

        dashboard = server.get_dashboard_data_for_month(2026, 9)
        self.assertEqual(len(dashboard["temporary_incomes"]), 1)
        self.assertEqual(dashboard["temporary_income_total"], 6000)
        self.assertEqual(dashboard["income"], 51000)

    def test_removing_a_future_income_template_keeps_previous_months(self):
        template_id = "template-income-delete-cutoff"
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.executemany(
                "INSERT INTO incomes (name, amount, month, template_id) VALUES (?, ?, ?, ?)",
                [
                    ("Wynagrodzenie", 45000, "2026-09", template_id),
                    ("Wynagrodzenie", 45000, "2026-10", template_id),
                    ("Wynagrodzenie", 45000, "2026-11", template_id),
                ],
            )
            connection.commit()

        server.delete_future_incomes(template_id, "2026-10")

        with sqlite3.connect(server.DB_PATH) as connection:
            months = [row[0] for row in connection.execute(
                "SELECT month FROM incomes WHERE template_id = ? ORDER BY month ASC",
                (template_id,),
            ).fetchall()]

        self.assertEqual(months, ["2026-09"])

    def test_editing_recurring_expense_template_updates_future_months_only(self):
        template_id = "template-edit-expense"
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.executemany(
                "INSERT INTO recurring_expenses (name, category, amount, month, template_id) VALUES (?, ?, ?, ?, ?)",
                [
                    ("Internet", "Media", 9900, "2026-09", template_id),
                    ("Internet", "Media", 9900, "2026-10", template_id),
                    ("Internet", "Media", 9900, "2026-11", template_id),
                    ("Internet", "Media", 9900, "2026-08", "older-template"),
                ],
            )
            connection.commit()

        server.update_future_recurring_expenses(
            template_id,
            "2026-09",
            name="Internet",
            category="Media",
            amount=15000,
            payment_deadline=10,
            is_paid=1,
        )

        with sqlite3.connect(server.DB_PATH) as connection:
            amounts = {
                row[0]: row[1]
                for row in connection.execute(
                    "SELECT month, amount FROM recurring_expenses WHERE template_id = ? ORDER BY month ASC",
                    (template_id,),
                ).fetchall()
            }
            self.assertEqual(amounts["2026-09"], 15000)
            self.assertEqual(amounts["2026-10"], 15000)
            self.assertEqual(amounts["2026-11"], 15000)

    def test_editing_income_template_updates_future_months_only(self):
        template_id = "template-edit-income"
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.executemany(
                "INSERT INTO incomes (name, amount, month, template_id) VALUES (?, ?, ?, ?)",
                [
                    ("Wynagrodzenie", 45000, "2026-09", template_id),
                    ("Wynagrodzenie", 45000, "2026-10", template_id),
                    ("Wynagrodzenie", 45000, "2026-11", template_id),
                    ("Wynagrodzenie", 45000, "2026-08", "older-income-template"),
                ],
            )
            connection.commit()

        server.update_future_incomes(template_id, "2026-09", name="Wynagrodzenie", amount=55000)

        with sqlite3.connect(server.DB_PATH) as connection:
            amounts = {
                row[0]: row[1]
                for row in connection.execute(
                    "SELECT month, amount FROM incomes WHERE template_id = ? ORDER BY month ASC",
                    (template_id,),
                ).fetchall()
            }
            self.assertEqual(amounts["2026-09"], 55000)
            self.assertEqual(amounts["2026-10"], 55000)
            self.assertEqual(amounts["2026-11"], 55000)


class ReceiptAndBulkEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = server.DB_PATH
        server.DB_PATH = os.path.join(self.temp_dir.name, "budget.db")
        original_get_connection = server.get_connection

        @contextmanager
        def closing_connection():
            connection = original_get_connection()
            try:
                with connection:
                    yield connection
            finally:
                connection.close()

        self.connection_patcher = patch("server.get_connection", closing_connection)
        self.connection_patcher.start()
        server.initialize_database()
        self.http_server = ThreadingHTTPServer(("127.0.0.1", 0), server.BudgetHandler)
        self.http_server.daemon_threads = False
        self.server_thread = threading.Thread(target=self.http_server.serve_forever, daemon=True)
        self.server_thread.start()
        self.server_address = self.http_server.server_address

    def tearDown(self):
        self.http_server.shutdown()
        self.http_server.server_close()
        self.server_thread.join()
        self.connection_patcher.stop()
        server.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def post(self, path, data):
        if isinstance(data, bytes):
            body = data
        else:
            body = json.dumps(data).encode("utf-8")
        connection = http.client.HTTPConnection(*self.server_address)
        connection.request("POST", path, body=body, headers={"Content-Type": "application/json"})
        response = connection.getresponse()
        response_body = response.read()
        connection.close()
        return response.status, json.loads(response_body)

    def expense_count(self):
        connection = sqlite3.connect(server.DB_PATH)
        try:
            return connection.execute("SELECT COUNT(*) FROM expenses").fetchone()[0]
        finally:
            connection.close()

    @staticmethod
    def valid_receipt_request():
        return {
            "image": base64.b64encode(b"\xff\xd8\xffreceipt").decode("ascii"),
            "mime_type": "image/jpeg",
            "categories": ["Jedzenie", "Dom"],
        }

    def test_receipt_analysis_uses_local_ollama_and_returns_validated_result(self):
        model_content = json.dumps({
            "date": "2026-09-14",
            "total": "12.50",
            "items": [{"name": "Chleb", "amount": "4.25", "category": "Jedzenie"}],
            "warnings": [],
        })
        ollama_response = MagicMock()
        ollama_response.__enter__.return_value = ollama_response
        ollama_response.read.return_value = json.dumps({"message": {"content": model_content}}).encode("utf-8")
        request_data = self.valid_receipt_request()
        request_data["categories"].append("Klientowa kategoria")

        with patch.dict(os.environ, {"OLLAMA_URL": "http://127.0.0.1:11434", "OLLAMA_VISION_MODEL": "gemma3:4b"}), \
             patch("server.urllib.request.urlopen", return_value=ollama_response) as urlopen:
            status, payload = self.post("/api/receipts/analyze", request_data)

        self.assertEqual(status, 200)
        self.assertEqual(payload["date"], "2026-09-14")
        self.assertEqual(payload["total"], "12.50")
        self.assertEqual(payload["items"][0]["amount"], "4.25")
        request = urlopen.call_args.args[0]
        sent_payload = json.loads(request.data)
        self.assertEqual(request.full_url, "http://127.0.0.1:11434/api/chat")
        self.assertEqual(sent_payload["model"], "gemma3:4b")
        self.assertEqual(sent_payload["messages"][0]["images"], [self.valid_receipt_request()["image"]])
        self.assertEqual(sent_payload["options"]["temperature"], 0)
        schema = sent_payload["format"]
        self.assertEqual(schema["type"], "object")
        self.assertEqual(schema["required"], ["date", "total", "items", "warnings"])
        self.assertEqual(schema["properties"]["date"]["pattern"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertEqual(schema["properties"]["total"]["type"], "string")
        self.assertEqual(schema["properties"]["total"]["pattern"], r"^[0-9]+(?:\.[0-9]{1,2})?$")
        item_schema = schema["properties"]["items"]["items"]
        self.assertEqual(item_schema["required"], ["name", "amount", "category"])
        self.assertEqual(item_schema["properties"]["amount"]["pattern"], r"^[0-9]+(?:\.[0-9]{1,2})?$")
        self.assertEqual(item_schema["properties"]["category"]["enum"], ["Jedzenie", "Dom"])
        self.assertEqual(schema["properties"]["warnings"]["items"]["type"], "string")
        self.assertEqual(self.expense_count(), 0)

    def test_receipt_result_validation_distinguishes_date_and_total_boundaries(self):
        valid_result = {
            "date": "2026-09-14",
            "total": "12.50",
            "items": [],
            "warnings": [],
        }
        invalid_dates = ("2026-9-14", "2026-02-30")
        for invalid_date in invalid_dates:
            with self.subTest(date=invalid_date):
                result = dict(valid_result, date=invalid_date)
                with self.assertRaisesRegex(ValueError, "Receipt date"):
                    server.validate_receipt_result(json.dumps(result), ["Jedzenie", "Dom"])

        invalid_totals = ("12.501", 12.50, "0")
        for invalid_total in invalid_totals:
            with self.subTest(total=invalid_total):
                result = dict(valid_result, total=invalid_total)
                with self.assertRaisesRegex(ValueError, "Receipt total"):
                    server.validate_receipt_result(json.dumps(result), ["Jedzenie", "Dom"])

    def test_receipt_analysis_rejects_malformed_json_and_invalid_base64(self):
        status, payload = self.post("/api/receipts/analyze", b"{")
        self.assertEqual(status, 400)
        self.assertIn("error", payload)

        request = self.valid_receipt_request()
        request["image"] = "%%%"
        status, payload = self.post("/api/receipts/analyze", request)
        self.assertEqual(status, 400)
        self.assertIn("base64", payload["error"])

    def test_receipt_analysis_rejects_oversize_and_mismatched_signature(self):
        image_bytes = b"\x89PNG\r\n\x1a\n" + b"x" * server.MAX_RECEIPT_IMAGE_BYTES
        request = self.valid_receipt_request()
        request["image"] = base64.b64encode(image_bytes).decode("ascii")
        request["mime_type"] = "image/png"
        status, payload = self.post("/api/receipts/analyze", request)
        self.assertEqual(status, 400)
        self.assertIn("8 MiB", payload["error"])

        request = self.valid_receipt_request()
        request["mime_type"] = "image/png"
        status, payload = self.post("/api/receipts/analyze", request)
        self.assertEqual(status, 400)
        self.assertIn("signature", payload["error"])

    def test_receipt_analysis_reports_ollama_unavailable(self):
        with patch("server.urllib.request.urlopen", side_effect=urllib.error.URLError("connection refused")):
            status, payload = self.post("/api/receipts/analyze", self.valid_receipt_request())

        self.assertEqual(status, 503)
        self.assertIn("Ollama is unavailable", payload["error"])

    def test_receipt_analysis_rejects_noncanonical_suggested_category(self):
        model_content = json.dumps({
            "date": "2026-09-14",
            "total": "2.00",
            "items": [{"name": "Wydatek", "amount": "2.00", "category": "Klientowa kategoria"}],
            "warnings": [],
        })
        ollama_response = MagicMock()
        ollama_response.__enter__.return_value = ollama_response
        ollama_response.read.return_value = json.dumps({"message": {"content": model_content}}).encode("utf-8")
        request = self.valid_receipt_request()
        request["categories"].append("Klientowa kategoria")

        with patch("server.urllib.request.urlopen", return_value=ollama_response):
            status, payload = self.post("/api/receipts/analyze", request)

        self.assertEqual(status, 502)
        self.assertIn("category", payload["error"])

    def test_receipt_analysis_reports_timeout_missing_model_and_malformed_output(self):
        timeout_error = urllib.error.URLError(socket.timeout("timed out"))
        with patch("server.urllib.request.urlopen", side_effect=timeout_error):
            status, payload = self.post("/api/receipts/analyze", self.valid_receipt_request())
        self.assertEqual(status, 504)
        self.assertIn("timed out", payload["error"])

        missing_model = urllib.error.HTTPError("http://127.0.0.1:11434/api/chat", 404, "Not Found", {}, None)
        with patch("server.urllib.request.urlopen", side_effect=missing_model):
            status, payload = self.post("/api/receipts/analyze", self.valid_receipt_request())
        self.assertEqual(status, 502)
        self.assertIn("Vision model not found", payload["error"])

        ollama_response = MagicMock()
        ollama_response.__enter__.return_value = ollama_response
        ollama_response.read.return_value = json.dumps({"message": {"content": "not json"}}).encode("utf-8")
        with patch("server.urllib.request.urlopen", return_value=ollama_response):
            status, payload = self.post("/api/receipts/analyze", self.valid_receipt_request())
        self.assertEqual(status, 502)
        self.assertIn("malformed JSON", payload["error"])

    def test_bulk_expense_invalid_batch_writes_nothing(self):
        status, payload = self.post("/api/expenses/bulk", {
            "expenses": [
                {"name": "Chleb", "category": "Jedzenie", "amount": "4.25", "date": "2026-09-14"},
                {"name": "Mleko", "category": "Jedzenie", "amount": "1.001", "date": "2026-09-14"},
            ],
        })

        self.assertEqual(status, 400)
        self.assertIn("error", payload)
        self.assertEqual(self.expense_count(), 0)

    def test_bulk_expense_rejects_noncanonical_category_without_inserting(self):
        status, payload = self.post("/api/expenses/bulk", {
            "categories": ["Jedzenie", "Klientowa kategoria"],
            "expenses": [
                {"name": "Chleb", "category": "Jedzenie", "amount": "4.25", "date": "2026-09-14"},
                {"name": "Wydatek", "category": "Klientowa kategoria", "amount": "2.00", "date": "2026-09-14"},
            ],
        })

        self.assertEqual(status, 400)
        self.assertIn("category", payload["error"])
        self.assertEqual(self.expense_count(), 0)

    def test_bulk_expense_persists_multiple_exact_cent_amounts(self):
        status, payload = self.post("/api/expenses/bulk", {
            "expenses": [
                {"name": "Chleb", "category": "Jedzenie", "amount": "12.34", "date": "2026-09-14"},
                {"name": "Bułka", "category": "Jedzenie", "amount": "0.01", "date": "2026-09-14"},
            ],
        })

        self.assertEqual(status, 201)
        self.assertEqual(len(payload["created_ids"]), 2)
        self.assertEqual(payload["dashboard"]["total"], 1235)
        self.assertEqual(
            [expense["amount"] for expense in payload["dashboard"]["expenses"]],
            [1, 1234],
        )
        receipt_ids = [expense["receipt_id"] for expense in payload["dashboard"]["expenses"]]
        self.assertTrue(receipt_ids[0])
        self.assertEqual(receipt_ids, [receipt_ids[0], receipt_ids[0]])

    def test_manual_expense_has_null_receipt_id(self):
        status, payload = self.post("/api/expenses", {
            "name": "Bilet",
            "category": "Transport",
            "amount": "4.50",
            "date": server.date.today().isoformat(),
        })

        self.assertEqual(status, 201)
        self.assertIsNone(payload["expenses"][0]["receipt_id"])


if __name__ == "__main__":
    unittest.main()
