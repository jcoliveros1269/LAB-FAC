import os
import sys
import unittest
from fastapi.testclient import TestClient

# Asegurar que importamos la app del backend correctamente
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app
from app.database import get_db, SessionLocal
from app.models.accounting import JournalEntry
from app.models.sales import DocumentType

class TestAccountingSystemIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app.core.security import create_access_token
        cls.admin_token = create_access_token({"sub": "admin", "role": "ADMIN", "name": "Admin Test"})
        cls.client = TestClient(app)
        cls.client.headers = {"Authorization": f"Bearer {cls.admin_token}"}

    def test_01_create_raw_material_generates_accounting_entry(self):
        """ Test: Crear materia prima (filamento) genera asiento contable (Debe 140505 == Haber 110505) """
        import time
        uid = str(int(time.time()))
        color_name = f"Verde Neón Test {uid}"

        payload = {
            "name": f"Filamento PLA Pro {uid}",
            "material_type": "PLA Pro Test",
            "color": color_name,
            "initial_stock_g": 1000.0,
            "outgoing_stock_g": 0.0,
            "current_stock_g": 1000.0,
            "cost_per_g": 90.0,
            "min_stock_alert_g": 200.0
        }
        response = self.client.post("/api/inventory/materials", json=payload)
        self.assertEqual(response.status_code, 200, f"Error creando material: {response.text}")
        mat_data = response.json()
        self.assertIsNotNone(mat_data.get("id"))

        # Verificar en libro diario
        j_resp = self.client.get("/api/accounting/journal")
        self.assertEqual(j_resp.status_code, 200)
        entries = j_resp.json()
        
        # Buscar el asiento de este material
        match_entries = [e for e in entries if color_name in e.get("description", "")]
        self.assertEqual(len(match_entries), 2, "Se esperaban 2 asientos contables (Debe y Haber)")
        
        debit_sum = sum(e["debit"] for e in match_entries)
        credit_sum = sum(e["credit"] for e in match_entries)
        self.assertAlmostEqual(debit_sum, 90000.0, places=2)
        self.assertAlmostEqual(credit_sum, 90000.0, places=2)
        print("\n -> [PASS] Asiento de Materia Prima verificado (90,000 COP Debe == Haber)")

    def test_02_create_finished_product_generates_accounting_entry(self):
        """ Test: Crear producto terminado genera asiento contable (Debe 143005 == Haber 613505) """
        import time
        uid = str(int(time.time()))
        prod_name = f"Soporte Auriculares 3D Premium {uid}"

        payload = {
            "serial": f"PROD-AUR-{uid}",
            "name": prod_name,
            "color": "Negro Matte",
            "material_type": "PLA",
            "initial_stock_units": 10,
            "outgoing_units": 0,
            "current_stock_units": 10,
            "unit_cost_cop": 15000.0,
            "sale_price_with_margin": 42000.0,
            "min_stock_alert": 5
        }
        response = self.client.post("/api/inventory/products", json=payload)
        self.assertEqual(response.status_code, 200, f"Error creando producto terminado: {response.text}")
        
        # Verificar en libro diario
        j_resp = self.client.get("/api/accounting/journal")
        entries = j_resp.json()
        
        match_entries = [e for e in entries if prod_name in e.get("description", "")]
        self.assertEqual(len(match_entries), 2, "Se esperaban 2 asientos contables para producto terminado")
        
        debit_sum = sum(e["debit"] for e in match_entries)
        credit_sum = sum(e["credit"] for e in match_entries)
        expected_total = 10 * 15000.0 # 150,000 COP
        self.assertAlmostEqual(debit_sum, expected_total, places=2)
        self.assertAlmostEqual(credit_sum, expected_total, places=2)
        print(" -> [PASS] Asiento de Producto Terminado verificado (150,000 COP Debe 143005 == Haber 613505)")

    def test_03_calculate_3d_production_deducts_and_generates_journal(self):
        """ Test: Calculadora de Producción 3D descuenta materia prima y genera asiento """
        payload = {
            "project_code": "TEST-PROD-99",
            "project_name": "Llaveros Personalizados 3D",
            "quantity": 5,
            "print_hours": 2.5,
            "filament1_type": "PLA Pro Test",
            "filament1_color": "Verde Neón Test",
            "filament1_grams": 40.0,
            "additional_expenses": 2000.0,
            "deduct_from_inventory": True
        }
        response = self.client.post("/api/production/calculate", json=payload)
        self.assertEqual(response.status_code, 200, f"Error en cálculo de producción: {response.text}")
        
        # Verificar en libro diario
        j_resp = self.client.get("/api/accounting/journal")
        entries = j_resp.json()
        match_entries = [e for e in entries if "TEST-PROD-99" in e.get("description", "")]
        self.assertTrue(len(match_entries) >= 2, "Se esperaban asientos contables por consumo de material")
        
        debit_sum = sum(e["debit"] for e in match_entries)
        credit_sum = sum(e["credit"] for e in match_entries)
        self.assertAlmostEqual(debit_sum, credit_sum, places=2)
        print(" -> [PASS] Asiento por Consumo de Producción 3D verificado (Partida Doble Ok)")

    def test_04_sales_invoice_conversion_generates_income_entry(self):
        """ Test: Cotización convertida a factura genera ingreso contable (Debe 110505 == Haber 413505) """
        import time
        uid = str(int(time.time()))
        doc_num = f"COT-TEST-{uid}"
        fac_num = f"FAC-TEST-{uid}"

        # 1. Crear Cotización
        quote_payload = {
            "doc_number": doc_num,
            "doc_type": "COTIZACION",
            "customer_id": 1,
            "subtotal": 200000.0,
            "discount": 0.0,
            "tax": 0.0,
            "total": 200000.0,
            "status": "DRAFT",
            "items": [
                {"product_name": "Figura Coleccionable 3D", "quantity": 2, "unit_price": 100000.0, "total_price": 200000.0}
            ]
        }
        q_resp = self.client.post("/api/sales/documents", json=quote_payload)
        self.assertEqual(q_resp.status_code, 200)
        q_id = q_resp.json()["id"]

        # 2. Convertir a Factura
        conv_resp = self.client.post(f"/api/sales/documents/{q_id}/convert-to-invoice")
        self.assertEqual(conv_resp.status_code, 200)

        # 3. Verificar libro diario
        j_resp = self.client.get("/api/accounting/journal")
        entries = j_resp.json()
        match_entries = [e for e in entries if fac_num in e.get("description", "")]
        self.assertEqual(len(match_entries), 2)
        
        debit_sum = sum(e["debit"] for e in match_entries)
        credit_sum = sum(e["credit"] for e in match_entries)
        self.assertAlmostEqual(debit_sum, 200000.0, places=2)
        self.assertAlmostEqual(credit_sum, 200000.0, places=2)
        print(" -> [PASS] Factura de Venta convertida e Ingreso Contable registrado (200,000 COP Debe == Haber)")

    def test_05_cashflow_entry_synchronizes_journal(self):
        """ Test: Movimiento en Flujo de Caja crea asiento en Libro Diario """
        import time
        uid = str(int(time.time()))
        desc = f"Pago Mantenimiento Boquilla Impresora 3D #{uid}"

        cash_payload = {
            "record_date": "2026-08-11T12:00:00.000Z",
            "description": desc,
            "category": "Equipos y Maquinaria",
            "income": 0.0,
            "credit": 35000.0
        }
        cf_resp = self.client.post("/api/accounting/cashflow", json=cash_payload)
        self.assertEqual(cf_resp.status_code, 200)

        # Verificar en libro diario
        j_resp = self.client.get("/api/accounting/journal")
        entries = j_resp.json()
        match_entries = [e for e in entries if desc in e.get("description", "")]
        self.assertEqual(len(match_entries), 2)
        
        debit_sum = sum(e["debit"] for e in match_entries)
        credit_sum = sum(e["credit"] for e in match_entries)
        self.assertAlmostEqual(debit_sum, 35000.0, places=2)
        self.assertAlmostEqual(credit_sum, 35000.0, places=2)
        print(" -> [PASS] Flujo de Caja sincronizado con Libro Diario (35,000 COP Debe == Haber)")

    def test_06_global_double_entry_balance_and_financial_reports(self):
        """ Test Global: Verificar Partida Doble en TODO el Libro Diario y Balance General """
        j_resp = self.client.get("/api/accounting/journal")
        entries = j_resp.json()

        # Agrupar por entry_number
        entries_by_num = {}
        for e in entries:
            num = e["entry_number"]
            if num not in entries_by_num:
                entries_by_num[num] = []
            entries_by_num[num].append(e)

        for num, items in entries_by_num.items():
            tot_debit = sum(i["debit"] for i in items)
            tot_credit = sum(i["credit"] for i in items)
            self.assertAlmostEqual(tot_debit, tot_credit, places=2,
                msg=f"Desbalance en asiento #{num}: Debe ({tot_debit}) != Haber ({tot_credit})")

        # Total acumulado
        total_debit_global = sum(e["debit"] for e in entries)
        total_credit_global = sum(e["credit"] for e in entries)
        self.assertAlmostEqual(total_debit_global, total_credit_global, places=2)

    def test_07_all_invoices_exist_in_journal(self):
        """ Test: Todas las facturas en el sistema deben tener sus asientos contables correspondientes en el Libro Diario """
        db = SessionLocal()
        invoices = db.query(DocumentType).filter(
            (DocumentType.doc_type == "FACTURA") | (DocumentType.status.in_(["INVOICED", "PAID"]))
        ).all()

        j_resp = self.client.get("/api/accounting/journal")
        self.assertEqual(j_resp.status_code, 200)
        entries = j_resp.json()

        for inv in invoices:
            match_entries = [e for e in entries if inv.doc_number in e.get("description", "")]
            self.assertTrue(len(match_entries) >= 2, f"La factura {inv.doc_number} no tiene asientos contables en el Libro Diario")
            debit_sum = sum(e["debit"] for e in match_entries)
            credit_sum = sum(e["credit"] for e in match_entries)
            self.assertAlmostEqual(debit_sum, credit_sum, places=2)
            self.assertAlmostEqual(debit_sum, inv.total, places=2)

        print(f" -> [PASS] Verificado: El 100% de las {len(invoices)} facturas registradas estan en el Libro Diario con partida doble.")
        db.close()

if __name__ == "__main__":
    unittest.main()
