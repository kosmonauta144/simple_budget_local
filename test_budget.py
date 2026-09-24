import os
import sqlite3
import tempfile
import unittest

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


if __name__ == "__main__":
    unittest.main()
