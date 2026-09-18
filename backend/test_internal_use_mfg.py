import sys
import os
import json

from app.database import SessionLocal
from app.models.inventory import RawMaterial, FinishedProduct
from app.models.sales import DocumentType, SalesDocumentItem, Customer
from app.models.accounting import JournalEntry
from app.models.auth import User
from app.schemas.sales import SalesDocumentCreate, SalesDocumentItemCreate
from app.api.sales import create_sales_document, convert_quote_to_invoice, delete_sales_document

def run_tests():
    db = SessionLocal()
    print("=== INICIANDO TEST DE FABRICACIÓN DE USO INTERNO ===")

    # 1. Obtener o crear una bobina de prueba
    spool = db.query(RawMaterial).filter(RawMaterial.material_type.ilike("PETG")).first()
    if not spool:
        spool = RawMaterial(
            article_code="TEST-PETG-01",
            name="PETG Test Spool",
            brand="Toprint",
            material_type="PETG",
            color="Rojo Test",
            initial_stock_g=1000.0,
            outgoing_stock_g=0.0,
            current_stock_g=1000.0,
            cost_per_kg=65000.0,
            cost_per_g=65.0
        )
        db.add(spool)
        db.commit()
        db.refresh(spool)

    initial_out = spool.outgoing_stock_g or 0.0
    initial_curr = spool.current_stock_g or 0.0
    print(f"Bobina de prueba ID {spool.id}: {spool.name} - Stock actual: {initial_curr}g, Salida: {initial_out}g")

    dummy_user = db.query(User).first()
    if not dummy_user:
        dummy_user = User(username="admin_test", role="admin")

    # 2. TEST 1: Crear FACTURA directa de Uso Interno con filamento
    test_doc_num = f"FAC-TEST-INT-{int(os.urandom(4).hex(), 16) % 100000}"
    grams_to_consume = 150.0
    cost_mat = grams_to_consume * 65.0 # 9,750
    cost_energy = 1.5 * 0.15 * 763.2   # 171.72
    cost_deprec = 1.5 * 678.0          # 1,017.00
    cost_labor = (cost_mat + cost_energy + cost_deprec) * 0.019 # 207.84
    cost_add = 500.0
    total_cost = cost_mat + cost_energy + cost_deprec + cost_labor + cost_add # 11,646.56

    item_payload = SalesDocumentItemCreate(
        product_name="Pieza Soporte Taller Test",
        quantity=1,
        unit_grams=grams_to_consume,
        print_hours=1.5,
        unit_cost=total_cost,
        unit_price=0.0,
        total_price=total_cost,
        material_cost=cost_mat,
        energy_cost=cost_energy,
        depreciation_cost=cost_deprec,
        labor_cost=cost_labor,
        additional_cost=cost_add,
        filaments=[{
            "material_id": spool.id,
            "article_code": spool.article_code,
            "type": spool.material_type,
            "color": spool.color,
            "grams": grams_to_consume,
            "cost": cost_mat
        }]
    )

    doc_payload = SalesDocumentCreate(
        doc_number=test_doc_num,
        doc_type="FACTURA",
        subtotal=total_cost,
        discount=0.0,
        tax=0.0,
        total=total_cost,
        status="INVOICED",
        is_internal_use=True,
        items=[item_payload]
    )

    print(f"\n--- Creando Factura {test_doc_num} (Uso Interno) ---")
    created_doc = create_sales_document(doc=doc_payload, db=db, current_user=dummy_user)

    # Verificar que el material se descontó
    db.refresh(spool)
    expected_out = initial_out + grams_to_consume
    expected_curr = initial_curr - grams_to_consume
    print(f"Bobina tras crear factura: Salida = {spool.outgoing_stock_g}g (Esperado: {expected_out}g), Stock = {spool.current_stock_g}g (Esperado: {expected_curr}g)")
    assert abs(spool.outgoing_stock_g - expected_out) < 0.01, "Error: outgoing_stock_g no aumentó!"
    assert abs(spool.current_stock_g - expected_curr) < 0.01, "Error: current_stock_g no disminuyó!"
    print("[OK] PRUEBA 1 (Descuento de material físico): SUPERADA CON ÉXITO")

    # Verificar asiento contable generado
    entries = db.query(JournalEntry).filter(JournalEntry.description.ilike(f"%{test_doc_num}%")).all()
    print(f"\nAsientos contables creados para {test_doc_num} ({len(entries)} líneas):")
    total_deb = 0.0
    total_cred = 0.0
    affected_pucs = {}
    for e in entries:
        print(f"  #{e.entry_number} [{e.puc_code}] {e.account_name} | Debe: ${e.debit:,.2f} | Haber: ${e.credit:,.2f} | {e.description}")
        total_deb += e.debit
        total_cred += e.credit
        affected_pucs[e.puc_code] = e

    assert "152405" in affected_pucs, "Falta cuenta 152405 en Débito!"
    assert "140505" in affected_pucs, "Falta cuenta 140505 en Crédito (Inventario de Materias Primas)!"
    assert "513528" in affected_pucs, "Falta cuenta 513528 en Crédito (Energía)!"
    assert "516005" in affected_pucs, "Falta cuenta 516005 en Crédito (Depreciación)!"
    assert "510506" in affected_pucs, "Falta cuenta 510506 en Crédito (Mano de obra)!"
    assert "513505" in affected_pucs, "Falta cuenta 513505 en Crédito (Dotación/Insumos)!"

    print(f"Total Débitos: ${total_deb:,.2f} == Total Créditos: ${total_cred:,.2f}")
    assert round(total_deb, 2) == round(total_cred, 2), "Desbalance en partida doble!"
    print("[OK] PRUEBA 2 (Afectacion de todas las cuentas contables a descontar): SUPERADA CON EXITO")

    # Verificar producto terminado
    fin_prod = db.query(FinishedProduct).filter(
        FinishedProduct.name == item_payload.product_name,
        FinishedProduct.is_internal_use == True
    ).first()
    assert fin_prod is not None, "No se creo el producto terminado de uso interno!"
    assert fin_prod.is_internal_use == True, "El producto debe ser is_internal_use=True"
    assert fin_prod.sale_price_with_margin == 0.0, "El precio de venta debe ser $0"
    print(f"[OK] Producto terminado verificado: {fin_prod.serial} (is_internal_use={fin_prod.is_internal_use}, precio_venta={fin_prod.sale_price_with_margin})")

    # 3. TEST 3: Eliminar documento y verificar restauración de inventario
    print(f"\n--- Eliminando documento {test_doc_num} para verificar restauración ---")
    delete_sales_document(doc_id=created_doc.id, db=db, current_user=dummy_user)
    db.refresh(spool)
    print(f"Bobina tras eliminar: Salida = {spool.outgoing_stock_g}g, Stock = {spool.current_stock_g}g")
    assert abs(spool.outgoing_stock_g - initial_out) < 0.01, "Error: No se restauró outgoing_stock_g!"
    assert abs(spool.current_stock_g - initial_curr) < 0.01, "Error: No se restauró current_stock_g!"
    
    # Verificar que los asientos fueron anulados
    remaining_entries = db.query(JournalEntry).filter(JournalEntry.description.ilike(f"%{test_doc_num}%")).count()
    assert remaining_entries == 0, "No se eliminaron los asientos contables!"
    print("[OK] PRUEBA 3 (Restauracion de stock y anulacion de asientos): SUPERADA CON EXITO")

    # 4. TEST 4: Crear COTIZACIÓN y convertir a FACTURA
    print("\n--- Test 4: Crear COTIZACIÓN y convertir a FACTURA ---")
    cot_num = f"COT-TEST-INT-{int(os.urandom(4).hex(), 16) % 100000}"
    cot_payload = SalesDocumentCreate(
        doc_number=cot_num,
        doc_type="COTIZACION",
        subtotal=total_cost,
        discount=0.0,
        tax=0.0,
        total=total_cost,
        status="QUOTED",
        is_internal_use=True,
        items=[item_payload]
    )
    cot_doc = create_sales_document(doc=cot_payload, db=db, current_user=dummy_user)
    db.refresh(spool)
    # Como es cotización, no debe descontar material todavía
    assert abs(spool.outgoing_stock_g - initial_out) < 0.01, "Una cotización no debe descontar material!"

    # Ahora convertir a factura
    print(f"Convirtiendo {cot_num} a Factura...")
    inv_doc = convert_quote_to_invoice(doc_id=cot_doc.id, db=db)
    db.refresh(spool)
    assert abs(spool.outgoing_stock_g - expected_out) < 0.01, "Error: convert_quote_to_invoice no descontó material!"
    assert abs(spool.current_stock_g - expected_curr) < 0.01, "Error: convert_quote_to_invoice no redujo stock actual!"
    
    # Verificar asientos
    fac_converted_num = inv_doc.doc_number
    c_entries = db.query(JournalEntry).filter(JournalEntry.description.ilike(f"%{fac_converted_num}%")).all()
    assert len(c_entries) >= 2, "Error: No se crearon los asientos al convertir a factura!"
    assert any(e.puc_code == "140505" and e.credit > 0 for e in c_entries), "Falta descuento en cuenta 140505!"
    print("[OK] PRUEBA 4 (Conversion de Cotizacion a Factura con descuento fisico y contable): SUPERADA CON EXITO")

    # Limpiar
    delete_sales_document(doc_id=inv_doc.id, db=db, current_user=dummy_user)
    db.refresh(spool)
    assert abs(spool.outgoing_stock_g - initial_out) < 0.01

    print("\n=======================================================")
    print("TODAS LAS PRUEBAS DE FABRICACION Y CONTABILIDAD PASARON")
    print("=======================================================")
    db.close()

if __name__ == "__main__":
    run_tests()
