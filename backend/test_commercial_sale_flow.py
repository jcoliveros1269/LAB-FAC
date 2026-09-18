import os
import sys

from app.database import SessionLocal
from app.models.inventory import FinishedProduct, RawMaterial
from app.models.sales import DocumentType, SalesDocumentItem
from app.models.accounting import JournalEntry
from app.models.auth import User
from app.schemas.sales import SalesDocumentCreate, SalesDocumentItemCreate
from app.api.sales import create_sales_document, convert_quote_to_invoice, delete_sales_document

def run_tests():
    db = SessionLocal()
    print("=== INICIANDO TEST DE FACTURACIÓN COMERCIAL Y RETIRO DE INVENTARIO ===")

    dummy_user = db.query(User).first()
    if not dummy_user:
        dummy_user = User(username="admin_test", role="admin")

    # 1. Crear o recuperar producto terminado en vitrina
    prod_name = "Soporte Gamer Test Vitrina"
    prod = db.query(FinishedProduct).filter(FinishedProduct.name == prod_name, FinishedProduct.is_internal_use == False).first()
    if not prod:
        prod = FinishedProduct(
            serial="3D-GAMER-TEST",
            name=prod_name,
            color="Negro",
            material_type="PETG",
            initial_stock_units=10,
            outgoing_units=0,
            current_stock_units=10,
            unit_cost_cop=8000.0,
            sale_price_with_margin=20000.0,
            min_stock_alert=2,
            is_internal_use=False
        )
        db.add(prod)
        db.commit()
        db.refresh(prod)
    else:
        prod.current_stock_units = 10
        prod.outgoing_units = 0
        db.commit()
        db.refresh(prod)

    print(f"Producto en Vitrina: {prod.name} | Stock actual: {prod.current_stock_units} unds | Costo: ${prod.unit_cost_cop:,.2f} | Precio: ${prod.sale_price_with_margin:,.2f}")
    assert prod.current_stock_units == 10

    # 2. TEST 1: Facturar 3 unidades directamente
    qty_sold = 3
    unit_price = 20000.0
    total_sale = qty_sold * unit_price # 60,000
    total_cost = qty_sold * prod.unit_cost_cop # 24,000
    doc_num_1 = f"FAC-TEST-COM-{int(os.urandom(4).hex(), 16) % 100000}"

    item_payload = SalesDocumentItemCreate(
        product_name=prod_name,
        quantity=qty_sold,
        unit_grams=0.0,
        print_hours=0.0,
        unit_cost=prod.unit_cost_cop,
        unit_price=unit_price,
        total_price=total_sale
    )

    doc_payload = SalesDocumentCreate(
        doc_number=doc_num_1,
        doc_type="FACTURA",
        subtotal=total_sale,
        discount=0.0,
        tax=0.0,
        total=total_sale,
        status="INVOICED",
        is_internal_use=False,
        items=[item_payload]
    )

    print(f"\n--- Creando Factura {doc_num_1} por {qty_sold} unidades ---")
    created_doc = create_sales_document(doc=doc_payload, db=db, current_user=dummy_user)

    # Verificar que el stock SE RETIRÓ de vitrina (10 - 3 = 7)
    db.refresh(prod)
    print(f"Stock tras facturación: {prod.current_stock_units} unds (Esperado: 7), Salidas: {prod.outgoing_units} (Esperado: 3)")
    assert prod.current_stock_units == 7, f"Error: Stock no se descontó, actual={prod.current_stock_units}"
    assert prod.outgoing_units == 3, f"Error: Outgoing units erróneo={prod.outgoing_units}"
    print("[OK] PRUEBA 1 (Retiro de stock físico en Vitrina): SUPERADA CON ÉXITO")

    # Verificar asientos contables
    entries = db.query(JournalEntry).filter(JournalEntry.description.ilike(f"%{doc_num_1}%")).all()
    print(f"\nAsientos contables creados para {doc_num_1} ({len(entries)} líneas):")
    pucs = {}
    tot_deb = 0.0
    tot_cred = 0.0
    for e in entries:
        print(f"  #{e.entry_number} [{e.puc_code}] {e.account_name} | Debe: ${e.debit:,.2f} | Haber: ${e.credit:,.2f} | {e.description}")
        pucs[e.puc_code] = e
        tot_deb += e.debit
        tot_cred += e.credit

    assert "110505" in pucs, "Falta cuenta 110505 (Caja General)"
    assert "412005" in pucs, "Falta cuenta 412005 (Ingresos - Industrias Manufactureras)"
    assert "612005" in pucs, "Falta cuenta 612005 (Costo de Ventas - Industrias Manufactureras)"
    assert "143005" in pucs, "Falta cuenta 143005 (Inventario de Productos Terminados)"

    assert pucs["110505"].debit == total_sale
    assert pucs["412005"].credit == total_sale
    assert pucs["612005"].debit == total_cost
    assert pucs["143005"].credit == total_cost

    assert round(tot_deb, 2) == round(tot_cred, 2), "Desbalance en partida doble!"
    print(f"Total Débitos: ${tot_deb:,.2f} == Total Créditos: ${tot_cred:,.2f}")
    print("[OK] PRUEBA 2 (Partida doble exacta con cuentas manufactureras 4120 / 6120 / 1430): SUPERADA CON ÉXITO")

    # 3. TEST 3: Eliminar factura y restaurar stock en vitrina
    print(f"\n--- Eliminando factura {doc_num_1} para verificar restauración ---")
    delete_sales_document(doc_id=created_doc.id, db=db, current_user=dummy_user)
    db.refresh(prod)
    print(f"Stock tras eliminar factura: {prod.current_stock_units} unds (Esperado: 10), Salidas: {prod.outgoing_units} (Esperado: 0)")
    assert prod.current_stock_units == 10
    assert prod.outgoing_units == 0
    print("[OK] PRUEBA 3 (Restauración de stock al anular factura): SUPERADA CON ÉXITO")

    # 4. TEST 4: Cotizar y luego convertir a Factura
    print("\n--- Test 4: Cotizar y convertir a Factura ---")
    cot_num = f"COT-TEST-COM-{int(os.urandom(4).hex(), 16) % 100000}"
    cot_payload = SalesDocumentCreate(
        doc_number=cot_num,
        doc_type="COTIZACION",
        subtotal=total_sale,
        discount=0.0,
        tax=0.0,
        total=total_sale,
        status="QUOTED",
        is_internal_use=False,
        items=[item_payload]
    )
    cot_doc = create_sales_document(doc=cot_payload, db=db, current_user=dummy_user)
    db.refresh(prod)
    assert prod.current_stock_units == 10, "La cotización no debe descontar unidades!"

    inv_doc = convert_quote_to_invoice(doc_id=cot_doc.id, db=db)
    db.refresh(prod)
    print(f"Stock tras convertir cotización a factura: {prod.current_stock_units} unds (Esperado: 7)")
    assert prod.current_stock_units == 7, "Al convertir a factura debe descontar las unidades de vitrina!"

    inv_entries = db.query(JournalEntry).filter(JournalEntry.description.ilike(f"%{inv_doc.doc_number}%")).all()
    assert any(e.puc_code == "412005" for e in inv_entries), "Falta cuenta 412005 en conversión"
    assert any(e.puc_code == "612005" for e in inv_entries), "Falta cuenta 612005 en conversión"
    assert any(e.puc_code == "143005" for e in inv_entries), "Falta cuenta 143005 en conversión"
    print("[OK] PRUEBA 4 (Conversión de cotización a factura con descuento de vitrina y PUC manufactura): SUPERADA CON ÉXITO")

    # Limpiar
    delete_sales_document(doc_id=inv_doc.id, db=db, current_user=dummy_user)
    db.refresh(prod)
    assert prod.current_stock_units == 10

    print("\n=======================================================")
    print("TODAS LAS PRUEBAS DE FACTURACIÓN Y CONTABILIDAD PASARON")
    print("=======================================================")
    db.close()

if __name__ == "__main__":
    run_tests()
