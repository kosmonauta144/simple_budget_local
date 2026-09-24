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
                "INSERT INTO recurring_expenses (name, category, amount, payment_deadline, is_paid) VALUES (?, ?, ?, ?, ?)",
                ("Internet", "Media", 9900, 15, 0),
            )
            connection.commit()

        dashboard = server.get_dashboard_data()
        self.assertEqual(dashboard["recurring_expenses"][0]["payment_deadline"], 15)
        self.assertEqual(dashboard["recurring_expenses"][0]["is_paid"], 0)


if __name__ == "__main__":
    unittest.main()
