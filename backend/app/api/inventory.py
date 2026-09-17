from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.inventory import RawMaterial, FinishedProduct, AdditionalSupply
from app.models.accounting import JournalEntry
from app.models.sales import DocumentType, SalesDocumentItem
from app.models.auth import User
from app.core.security import require_permission
from app.api.auth import log_audit_event
from app.utils import generate_article_code
from app.schemas.inventory import (
    RawMaterialResponse, RawMaterialCreate, RawMaterialUpdate,
    FinishedProductResponse, FinishedProductCreate,
    AdditionalSupplyResponse, AdditionalSupplyCreate, AdditionalSupplyUpdate
)

router = APIRouter(prefix="/inventory", tags=["Inventario"])

def get_next_entry_number(db: Session) -> int:
    last_entry = db.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first()
    return (last_entry.entry_number if last_entry else 0) + 1

def parse_entry_datetime(val) -> datetime:
    """
    Parsea de forma robusta cualquier formato de fecha proveniente del frontend o usuario:
    - YYYY-MM-DD
    - DD/MM/YYYY o DD-MM-YYYY
    - DD/MM o DD-MM (asumiendo año actual)
    - ISO con hora (YYYY-MM-DDTHH:MM:SS)
    - Objetos datetime
    Retorna un objeto datetime naive a mediodía (12:00:00) para evitar desfases de zona horaria UTC-5.
    """
    if not val:
        return datetime.utcnow()
    if isinstance(val, datetime):
        return val.replace(tzinfo=None)
    
    val_str = str(val).strip()
    if not val_str:
        return datetime.utcnow()

    # Si viene con T o espacio de hora, separar la parte de fecha
    date_part = val_str.split("T")[0].split(" ")[0].strip()
    
    # 1. Probar YYYY-MM-DD
    try:
        parts = date_part.split("-")
        if len(parts) == 3 and len(parts[0]) == 4:
            return datetime(int(parts[0]), int(parts[1]), int(parts[2]), 12, 0, 0)
    except Exception:
        pass
        
    # 2. Probar DD/MM/YYYY o DD-MM-YYYY o DD/MM
    for sep in ("/", "-"):
        if sep in date_part:
            parts = date_part.split(sep)
            if len(parts) == 3:
                # DD/MM/YYYY
                try:
                    y = int(parts[2])
                    m = int(parts[1])
                    d = int(parts[0])
                    if y < 100: y += 2000
                    return datetime(y, m, d, 12, 0, 0)
                except Exception:
                    pass
            elif len(parts) == 2:
                # DD/MM (ej. 27/04) -> tomar año actual
                try:
                    d = int(parts[0])
                    m = int(parts[1])
                    y = datetime.utcnow().year
                    return datetime(y, m, d, 12, 0, 0)
                except Exception:
                    pass
                    
    # 3. Fallback a fromisoformat
    try:
        clean_iso = val_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_iso)
        return dt.replace(tzinfo=None)
    except Exception:
        pass

    return datetime.utcnow()

# --- INSUMOS / MATERIALES (FILAMENTOS) ---

@router.get("/materials", response_model=List[RawMaterialResponse])
def get_raw_materials(
    material_type: Optional[str] = Query(None),
    color: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(RawMaterial)
    if material_type:
        query = query.filter(RawMaterial.material_type.ilike(f"%{material_type}%"))
    if color:
        query = query.filter(RawMaterial.color.ilike(f"%{color}%"))
    return query.order_by(RawMaterial.id.asc()).all()

@router.post("/materials", response_model=RawMaterialResponse)
def create_raw_material(
    material: RawMaterialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "write"))
):
    mat_dict = material.model_dump()
    if not mat_dict.get("article_code"):
        mat_dict["article_code"] = generate_article_code(
            mat_dict.get("material_type", "PETG"),
            mat_dict.get("color", "Blanco"),
            db=db
        )
    if mat_dict.get("current_stock_g") == 0.0 and (mat_dict.get("initial_stock_g", 0.0) > 0.0) and (mat_dict.get("outgoing_stock_g", 0.0) == 0.0):
        mat_dict["current_stock_g"] = mat_dict["initial_stock_g"]
    
    # Manejar fecha personalizada de ingreso o compra (robusto ante cualquier formato)
    raw_custom_date = mat_dict.get("entry_date") or mat_dict.get("created_at")
    custom_date = parse_entry_datetime(raw_custom_date)
    mat_dict["created_at"] = custom_date
    mat_dict["updated_at"] = custom_date
    mat_dict.pop("entry_date", None)
        
    db_material = RawMaterial(**mat_dict)
    db.add(db_material)
    db.commit()
    db.refresh(db_material)

    # Registro de Asiento Contable Automático (Partida Doble) con fecha personalizada exacta
    total_value = (db_material.initial_stock_g or 0.0) * (db_material.cost_per_g or 0.0)
    if total_value > 0:
        entry_num = get_next_entry_number(db)
        mat_tag = f"[{db_material.article_code}]" if db_material.article_code else f"[MAT-{db_material.id}]"
        j_debit = JournalEntry(
            entry_number=entry_num,
            entry_date=custom_date,
            puc_code="140505",
            account_name="Inventario de Materias Primas",
            description=f"Compra Filamento {db_material.material_type} {db_material.color} {mat_tag} ({db_material.initial_stock_g}g)",
            debit=round(total_value, 2),
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=entry_num,
            entry_date=custom_date,
            puc_code="110505",
            account_name="Caja General",
            description=f"Pago Compra Filamento {db_material.material_type} {db_material.color} {mat_tag}",
            debit=0.0,
            credit=round(total_value, 2)
        )
        db.add(j_debit)
        db.add(j_credit)
        db.commit()

    mat_code = db_material.article_code or db_material.name or "S/C"
    log_audit_event(
        db=db,
        username=current_user.username,
        module="inventory",
        action="CREATE_MATERIAL",
        description=f"Registró materia prima: {db_material.material_type} {db_material.color} ({mat_code})",
        user_id=current_user.id
    )

    return db_material

@router.put("/materials/{material_id}", response_model=RawMaterialResponse)
def update_raw_material(material_id: int, material_update: RawMaterialUpdate, db: Session = Depends(get_db)):
    db_material = db.query(RawMaterial).filter(RawMaterial.id == material_id).first()
    if not db_material:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    
    update_data = material_update.model_dump(exclude_unset=True)
    
    # Manejar actualización de fecha y sincronización con contabilidad
    if "created_at" in update_data or "entry_date" in update_data:
        raw_val = update_data.pop("entry_date", None) or update_data.get("created_at")
        if raw_val:
            new_date = parse_entry_datetime(raw_val)
            db_material.created_at = new_date
            db_material.updated_at = new_date
            update_data["created_at"] = new_date
            
            # Sincronizar fecha en los asientos contables asociados del Libro Diario
            mat_desc_query = f"%{db_material.material_type}%{db_material.color}%"
            related_entries = db.query(JournalEntry).filter(
                JournalEntry.description.ilike(mat_desc_query),
                JournalEntry.puc_code.in_(["140505", "110505"])
            ).all()
            for rentry in related_entries:
                rentry.entry_date = new_date
    
    for key, value in update_data.items():
        setattr(db_material, key, value)
    
    if "initial_stock_g" in update_data or "outgoing_stock_g" in update_data:
        if "current_stock_g" not in update_data:
            db_material.current_stock_g = (db_material.initial_stock_g or 0.0) - (db_material.outgoing_stock_g or 0.0)

    db.commit()
    db.refresh(db_material)
    return db_material

@router.delete("/materials/{material_id}")
def delete_raw_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "delete"))
):
    db_material = db.query(RawMaterial).filter(RawMaterial.id == material_id).first()
    if not db_material:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    
    mat_code = db_material.article_code or db_material.name or "S/C"
    mat_desc = f"{db_material.material_type} {db_material.color} ({mat_code})"

    # Localizar y eliminar asientos contables asociados en partida doble
    entry_nums_to_delete = set()
    if db_material.article_code:
        code_entries = db.query(JournalEntry).filter(
            JournalEntry.description.ilike(f"%{db_material.article_code}%")
        ).all()
        for ce in code_entries:
            entry_nums_to_delete.add(ce.entry_number)

    # Si no se halló por código, buscar en asientos históricos de inventario
    if not entry_nums_to_delete:
        expected_num = 24 + db_material.id
        hist_entry = db.query(JournalEntry).filter(
            JournalEntry.entry_number == expected_num,
            JournalEntry.puc_code == "140505"
        ).first()
        if hist_entry:
            entry_nums_to_delete.add(expected_num)
        elif db_material.name:
            named_entries = db.query(JournalEntry).filter(
                JournalEntry.puc_code == "140505",
                JournalEntry.description.ilike(f"%{db_material.name}%")
            ).all()
            if len(named_entries) == 1:
                entry_nums_to_delete.add(named_entries[0].entry_number)

    deleted_entries_count = 0
    if entry_nums_to_delete:
        deleted_entries_count = db.query(JournalEntry).filter(
            JournalEntry.entry_number.in_(list(entry_nums_to_delete))
        ).delete(synchronize_session=False)

    db.delete(db_material)
    db.commit()

    audit_note = f" (se anularon {deleted_entries_count} registros contables de Asientos #{', #'.join(map(str, entry_nums_to_delete))})" if entry_nums_to_delete else ""
    log_audit_event(
        db=db,
        username=current_user.username,
        module="inventory",
        action="DELETE_MATERIAL",
        description=f"Eliminó materia prima: {mat_desc}{audit_note}",
        user_id=current_user.id
    )

    return {
        "message": "Material eliminado correctamente",
        "deleted_journal_entries": deleted_entries_count
    }

# --- PRODUCTOS TERMINADOS ---

@router.get("/products", response_model=List[FinishedProductResponse])
def get_finished_products(db: Session = Depends(get_db)):
    return db.query(FinishedProduct).all()

@router.post("/products", response_model=FinishedProductResponse)
def create_finished_product(product: FinishedProductCreate, db: Session = Depends(get_db)):
    prod_data = product.model_dump()
    skip_acc = prod_data.pop("skip_accounting", False)
    db_product = FinishedProduct(**prod_data)
    db.add(db_product)
    db.commit()
    db.refresh(db_product)

    # Registro de Asiento Contable Automático (Partida Doble)
    total_value = (db_product.initial_stock_units or 0) * (db_product.unit_cost_cop or 0.0)
    if not skip_acc and total_value > 0:
        entry_num = get_next_entry_number(db)
        prod_tag = f"[{db_product.serial}]" if db_product.serial else f"[PROD-{db_product.id}]"
        
        is_int = bool(db_product.is_internal_use)
        puc_deb = "152405" if is_int else "143005"
        acc_deb = "Herramientas y Accesorios de Taller (Uso Propio)" if is_int else "Inventario de Productos Terminados"
        puc_cred = "513505" if is_int else "613505"
        acc_cred = "Dotación y Mantenimiento de Taller" if is_int else "Costo de Ventas y Producción"
        tipo_label = "Pieza Uso Interno" if is_int else "Producto Terminado"
        
        j_debit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code=puc_deb,
            account_name=acc_deb,
            description=f"Alta {tipo_label}: {db_product.name} {prod_tag} ({db_product.initial_stock_units} unids)",
            debit=round(total_value, 2),
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code=puc_cred,
            account_name=acc_cred,
            description=f"Alta {tipo_label}: {db_product.name} {prod_tag}",
            debit=0.0,
            credit=round(total_value, 2)
        )
        db.add(j_debit)
        db.add(j_credit)
        db.commit()

    return db_product

@router.post("/products/{product_id}/sell")
def sell_vitrina_product(
    product_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("sales", "write"))
):
    product = db.query(FinishedProduct).filter(FinishedProduct.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if product.is_internal_use:
        raise HTTPException(
            status_code=400,
            detail="Este producto pertenece al Apartado No a la Venta (Uso Interno) y está estrictamente bloqueado para facturación."
        )
    
    quantity = int(payload.get("quantity", 1))
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="La cantidad a vender debe ser mayor a cero")
    if quantity > (product.current_stock_units or 0):
        raise HTTPException(status_code=400, detail=f"Stock insuficiente en vitrina (disponible: {product.current_stock_units} unds)")
    
    unit_price = float(payload.get("unit_price", product.sale_price_with_margin or 0.0))
    customer_id = payload.get("customer_id")
    total_sale = round(quantity * unit_price, 2)
    cost_of_goods = round(quantity * (product.unit_cost_cop or 0.0), 2)
    
    # Descontar stock de vitrina
    product.current_stock_units = max(0, (product.current_stock_units or 0) - quantity)
    product.outgoing_units = (product.outgoing_units or 0) + quantity
    db.add(product)
    
    # Crear Factura en Ventas
    doc_count = db.query(DocumentType).filter(DocumentType.doc_type == "FACTURA").count() + 1
    doc_number = f"FAC-VIT-{doc_count:04d}"
    
    doc = DocumentType(
        doc_number=doc_number,
        doc_type="FACTURA",
        customer_id=customer_id if customer_id else None,
        subtotal=total_sale,
        discount=0.0,
        tax=0.0,
        total=total_sale,
        status="INVOICED"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    # Item de factura
    item = SalesDocumentItem(
        document_id=doc.id,
        product_name=f"{product.name} ({product.material_type or '3D'} {product.color or ''})",
        quantity=quantity,
        unit_cost=product.unit_cost_cop or 0.0,
        unit_price=unit_price,
        total_price=total_sale
    )
    db.add(item)
    
    # Asientos Contables: Débito Caja 110505, Crédito Ventas 413505
    entry_num = get_next_entry_number(db)
    j1 = JournalEntry(
        entry_number=entry_num,
        entry_date=datetime.utcnow(),
        puc_code="110505",
        account_name="Caja General",
        description=f"Venta Vitrina: {product.name} ({quantity} unds) Factura {doc_number}",
        debit=total_sale,
        credit=0.0
    )
    j2 = JournalEntry(
        entry_number=entry_num,
        entry_date=datetime.utcnow(),
        puc_code="413505",
        account_name="Comercio al por Mayor y Menor (Ventas 3D)",
        description=f"Venta Vitrina Factura {doc_number}",
        debit=0.0,
        credit=total_sale
    )
    db.add(j1)
    db.add(j2)
    
    # Costo de ventas: Débito 613505, Crédito 143005
    if cost_of_goods > 0:
        entry_num_cogs = get_next_entry_number(db)
        j_cogs = JournalEntry(
            entry_number=entry_num_cogs,
            entry_date=datetime.utcnow(),
            puc_code="613505",
            account_name="Costo de Ventas y Producción",
            description=f"Costo Mercancía Vendida Vitrina: {product.name} ({quantity} unds)",
            debit=cost_of_goods,
            credit=0.0
        )
        j_inv = JournalEntry(
            entry_number=entry_num_cogs,
            entry_date=datetime.utcnow(),
            puc_code="143005",
            account_name="Inventario de Productos Terminados",
            description=f"Salida Stock Vitrina: {product.name} ({quantity} unds)",
            debit=0.0,
            credit=cost_of_goods
        )
        db.add(j_cogs)
        db.add(j_inv)
        
    db.commit()
    
    log_audit_event(
        db=db,
        username=current_user.username,
        module="sales",
        action="SELL_VITRINA_PRODUCT",
        description=f"Facturó producto de vitrina: {product.name} x{quantity} (Factura {doc_number})",
        user_id=current_user.id
    )
    
    return {
        "message": f"Factura {doc_number} generada exitosamente y {quantity} unds descontadas de vitrina",
        "doc_number": doc_number,
        "document_id": doc.id
    }

@router.delete("/products/{product_id}")
def delete_finished_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "delete"))
):
    product = db.query(FinishedProduct).filter(FinishedProduct.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto terminado no encontrado")
    
    prod_name = product.name
    # Buscar asientos contables asociados al producto terminado (PUC 143005 o 152405)
    entry_nums_to_delete = set()
    prod_entries = db.query(JournalEntry).filter(
        JournalEntry.puc_code.in_(["143005", "152405"]),
        JournalEntry.description.ilike(f"%{prod_name}%")
    ).all()
    for pe in prod_entries:
        entry_nums_to_delete.add(pe.entry_number)
        
    deleted_entries_count = 0
    if entry_nums_to_delete:
        deleted_entries_count = db.query(JournalEntry).filter(
            JournalEntry.entry_number.in_(list(entry_nums_to_delete))
        ).delete(synchronize_session=False)

    db.delete(product)
    db.commit()

    audit_note = f" (se anularon {deleted_entries_count} registros contables de Asientos #{', #'.join(map(str, entry_nums_to_delete))})" if entry_nums_to_delete else ""
    log_audit_event(
        db=db,
        username=current_user.username,
        module="inventory",
        action="DELETE_PRODUCT",
        description=f"Eliminó producto terminado: {prod_name}{audit_note}",
        user_id=current_user.id
    )

    return {
        "message": "Producto terminado eliminado correctamente",
        "deleted_journal_entries": deleted_entries_count
    }

# --- MATERIAL ADICIONAL: PAPELERÍA & MANTENIMIENTO ---

@router.get("/additional-supplies", response_model=List[AdditionalSupplyResponse])
def get_additional_supplies(
    item_type: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(AdditionalSupply)
    if item_type:
        query = query.filter(AdditionalSupply.item_type == item_type.upper())
    return query.order_by(AdditionalSupply.id.asc()).all()

@router.post("/additional-supplies", response_model=AdditionalSupplyResponse)
def create_additional_supply(supply: AdditionalSupplyCreate, db: Session = Depends(get_db)):
    raw_date = supply.entry_date or supply.created_at
    custom_date = parse_entry_datetime(raw_date)
    db_supply = AdditionalSupply(
        name=supply.name.strip(),
        item_type=supply.item_type.upper(),
        unit_cost_cop=supply.unit_cost_cop,
        stock_units=supply.stock_units,
        notes=supply.notes or "",
        created_at=custom_date,
        updated_at=custom_date
    )
    db.add(db_supply)
    db.commit()
    db.refresh(db_supply)
    return db_supply

@router.put("/additional-supplies/{supply_id}", response_model=AdditionalSupplyResponse)
def update_additional_supply(supply_id: int, supply_update: AdditionalSupplyUpdate, db: Session = Depends(get_db)):
    db_supply = db.query(AdditionalSupply).filter(AdditionalSupply.id == supply_id).first()
    if not db_supply:
        raise HTTPException(status_code=404, detail="Insumo adicional no encontrado")
    
    update_data = supply_update.model_dump(exclude_unset=True)
    if "created_at" in update_data or "entry_date" in update_data:
        raw_date = update_data.pop("entry_date", None) or update_data.get("created_at")
        if raw_date:
            new_date = parse_entry_datetime(raw_date)
            db_supply.created_at = new_date
            db_supply.updated_at = new_date
            update_data["created_at"] = new_date

    if "name" in update_data and update_data["name"]:
        db_supply.name = update_data["name"].strip()
    if "item_type" in update_data and update_data["item_type"]:
        db_supply.item_type = update_data["item_type"].upper()
    if "unit_cost_cop" in update_data and update_data["unit_cost_cop"] is not None:
        db_supply.unit_cost_cop = update_data["unit_cost_cop"]
    if "stock_units" in update_data and update_data["stock_units"] is not None:
        db_supply.stock_units = update_data["stock_units"]
    if "notes" in update_data and update_data["notes"] is not None:
        db_supply.notes = update_data["notes"]

    db.commit()
    db.refresh(db_supply)
    return db_supply

@router.delete("/additional-supplies/{supply_id}")
def delete_additional_supply(
    supply_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "delete"))
):
    db_supply = db.query(AdditionalSupply).filter(AdditionalSupply.id == supply_id).first()
    if not db_supply:
        raise HTTPException(status_code=404, detail="Insumo adicional no encontrado")
    
    supply_info = f"{db_supply.name} ({db_supply.item_type})"
    db.delete(db_supply)
    db.commit()

    log_audit_event(
        db=db,
        username=current_user.username,
        module="inventory",
        action="DELETE_SUPPLY",
        description=f"Eliminó insumo adicional: {supply_info}",
        user_id=current_user.id
    )

    return {"message": "Insumo adicional eliminado correctamente"}
