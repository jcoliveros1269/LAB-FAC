from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database import get_db
from app.models.sales import Customer, DocumentType, SalesDocumentItem
from app.models.accounting import JournalEntry
from app.models.inventory import FinishedProduct
from app.models.auth import User
from app.core.security import require_permission
from app.api.auth import log_audit_event
from app.schemas.sales import (
    CustomerResponse, CustomerCreate,
    SalesDocumentResponse, SalesDocumentCreate
)

router = APIRouter(prefix="/sales", tags=["Ventas & Cotizaciones"])

# --- CLIENTES ---

@router.get("/customers", response_model=List[CustomerResponse])
def get_customers(db: Session = Depends(get_db)):
    return db.query(Customer).all()

@router.post("/customers", response_model=CustomerResponse)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    db_customer = Customer(**customer.model_dump())
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.put("/customers/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: int, customer: CustomerCreate, db: Session = Depends(get_db)):
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    if customer.name:
        db_customer.name = customer.name
    if customer.email is not None:
        db_customer.email = customer.email
    if customer.phone is not None:
        db_customer.phone = customer.phone
    if customer.address is not None:
        db_customer.address = customer.address
    
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    db.delete(db_customer)
    db.commit()
    return {"message": "Cliente eliminado correctamente"}

# --- COTIZACIONES Y FACTURAS ---

@router.get("/documents", response_model=List[SalesDocumentResponse])
def get_sales_documents(doc_type: str = None, db: Session = Depends(get_db)):
    query = db.query(DocumentType)
    if doc_type:
        query = query.filter(DocumentType.doc_type == doc_type.upper())
    return query.order_by(DocumentType.id.desc()).all()

@router.post("/documents", response_model=SalesDocumentResponse)
def create_sales_document(
    doc: SalesDocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("sales", "write"))
):
    # Determinar si es para uso interno (por flag explícito o por coincidencia en cliente)
    is_internal = bool(doc.is_internal_use)
    if not is_internal and doc.customer_id:
        cust = db.query(Customer).filter(Customer.id == doc.customer_id).first()
        if cust:
            c_text = f"{cust.name} {cust.email or ''}".lower()
            if any(k in c_text for k in ["uso interno", "interno", "taller", "dotacion", "dotación", "propio", "prisma lab"]):
                is_internal = True

    db_doc = DocumentType(
        doc_number=doc.doc_number,
        doc_type=doc.doc_type.upper(),
        customer_id=doc.customer_id,
        subtotal=doc.subtotal,
        discount=doc.discount,
        tax=doc.tax,
        total=doc.total,
        status=doc.status,
        is_internal_use=is_internal
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    for item in doc.items:
        db_item = SalesDocumentItem(
            document_id=db_doc.id,
            **item.model_dump()
        )
        db.add(db_item)

    # Registrar en Inventario de Producto Terminado al generar Factura Directa
    if db_doc.doc_type == "FACTURA" or db_doc.status in ["INVOICED", "PAID"]:
        for item in doc.items:
            existing_prod = db.query(FinishedProduct).filter(
                FinishedProduct.name.ilike(item.product_name.strip()),
                FinishedProduct.is_internal_use == is_internal
            ).first()

            if existing_prod:
                existing_prod.initial_stock_units = max(0, (existing_prod.initial_stock_units or 0) + item.quantity)
                existing_prod.current_stock_units = max(0, (existing_prod.current_stock_units or 0) + item.quantity)
                if item.unit_cost and item.unit_cost > 0:
                    existing_prod.unit_cost_cop = max(0.0, item.unit_cost)
                if is_internal:
                    existing_prod.sale_price_with_margin = 0.0
                    existing_prod.is_internal_use = True
                elif item.unit_price and item.unit_price > 0:
                    existing_prod.sale_price_with_margin = max(0.0, item.unit_price)
                db.add(existing_prod)
            else:
                serial_prefix = "INT" if is_internal else "PROD"
                clean_doc_num = db_doc.doc_number.replace('FAC-', '').replace('COT-', '')
                new_prod = FinishedProduct(
                    serial=f"{serial_prefix}-{clean_doc_num}",
                    name=item.product_name.strip(),
                    color="Multicolor",
                    material_type="Pieza 3D",
                    initial_stock_units=max(0, item.quantity),
                    outgoing_units=0,
                    current_stock_units=max(0, item.quantity),
                    unit_cost_cop=max(0.0, item.unit_cost or 0.0),
                    sale_price_with_margin=0.0 if is_internal else max(0.0, item.unit_price or 0.0),
                    min_stock_alert=5,
                    is_internal_use=is_internal
                )
                db.add(new_prod)

    # Auto-generar asiento contable si nace como FACTURA / PAID
    if db_doc.doc_type == "FACTURA" or db_doc.status in ["INVOICED", "PAID"]:
        next_entry_num = (db.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first().entry_number or 0) + 1
        
        if is_internal:
            # Factura de Uso Interno: solo a costo de fabricación (152405 Débito / 513505 Crédito)
            total_mfg_cost = sum((item.unit_cost or 0.0) * (item.quantity or 1) for item in doc.items)
            if total_mfg_cost <= 0:
                total_mfg_cost = db_doc.total
            j1 = JournalEntry(
                entry_number=next_entry_num,
                entry_date=datetime.utcnow(),
                puc_code="152405",
                account_name="Herramientas y Accesorios de Taller (Uso Propio)",
                description=f"Alta Pieza Uso Interno Factura {db_doc.doc_number}",
                debit=round(total_mfg_cost, 2),
                credit=0.0
            )
            j2 = JournalEntry(
                entry_number=next_entry_num,
                entry_date=datetime.utcnow(),
                puc_code="513505",
                account_name="Dotación y Mantenimiento de Taller",
                description=f"Alta Pieza Uso Interno Factura {db_doc.doc_number}",
                debit=0.0,
                credit=round(total_mfg_cost, 2)
            )
            db.add(j1)
            db.add(j2)
        else:
            # Asiento 1: Débito Caja
            j1 = JournalEntry(
                entry_number=next_entry_num,
                entry_date=datetime.utcnow(),
                puc_code="110505",
                account_name="Caja General",
                description=f"Venta Factura {db_doc.doc_number}",
                debit=db_doc.total,
                credit=0.0
            )
            # Asiento 2: Crédito Ingresos Ventas
            j2 = JournalEntry(
                entry_number=next_entry_num,
                entry_date=datetime.utcnow(),
                puc_code="413505",
                account_name="Comercio al por Mayor y Menor (Ventas 3D)",
                description=f"Venta Factura {db_doc.doc_number}",
                debit=0.0,
                credit=db_doc.total
            )
            db.add(j1)
            db.add(j2)

    db.commit()
    db.expire_all()
    db.refresh(db_doc)

    log_audit_event(
        db=db,
        username=current_user.username,
        module="sales",
        action="CREATE_DOCUMENT",
        description=f"Generó {db_doc.doc_type} #{db_doc.doc_number} (Total: ${db_doc.total:,.2f}{' [Uso Interno]' if is_internal else ''})",
        user_id=current_user.id
    )

    return db_doc

@router.post("/documents/{doc_id}/convert-to-invoice", response_model=SalesDocumentResponse)
def convert_quote_to_invoice(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(DocumentType).filter(DocumentType.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    doc.doc_type = "FACTURA"
    doc.doc_number = doc.doc_number.replace("COT-", "FAC-")
    doc.status = "INVOICED"

    # Determinar si es uso interno
    is_internal = bool(doc.is_internal_use)
    if not is_internal and doc.customer_id:
        cust = db.query(Customer).filter(Customer.id == doc.customer_id).first()
        if cust:
            c_text = f"{cust.name} {cust.email or ''}".lower()
            if any(k in c_text for k in ["uso interno", "interno", "taller", "dotacion", "dotación", "propio", "prisma lab"]):
                is_internal = True
    doc.is_internal_use = is_internal

    # Registrar en Inventario de Producto Terminado al convertir a Factura
    doc_items = db.query(SalesDocumentItem).filter(SalesDocumentItem.document_id == doc.id).all()
    for item in doc_items:
        existing_prod = db.query(FinishedProduct).filter(
            FinishedProduct.name.ilike(item.product_name.strip()),
            FinishedProduct.is_internal_use == is_internal
        ).first()

        if existing_prod:
            existing_prod.initial_stock_units = max(0, (existing_prod.initial_stock_units or 0) + item.quantity)
            existing_prod.current_stock_units = max(0, (existing_prod.current_stock_units or 0) + item.quantity)
            if item.unit_cost and item.unit_cost > 0:
                existing_prod.unit_cost_cop = max(0.0, item.unit_cost)
            if is_internal:
                existing_prod.sale_price_with_margin = 0.0
                existing_prod.is_internal_use = True
            elif item.unit_price and item.unit_price > 0:
                existing_prod.sale_price_with_margin = max(0.0, item.unit_price)
            db.add(existing_prod)
        else:
            serial_prefix = "INT" if is_internal else "PROD"
            clean_doc_num = doc.doc_number.replace('FAC-', '').replace('COT-', '')
            new_prod = FinishedProduct(
                serial=f"{serial_prefix}-{clean_doc_num}",
                name=item.product_name.strip(),
                color="Multicolor",
                material_type="Pieza 3D",
                initial_stock_units=max(0, item.quantity),
                outgoing_units=0,
                current_stock_units=max(0, item.quantity),
                unit_cost_cop=max(0.0, item.unit_cost or 0.0),
                sale_price_with_margin=0.0 if is_internal else max(0.0, item.unit_price or 0.0),
                min_stock_alert=5,
                is_internal_use=is_internal
            )
            db.add(new_prod)

    # Generar Asiento Contable Automático en el Libro Diario
    next_entry = db.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first()
    entry_num = (next_entry.entry_number if next_entry else 0) + 1

    if is_internal:
        total_mfg_cost = sum((item.unit_cost or 0.0) * (item.quantity or 1) for item in doc_items)
        if total_mfg_cost <= 0:
            total_mfg_cost = doc.total
        j_debit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code="152405",
            account_name="Herramientas y Accesorios de Taller (Uso Propio)",
            description=f"Alta Pieza Uso Interno Factura {doc.doc_number}",
            debit=round(total_mfg_cost, 2),
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code="513505",
            account_name="Dotación y Mantenimiento de Taller",
            description=f"Alta Pieza Uso Interno Factura {doc.doc_number}",
            debit=0.0,
            credit=round(total_mfg_cost, 2)
        )
    else:
        j_debit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code="110505",
            account_name="Caja General",
            description=f"Recaudo por Factura {doc.doc_number}",
            debit=doc.total,
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code="413505",
            account_name="Comercio al por Mayor y Menor (Ventas 3D)",
            description=f"Ingreso por Venta Factura {doc.doc_number}",
            debit=0.0,
            credit=doc.total
        )

    db.add(j_debit)
    db.add(j_credit)

    db.commit()
    db.expire_all()
    db.refresh(doc)
    return doc

@router.delete("/documents/{doc_id}")
def delete_sales_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("sales", "delete"))
):
    doc = db.query(DocumentType).filter(DocumentType.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    doc_info = f"{doc.doc_type} #{doc.doc_number}"
    
    # Anular asientos contables asociados si era factura
    db.query(JournalEntry).filter(
        JournalEntry.description.ilike(f"%{doc.doc_number}%")
    ).delete(synchronize_session=False)

    db.delete(doc)
    db.commit()

    log_audit_event(
        db=db,
        username=current_user.username,
        module="sales",
        action="DELETE_DOCUMENT",
        description=f"Eliminó documento: {doc_info}",
        user_id=current_user.id
    )

    return {"message": "Documento eliminado correctamente"}

