from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.inventory import RawMaterial, FinishedProduct, AdditionalSupply
from app.models.accounting import JournalEntry
from app.schemas.inventory import (
    RawMaterialResponse, RawMaterialCreate, RawMaterialUpdate,
    FinishedProductResponse, FinishedProductCreate,
    AdditionalSupplyResponse, AdditionalSupplyCreate, AdditionalSupplyUpdate
)

router = APIRouter(prefix="/inventory", tags=["Inventario"])

def get_next_entry_number(db: Session) -> int:
    last_entry = db.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first()
    return (last_entry.entry_number if last_entry else 0) + 1

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
    return query.all()

@router.post("/materials", response_model=RawMaterialResponse)
def create_raw_material(material: RawMaterialCreate, db: Session = Depends(get_db)):
    mat_dict = material.model_dump()
    if mat_dict.get("current_stock_g") == 0.0 and (mat_dict.get("initial_stock_g", 0.0) > 0.0) and (mat_dict.get("outgoing_stock_g", 0.0) == 0.0):
        mat_dict["current_stock_g"] = mat_dict["initial_stock_g"]
        
    db_material = RawMaterial(**mat_dict)
    db.add(db_material)
    db.commit()
    db.refresh(db_material)

    # Registro de Asiento Contable Automático (Partida Doble)
    total_value = (db_material.initial_stock_g or 0.0) * (db_material.cost_per_g or 0.0)
    if total_value > 0:
        entry_num = get_next_entry_number(db)
        j_debit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code="140505",
            account_name="Inventario de Materias Primas / Filamentos",
            description=f"Ingreso/Compra Filamento {db_material.material_type} {db_material.color} ({db_material.initial_stock_g}g)",
            debit=round(total_value, 2),
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code="110505",
            account_name="Caja General",
            description=f"Pago Compra Filamento {db_material.material_type} {db_material.color}",
            debit=0.0,
            credit=round(total_value, 2)
        )
        db.add(j_debit)
        db.add(j_credit)
        db.commit()

    return db_material

@router.put("/materials/{material_id}", response_model=RawMaterialResponse)
def update_raw_material(material_id: int, material_update: RawMaterialUpdate, db: Session = Depends(get_db)):
    db_material = db.query(RawMaterial).filter(RawMaterial.id == material_id).first()
    if not db_material:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    
    update_data = material_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_material, key, value)
    
    if "initial_stock_g" in update_data or "outgoing_stock_g" in update_data:
        if "current_stock_g" not in update_data:
            db_material.current_stock_g = (db_material.initial_stock_g or 0.0) - (db_material.outgoing_stock_g or 0.0)

    db.commit()
    db.refresh(db_material)
    return db_material

@router.delete("/materials/{material_id}")
def delete_raw_material(material_id: int, db: Session = Depends(get_db)):
    db_material = db.query(RawMaterial).filter(RawMaterial.id == material_id).first()
    if not db_material:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    db.delete(db_material)
    db.commit()
    return {"message": "Material eliminado correctamente"}

# --- PRODUCTOS TERMINADOS ---

@router.get("/products", response_model=List[FinishedProductResponse])
def get_finished_products(db: Session = Depends(get_db)):
    return db.query(FinishedProduct).all()

@router.post("/products", response_model=FinishedProductResponse)
def create_finished_product(product: FinishedProductCreate, db: Session = Depends(get_db)):
    db_product = FinishedProduct(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)

    # Registro de Asiento Contable Automático (Partida Doble)
    total_value = (db_product.initial_stock_units or 0) * (db_product.unit_cost_cop or 0.0)
    if total_value > 0:
        entry_num = get_next_entry_number(db)
        j_debit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code="143005",
            account_name="Inventario de Productos Terminados",
            description=f"Alta Producto Terminado: {db_product.name} ({db_product.initial_stock_units} unids)",
            debit=round(total_value, 2),
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=entry_num,
            entry_date=datetime.utcnow(),
            puc_code="613505",
            account_name="Costo de Ventas y Producción",
            description=f"Alta Producto Terminado: {db_product.name}",
            debit=0.0,
            credit=round(total_value, 2)
        )
        db.add(j_debit)
        db.add(j_credit)
        db.commit()

    return db_product

@router.delete("/products/{product_id}")
def delete_finished_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(FinishedProduct).filter(FinishedProduct.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto terminado no encontrado")
    db.delete(product)
    db.commit()
    return {"message": "Producto terminado eliminado correctamente"}

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
    db_supply = AdditionalSupply(
        name=supply.name.strip(),
        item_type=supply.item_type.upper(),
        unit_cost_cop=supply.unit_cost_cop,
        stock_units=supply.stock_units,
        notes=supply.notes or ""
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
def delete_additional_supply(supply_id: int, db: Session = Depends(get_db)):
    db_supply = db.query(AdditionalSupply).filter(AdditionalSupply.id == supply_id).first()
    if not db_supply:
        raise HTTPException(status_code=404, detail="Insumo adicional no encontrado")
    db.delete(db_supply)
    db.commit()
    return {"message": "Insumo adicional eliminado correctamente"}
