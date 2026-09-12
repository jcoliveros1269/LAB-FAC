import sys
import os
from fastapi.testclient import TestClient

# Asegurar import de app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app

client = TestClient(app)

def test_e2e_complete_workflow():
    print("\n[TEST E2E] Iniciando prueba de ciclo de vida completo Prisma Lab...")

    # 1. Registrar Insumo de Filamento
    mat_payload = {
        "name": "PETG E2E Test Black 1kg",
        "color": "E2E-Negro-Test",
        "material_type": "PETG",
        "initial_stock_g": 1000.0,
        "outgoing_stock_g": 0.0,
        "current_stock_g": 1000.0,
        "cost_per_g": 68.0,
        "min_stock_alert_g": 200.0
    }
    res_mat = client.post("/api/inventory/materials", json=mat_payload)
    assert res_mat.status_code == 200, f"Error creando material: {res_mat.text}"
    mat_data = res_mat.json()
    mat_id = mat_data["id"]
    print(f"  [OK] 1. Filamento Creado ID: {mat_id} (Stock Inicial: {mat_data['initial_stock_g']}g)")

    # 2. Calcular Producción 3D con Descuento Automático de Stock
    calc_payload = {
        "project_code": "E2E-TEST-001",
        "project_name": "CARCASA MOTOR DRONE",
        "quantity": 2,
        "print_hours": 4.5,
        "filament1_type": "PETG",
        "filament1_color": "E2E-Negro-Test",
        "filament1_grams": 150.0,
        "additional_expenses": 2000.0,
        "deduct_from_inventory": True
    }
    res_calc = client.post("/api/production/calculate", json=calc_payload)
    assert res_calc.status_code == 200, f"Error en calculador 3D: {res_calc.text}"
    calc_data = res_calc.json()
    print(f"  [OK] 2. Calculo 3D Exitoso: Costo Unitario ${calc_data['total_unit_cost']:,.2f} | Precio Margen ${calc_data['suggested_price_margin']:,.2f}")

    # Verificar Descuento de Stock en Inventario (1000g - (150g * 2 und) = 700g)
    res_mat_check = client.get("/api/inventory/materials")
    updated_mat = next((m for m in res_mat_check.json() if m["id"] == mat_id), None)
    assert updated_mat is not None
    assert updated_mat["current_stock_g"] == 700.0, f"Stock no fue descontado correctamente: {updated_mat['current_stock_g']}g"
    print(f"  [OK] 2b. Descuento en Stock Verificado: Quedan {updated_mat['current_stock_g']}g (Descontados 300g)")

    # 3. Crear Cotización de Venta
    import time
    unique_suffix = int(time.time())
    doc_payload = {
        "doc_number": f"COT-E2E-{unique_suffix}",
        "doc_type": "COTIZACION",
        "subtotal": calc_data['suggested_price_margin'] * 2,
        "discount": 0.0,
        "tax": 0.0,
        "total": calc_data['suggested_price_margin'] * 2,
        "status": "QUOTED",
        "items": [
            {
                "product_name": calc_data['project_name'],
                "quantity": 2,
                "unit_grams": calc_data['total_grams'],
                "print_hours": calc_data['print_hours'],
                "unit_cost": calc_data['total_unit_cost'],
                "unit_price": calc_data['suggested_price_margin'],
                "total_price": calc_data['suggested_price_margin'] * 2
            }
        ]
    }
    res_doc = client.post("/api/sales/documents", json=doc_payload)
    assert res_doc.status_code == 200, f"Error creando cotización: {res_doc.text}"
    doc_data = res_doc.json()
    doc_id = doc_data["id"]
    print(f"  [OK] 3. Cotizacion {doc_data['doc_number']} Creada por Total ${doc_data['total']:,.2f}")

    # 4. Convertir a Factura & Auto-Generar Asiento Contable
    res_inv = client.post(f"/api/sales/documents/{doc_id}/convert-to-invoice")
    assert res_inv.status_code == 200, f"Error convirtiendo a factura: {res_inv.text}"
    inv_data = res_inv.json()
    assert inv_data["doc_type"] == "FACTURA"
    print(f"  [OK] 4. Cotizacion Convertida a Factura {inv_data['doc_number']}")

    # 5. Verificar Asiento Contable en Libro Diario y Partida Doble
    res_journal = client.get("/api/accounting/journal")
    assert res_journal.status_code == 200
    journal_entries = res_journal.json()

    # Filtrar entradas relacionadas con esta factura
    factura_entries = [j for j in journal_entries if inv_data['doc_number'] in j['description']]
    assert len(factura_entries) >= 2, "No se encontraron los 2 movimientos contables para la factura"

    total_debe = sum(j["debit"] for j in factura_entries)
    total_haber = sum(j["credit"] for j in factura_entries)

    assert round(total_debe, 2) == round(total_haber, 2), f"Desbalance en Libro Diario: Debe ${total_debe} != Haber ${total_haber}"
    print(f"  [OK] 5. Asiento Contable Verificado: Debe (${total_debe:,.2f}) == Haber (${total_haber:,.2f}) - Partida Doble OK!")

    print("\n[EXITO] PRUEBA INTEGRAL E2E COMPLETADA CON EXITO ABSOLUTO!\n")

if __name__ == "__main__":
    test_e2e_complete_workflow()
