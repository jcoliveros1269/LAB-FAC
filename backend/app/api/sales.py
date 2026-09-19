from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

import json
from app.database import get_db
from app.models.sales import Customer, DocumentType, SalesDocumentItem
from app.models.accounting import JournalEntry
from app.models.inventory import FinishedProduct, RawMaterial
from app.models.auth import User
from app.core.security import require_permission
from app.api.auth import log_audit_event
from app.schemas.sales import (
    CustomerResponse, CustomerCreate,
    SalesDocumentResponse, SalesDocumentCreate, SalesDocumentDateUpdate
)
from app.api.inventory import parse_entry_datetime

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

def deduct_materials_for_document(db: Session, items: List[SalesDocumentItem]):
    """
    Descuenta el inventario físico de materias primas (filamentos)
    usados en la fabricación de las piezas de la factura.
    """
    for item in items:
        fils = []
        if getattr(item, "filaments_data", None):
            try:
                fils = json.loads(item.filaments_data)
            except Exception:
                fils = []

        if fils:
            for f in fils:
                f_mat_id = f.get("material_id")
                f_code = (f.get("article_code") or "").strip()
                f_type = (f.get("type") or "").strip()
                f_color = (f.get("color") or "").strip()
                f_grams = float(f.get("grams") or 0.0)
                if f_grams <= 0:
                    continue

                mat = None
                if f_mat_id:
                    try:
                        mat = db.query(RawMaterial).filter(RawMaterial.id == int(f_mat_id)).first()
                    except (ValueError, TypeError):
                        pass

                if not mat and f_code:
                    mat = db.query(RawMaterial).filter(RawMaterial.article_code.ilike(f_code)).first()

                if not mat and f_type:
                    query = db.query(RawMaterial).filter(RawMaterial.material_type.ilike(f_type))
                    if f_color:
                        mat = query.filter(RawMaterial.color.ilike(f_color), RawMaterial.current_stock_g > 0).order_by(RawMaterial.id.desc()).first()
                        if not mat:
                            mat = query.filter(RawMaterial.color.ilike(f_color)).order_by(RawMaterial.id.desc()).first()
                        if not mat:
                            mat = query.filter(RawMaterial.color.ilike(f"%{f_color}%")).order_by(RawMaterial.id.desc()).first()
                    if not mat:
                        mat = query.order_by(RawMaterial.id.desc()).first()

                if mat:
                    mat.outgoing_stock_g = (mat.outgoing_stock_g or 0.0) + f_grams
                    mat.current_stock_g = max(0.0, (mat.initial_stock_g or 0.0) - mat.outgoing_stock_g)
                    db.add(mat)
        else:
            total_g = (item.unit_grams or 0.0) * (item.quantity or 1)
            if total_g > 0:
                mat = None
                for t in ["PETG", "PLA", "ABS", "TPU", "NYLON", "ASA"]:
                    if t in item.product_name.upper():
                        mat = db.query(RawMaterial).filter(
                            RawMaterial.material_type.ilike(t),
                            RawMaterial.current_stock_g > 0
                        ).first()
                        if not mat:
                            mat = db.query(RawMaterial).filter(RawMaterial.material_type.ilike(t)).first()
                        break
                if not mat:
                    mat = db.query(RawMaterial).filter(RawMaterial.current_stock_g > 0).first()
                if not mat:
                    mat = db.query(RawMaterial).first()
                if mat:
                    mat.outgoing_stock_g = (mat.outgoing_stock_g or 0.0) + total_g
                    mat.current_stock_g = max(0.0, (mat.initial_stock_g or 0.0) - mat.outgoing_stock_g)
                    db.add(mat)

def restore_materials_for_document(db: Session, items: List[SalesDocumentItem]):
    """
    Restaura el inventario físico de materia prima al anular o eliminar una factura.
    """
    for item in items:
        fils = []
        if getattr(item, "filaments_data", None):
            try:
                fils = json.loads(item.filaments_data)
            except Exception:
                fils = []

        if fils:
            for f in fils:
                f_mat_id = f.get("material_id")
                f_code = (f.get("article_code") or "").strip()
                f_type = (f.get("type") or "").strip()
                f_color = (f.get("color") or "").strip()
                f_grams = float(f.get("grams") or 0.0)
                if f_grams <= 0:
                    continue

                mat = None
                if f_mat_id:
                    try:
                        mat = db.query(RawMaterial).filter(RawMaterial.id == int(f_mat_id)).first()
                    except (ValueError, TypeError):
                        pass

                if not mat and f_code:
                    mat = db.query(RawMaterial).filter(RawMaterial.article_code.ilike(f_code)).first()

                if not mat and f_type:
                    query = db.query(RawMaterial).filter(RawMaterial.material_type.ilike(f_type))
                    if f_color:
                        mat = query.filter(RawMaterial.color.ilike(f_color)).first()
                    if not mat:
                        mat = query.first()

                if mat:
                    mat.outgoing_stock_g = max(0.0, (mat.outgoing_stock_g or 0.0) - f_grams)
                    mat.current_stock_g = max(0.0, (mat.initial_stock_g or 0.0) - mat.outgoing_stock_g)
                    db.add(mat)
        else:
            total_g = (item.unit_grams or 0.0) * (item.quantity or 1)
            if total_g > 0:
                mat = None
                for t in ["PETG", "PLA", "ABS", "TPU", "NYLON", "ASA"]:
                    if t in item.product_name.upper():
                        mat = db.query(RawMaterial).filter(RawMaterial.material_type.ilike(t)).first()
                        break
                if not mat:
                    mat = db.query(RawMaterial).first()
                if mat:
                    mat.outgoing_stock_g = max(0.0, (mat.outgoing_stock_g or 0.0) - total_g)
                    mat.current_stock_g = max(0.0, (mat.initial_stock_g or 0.0) - mat.outgoing_stock_g)
                    db.add(mat)

def create_invoice_journal_entries(db: Session, doc: DocumentType, items: List[SalesDocumentItem], is_internal: bool):
    """
    Genera los asientos contables para la factura.
    - Si es Uso Interno:
      Débito a 152405 (Herramientas y Accesorios de Taller - Uso Propio) por el total del costo de fabricación.
      Crédito a todas las cuentas que componen la fabricación ("cuentas a descontar"):
        * 140505 (Inventario de Materias Primas) por el costo de material consumido.
        * 513528 (Servicios de Energía Eléctrica) por el costo de energía consumida.
        * 516005 (Depreciación Maquinaria) por el desgaste de la impresora.
        * 510506 (Sueldos y Mano de Obra) por la mano de obra aplicada.
        * 513505 (Dotación y Mantenimiento de Taller) por costos adicionales / insumos de taller.
      Partida doble estrictamente balanceada (Debe == Haber).
    - Si es Venta Comercial:
      Débito a 110505 (Caja General) y Crédito a 413505 (Ventas 3D).
      Y si hubo costo de materiales consumido en la orden:
      Débito a 613505 (Costo de Ventas y Producción) y Crédito a 140505 (Inventario Materias Primas).
    """
    next_entry = db.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first()
    entry_num = (next_entry.entry_number if next_entry else 0) + 1
    doc_entry_date = doc.created_at if getattr(doc, "created_at", None) else datetime.utcnow()

    if is_internal:
        total_mfg_cost = sum((it.unit_cost or 0.0) * (it.quantity or 1) for it in items)
        if total_mfg_cost <= 0:
            total_mfg_cost = doc.total
        total_mfg_cost = round(total_mfg_cost, 2)
        if total_mfg_cost <= 0:
            return

        total_mat = round(sum((it.material_cost or 0.0) for it in items), 2)
        total_energy = round(sum((it.energy_cost or 0.0) for it in items), 2)
        total_deprec = round(sum((it.depreciation_cost or 0.0) for it in items), 2)
        total_labor = round(sum((it.labor_cost or 0.0) for it in items), 2)
        total_add = round(sum((it.additional_cost or 0.0) for it in items), 2)

        # Si no vinieron desglosados (ej. documento previo), estimar proporcionalmente
        if (total_mat + total_energy + total_deprec + total_labor + total_add) <= 0:
            total_grams = sum((it.unit_grams or 0.0) * (it.quantity or 1) for it in items)
            total_hours = sum((it.print_hours or 0.0) * (it.quantity or 1) for it in items)
            total_mat = round(total_grams * 65.0, 2)
            total_energy = round(total_hours * 0.15 * 763.2, 2)
            total_deprec = round(total_hours * 678.0, 2)
            total_labor = round((total_mat + total_energy + total_deprec) * 0.019, 2)
            total_add = round(max(0.0, total_mfg_cost - (total_mat + total_energy + total_deprec + total_labor)), 2)

        # Ajuste de diferencia para que sum(créditos) == total_mfg_cost
        raw_credits_sum = round(total_mat + total_energy + total_deprec + total_labor + total_add, 2)
        diff = round(total_mfg_cost - raw_credits_sum, 2)
        if abs(diff) > 0.001:
            if diff > 0:
                total_add = round(total_add + diff, 2)
            else:
                if total_add >= abs(diff):
                    total_add = round(total_add + diff, 2)
                else:
                    rem_diff = abs(diff) - total_add
                    total_add = 0.0
                    total_mat = max(0.0, round(total_mat - rem_diff, 2))

        # Determinar si el Débito va a ACTIVO (152405) o a GASTO (519505)
        target = (getattr(doc, "internal_accounting_target", "ASSET") or "ASSET").upper()
        if target == "EXPENSE":
            puc_deb = "519505"
            name_deb = "Gastos Diversos (Aseo, Cafetería, Útiles y Mantenimiento)"
            desc_deb = f"Gasto / Consumo Uso Interno Factura {doc.doc_number}"
        else:
            puc_deb = "152405"
            name_deb = "Herramientas y Accesorios de Taller (Uso Propio)"
            desc_deb = f"Alta Pieza Uso Interno Factura {doc.doc_number}"

        # Asiento Débito (Activo o Gasto según elección del usuario)
        j_debit = JournalEntry(
            entry_number=entry_num,
            entry_date=doc_entry_date,
            puc_code=puc_deb,
            account_name=name_deb,
            description=desc_deb,
            debit=total_mfg_cost,
            credit=0.0
        )
        db.add(j_debit)

        # Asientos Crédito (Cuentas a descontar)
        credits_list = []
        if total_mat > 0:
            credits_list.append((
                "140505",
                "Inventario de Materias Primas",
                f"Salida Filamento Uso Interno Factura {doc.doc_number}",
                total_mat
            ))
        if total_energy > 0:
            credits_list.append((
                "513528",
                "Servicios de Energía Eléctrica",
                f"Consumo Energía Fabricación Pieza Uso Interno {doc.doc_number}",
                total_energy
            ))
        if total_deprec > 0:
            credits_list.append((
                "516005",
                "Depreciación Maquinaria",
                f"Depreciación Impresora 3D Fabricación {doc.doc_number}",
                total_deprec
            ))
        if total_labor > 0:
            credits_list.append((
                "510506",
                "Sueldos y Mano de Obra",
                f"Mano de Obra Taller Uso Interno {doc.doc_number}",
                total_labor
            ))
        if total_add > 0:
            credits_list.append((
                "513505",
                "Dotación y Mantenimiento de Taller",
                f"Costos Indirectos Taller Uso Interno {doc.doc_number}",
                total_add
            ))

        # Si por alguna razón la lista quedó vacía, asegurar contrapartida en 513505
        if not credits_list:
            credits_list.append((
                "513505",
                "Dotación y Mantenimiento de Taller",
                f"Alta Pieza Uso Interno Factura {doc.doc_number}",
                total_mfg_cost
            ))

        # Cuadre exacto al centavo
        credit_sum = round(sum(c[3] for c in credits_list), 2)
        final_diff = round(total_mfg_cost - credit_sum, 2)
        if final_diff != 0 and credits_list:
            code, name, desc, val = credits_list[-1]
            credits_list[-1] = (code, name, desc, round(val + final_diff, 2))

        for puc, name, desc, amount in credits_list:
            if amount > 0:
                j_cred = JournalEntry(
                    entry_number=entry_num,
                    entry_date=doc_entry_date,
                    puc_code=puc,
                    account_name=name,
                    description=desc,
                    debit=0.0,
                    credit=amount
                )
                db.add(j_cred)
    else:
        # Venta Comercial:
        # 1. Registro del Ingreso: Débito Caja 110505, Crédito Ingresos - Industrias Manufactureras 412005
        j1 = JournalEntry(
            entry_number=entry_num,
            entry_date=doc_entry_date,
            puc_code="110505",
            account_name="Caja General",
            description=f"Venta Factura {doc.doc_number}",
            debit=round(doc.total, 2),
            credit=0.0
        )
        j2 = JournalEntry(
            entry_number=entry_num,
            entry_date=doc_entry_date,
            puc_code="412005",
            account_name="Ingresos - Industrias Manufactureras",
            description=f"Venta Factura {doc.doc_number}",
            debit=0.0,
            credit=round(doc.total, 2)
        )
        db.add(j1)
        db.add(j2)

        # 2. Costo de Ventas y Salida de Inventario (Castigar inventario y enfrentar costo contra ingreso):
        # Débito 612005 (Costo de Ventas - Ind. Manufactureras) y Crédito 143005 (Inventario de Productos Terminados)
        total_cogs = sum((it.unit_cost or 0.0) * (it.quantity or 1) for it in items)
        if total_cogs <= 0:
            for it in items:
                prod = db.query(FinishedProduct).filter(
                    FinishedProduct.name.ilike(it.product_name.strip()),
                    FinishedProduct.is_internal_use == False
                ).first()
                if prod and prod.unit_cost_cop and prod.unit_cost_cop > 0:
                    total_cogs += prod.unit_cost_cop * (it.quantity or 1)
        if total_cogs <= 0:
            total_mat = round(sum((it.material_cost or 0.0) for it in items), 2)
            if total_mat <= 0:
                total_grams = sum((it.unit_grams or 0.0) * (it.quantity or 1) for it in items)
                if total_grams > 0:
                    total_mat = round(total_grams * 65.0, 2)
            total_cogs = total_mat

        total_cogs = round(total_cogs, 2)
        if total_cogs > 0:
            j_cost_deb = JournalEntry(
                entry_number=entry_num,
                entry_date=doc_entry_date,
                puc_code="612005",
                account_name="Costo de Ventas - Industrias Manufactureras",
                description=f"Costo de Ventas Factura {doc.doc_number}",
                debit=total_cogs,
                credit=0.0
            )
            j_cost_cred = JournalEntry(
                entry_number=entry_num,
                entry_date=doc_entry_date,
                puc_code="143005",
                account_name="Inventario de Productos Terminados",
                description=f"Salida Inventario Productos Terminados Factura {doc.doc_number}",
                debit=0.0,
                credit=total_cogs
            )
            db.add(j_cost_deb)
            db.add(j_cost_cred)


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

    parsed_date = parse_entry_datetime(doc.created_at) if getattr(doc, "created_at", None) else datetime.utcnow()
    db_doc = DocumentType(
        doc_number=doc.doc_number,
        doc_type=doc.doc_type.upper(),
        customer_id=doc.customer_id,
        created_at=parsed_date,
        subtotal=doc.subtotal,
        discount=doc.discount,
        tax=doc.tax,
        total=doc.total,
        status=doc.status,
        is_internal_use=is_internal,
        internal_accounting_target=getattr(doc, "internal_accounting_target", "ASSET") or "ASSET"
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    saved_items = []
    for item in doc.items:
        item_dict = item.model_dump()
        fils = item_dict.pop("filaments", None)
        if fils and not item_dict.get("filaments_data"):
            item_dict["filaments_data"] = json.dumps(fils)
        db_item = SalesDocumentItem(
            document_id=db_doc.id,
            **item_dict
        )
        db.add(db_item)
        saved_items.append(db_item)
    db.commit()
    for s_it in saved_items:
        db.refresh(s_it)

    # Si nace como FACTURA / PAID: Descontar materia prima, actualizar stock de producto terminado y asentar contabilidad
    if db_doc.doc_type == "FACTURA" or db_doc.status in ["INVOICED", "PAID"]:
        deduct_materials_for_document(db, saved_items)

        for item in saved_items:
            existing_prod = db.query(FinishedProduct).filter(
                FinishedProduct.name.ilike(item.product_name.strip()),
                FinishedProduct.is_internal_use == is_internal
            ).first()

            if is_internal:
                # USO INTERNO: Fabricar pieza para uso propio (sumar a dotación/activos internos)
                if existing_prod:
                    existing_prod.initial_stock_units = max(0, (existing_prod.initial_stock_units or 0) + item.quantity)
                    existing_prod.current_stock_units = max(0, (existing_prod.current_stock_units or 0) + item.quantity)
                    if item.unit_cost and item.unit_cost > 0:
                        existing_prod.unit_cost_cop = max(0.0, item.unit_cost)
                    existing_prod.sale_price_with_margin = 0.0
                    existing_prod.is_internal_use = True
                    existing_prod.internal_accounting_target = db_doc.internal_accounting_target
                    db.add(existing_prod)
                else:
                    serial_prefix = "INT"
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
                        sale_price_with_margin=0.0,
                        min_stock_alert=5,
                        is_internal_use=True,
                        internal_accounting_target=db_doc.internal_accounting_target
                    )
                    db.add(new_prod)
            else:
                # VENTA COMERCIAL: Retirar unidades del inventario de vitrina
                if existing_prod:
                    existing_prod.current_stock_units = max(0, (existing_prod.current_stock_units or 0) - item.quantity)
                    existing_prod.outgoing_units = (existing_prod.outgoing_units or 0) + item.quantity
                    if (not item.unit_cost or item.unit_cost <= 0) and existing_prod.unit_cost_cop:
                        item.unit_cost = existing_prod.unit_cost_cop
                    db.add(existing_prod)
                else:
                    # Pieza fabricada bajo pedido y despachada de inmediato al cliente (sin saldo en vitrina)
                    clean_doc_num = db_doc.doc_number.replace('FAC-', '').replace('COT-', '')
                    new_prod = FinishedProduct(
                        serial=f"3D-{clean_doc_num}",
                        name=item.product_name.strip(),
                        color="Multicolor",
                        material_type="Pieza 3D",
                        initial_stock_units=max(0, item.quantity),
                        outgoing_units=max(0, item.quantity),
                        current_stock_units=0,
                        unit_cost_cop=max(0.0, item.unit_cost or 0.0),
                        sale_price_with_margin=max(0.0, item.unit_price or 0.0),
                        min_stock_alert=5,
                        is_internal_use=False
                    )
                    db.add(new_prod)

        create_invoice_journal_entries(db, db_doc, saved_items, is_internal)

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
def convert_quote_to_invoice(
    doc_id: int,
    payload: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("sales", "write"))
):
    doc = db.query(DocumentType).filter(DocumentType.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    doc.doc_type = "FACTURA"
    doc.doc_number = doc.doc_number.replace("COT-", "FAC-")
    doc.status = "INVOICED"

    # Si se especificó una fecha de facturación en payload, actualizarla
    if payload and payload.get("created_at"):
        doc.created_at = parse_entry_datetime(payload.get("created_at"))

    # Determinar si es uso interno
    is_internal = bool(doc.is_internal_use)
    if not is_internal and doc.customer_id:
        cust = db.query(Customer).filter(Customer.id == doc.customer_id).first()
        if cust:
            c_text = f"{cust.name} {cust.email or ''}".lower()
            if any(k in c_text for k in ["uso interno", "interno", "taller", "dotacion", "dotación", "propio", "prisma lab"]):
                is_internal = True
    doc.is_internal_use = is_internal

    doc_items = db.query(SalesDocumentItem).filter(SalesDocumentItem.document_id == doc.id).all()
    
    # 1. Descontar materia prima usada en la fabricación
    deduct_materials_for_document(db, doc_items)

    # 2. Registrar retiro o entrada en Inventario de Producto Terminado al convertir a Factura
    for item in doc_items:
        existing_prod = db.query(FinishedProduct).filter(
            FinishedProduct.name.ilike(item.product_name.strip()),
            FinishedProduct.is_internal_use == is_internal
        ).first()

        if is_internal:
            # USO INTERNO: Sumar a stock interno
            if existing_prod:
                existing_prod.initial_stock_units = max(0, (existing_prod.initial_stock_units or 0) + item.quantity)
                existing_prod.current_stock_units = max(0, (existing_prod.current_stock_units or 0) + item.quantity)
                if item.unit_cost and item.unit_cost > 0:
                    existing_prod.unit_cost_cop = max(0.0, item.unit_cost)
                existing_prod.sale_price_with_margin = 0.0
                existing_prod.is_internal_use = True
                existing_prod.internal_accounting_target = getattr(doc, "internal_accounting_target", "ASSET") or "ASSET"
                db.add(existing_prod)
            else:
                serial_prefix = "INT"
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
                    sale_price_with_margin=0.0,
                    min_stock_alert=5,
                    is_internal_use=True,
                    internal_accounting_target=getattr(doc, "internal_accounting_target", "ASSET") or "ASSET"
                )
                db.add(new_prod)
        else:
            # VENTA COMERCIAL: Retirar unidades de vitrina
            if existing_prod:
                existing_prod.current_stock_units = max(0, (existing_prod.current_stock_units or 0) - item.quantity)
                existing_prod.outgoing_units = (existing_prod.outgoing_units or 0) + item.quantity
                if (not item.unit_cost or item.unit_cost <= 0) and existing_prod.unit_cost_cop:
                    item.unit_cost = existing_prod.unit_cost_cop
                db.add(existing_prod)
            else:
                clean_doc_num = doc.doc_number.replace('FAC-', '').replace('COT-', '')
                new_prod = FinishedProduct(
                    serial=f"3D-{clean_doc_num}",
                    name=item.product_name.strip(),
                    color="Multicolor",
                    material_type="Pieza 3D",
                    initial_stock_units=max(0, item.quantity),
                    outgoing_units=max(0, item.quantity),
                    current_stock_units=0,
                    unit_cost_cop=max(0.0, item.unit_cost or 0.0),
                    sale_price_with_margin=max(0.0, item.unit_price or 0.0),
                    min_stock_alert=5,
                    is_internal_use=False
                )
                db.add(new_prod)

    # 3. Generar Asientos Contables completos
    create_invoice_journal_entries(db, doc, doc_items, is_internal)

    db.commit()
    db.expire_all()
    db.refresh(doc)
    return doc

@router.put("/documents/{doc_id}/date", response_model=SalesDocumentResponse)
def update_document_date(
    doc_id: int,
    date_data: SalesDocumentDateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("sales", "write"))
):
    doc = db.query(DocumentType).filter(DocumentType.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    new_dt = parse_entry_datetime(date_data.created_at)
    doc.created_at = new_dt

    # Si es Factura, actualizar la fecha en todos los asientos contables asociados
    updated_entries = 0
    if doc.doc_type == "FACTURA" or doc.status in ["INVOICED", "PAID"]:
        updated_entries = db.query(JournalEntry).filter(
            JournalEntry.description.ilike(f"%{doc.doc_number}%")
        ).update({"entry_date": new_dt}, synchronize_session=False)

    db.commit()
    db.refresh(doc)

    log_audit_event(
        db=db,
        username=current_user.username,
        module="sales",
        action="UPDATE_DOCUMENT_DATE",
        description=f"Cambió fecha de {doc.doc_type} #{doc.doc_number} a {new_dt.strftime('%Y-%m-%d')}" + (f" ({updated_entries} asientos actualizados)" if updated_entries else ""),
        user_id=current_user.id
    )

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
    doc_items = db.query(SalesDocumentItem).filter(SalesDocumentItem.document_id == doc.id).all()

    # Si era Factura, revertir el material descontado y el stock de producto terminado
    if doc.doc_type == "FACTURA" or doc.status in ["INVOICED", "PAID"]:
        restore_materials_for_document(db, doc_items)
        for item in doc_items:
            clean_doc_num = doc.doc_number.replace('FAC-', '').replace('COT-', '')
            serial_prefix = "INT" if doc.is_internal_use else "3D"
            target_serial = f"{serial_prefix}-{clean_doc_num}"
            prod = db.query(FinishedProduct).filter(
                (FinishedProduct.serial == target_serial) | (FinishedProduct.name.ilike(item.product_name.strip()))
            ).first()
            if prod:
                if doc.is_internal_use:
                    # Si era de uso interno, se retira la pieza que se había sumado
                    prod.current_stock_units = max(0, (prod.current_stock_units or 0) - item.quantity)
                else:
                    # Venta comercial anulada: devolver unidades al stock de vitrina
                    prod.current_stock_units = (prod.current_stock_units or 0) + item.quantity
                    prod.outgoing_units = max(0, (prod.outgoing_units or 0) - item.quantity)
                db.add(prod)
    
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

