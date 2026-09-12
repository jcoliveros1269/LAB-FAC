from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
from datetime import datetime

from app.database import get_db
from app.models.config import SystemConfig, VolumeDiscount
from app.schemas.config import SystemConfigResponse, SystemConfigCreate, VolumeDiscountResponse, VolumeDiscountCreate

router = APIRouter(prefix="/config", tags=["Configuración"])

@router.get("", response_model=List[SystemConfigResponse])
def get_configs(db: Session = Depends(get_db)):
    return db.query(SystemConfig).all()

@router.post("", response_model=SystemConfigResponse)
def create_or_update_config(config: SystemConfigCreate, db: Session = Depends(get_db)):
    db_config = db.query(SystemConfig).filter(SystemConfig.key == config.key).first()
    if db_config:
        db_config.value = config.value
        db_config.unit = config.unit
        db_config.description = config.description
    else:
        db_config = SystemConfig(**config.model_dump())
        db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

@router.get("/discounts", response_model=List[VolumeDiscountResponse])
def get_volume_discounts(db: Session = Depends(get_db)):
    return db.query(VolumeDiscount).order_by(VolumeDiscount.min_units.asc()).all()

@router.post("/discounts", response_model=VolumeDiscountResponse)
def create_volume_discount(discount: VolumeDiscountCreate, db: Session = Depends(get_db)):
    db_discount = VolumeDiscount(**discount.model_dump())
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    return db_discount

@router.put("/discounts/{discount_id}", response_model=VolumeDiscountResponse)
def update_volume_discount(discount_id: int, discount: VolumeDiscountCreate, db: Session = Depends(get_db)):
    db_disc = db.query(VolumeDiscount).filter(VolumeDiscount.id == discount_id).first()
    if not db_disc:
        raise HTTPException(status_code=404, detail="Escala de descuento no encontrada")
    
    db_disc.min_units = discount.min_units
    db_disc.max_units = discount.max_units
    db_disc.discount_percentage = discount.discount_percentage
    db_disc.suggested_price_multiplier = discount.suggested_price_multiplier
    
    db.commit()
    db.refresh(db_disc)
    return db_disc

@router.delete("/discounts/{discount_id}")
def delete_volume_discount(discount_id: int, db: Session = Depends(get_db)):
    db_disc = db.query(VolumeDiscount).filter(VolumeDiscount.id == discount_id).first()
    if not db_disc:
        raise HTTPException(status_code=404, detail="Escala de descuento no encontrada")
    
    db.delete(db_disc)
    db.commit()
    return {"message": "Escala de descuento eliminada"}

@router.get("/backup")
def download_db_backup():
    """
    Genera y sirve un archivo de respaldo con timestamp de prisma_lab.db
    """
    db_path = "prisma_lab.db"
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Base de datos no encontrada.")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"prisma_lab_backup_{timestamp}.db"
    backup_dir = "backups"
    os.makedirs(backup_dir, exist_ok=True)
    backup_filepath = os.path.join(backup_dir, backup_filename)

    shutil.copy2(db_path, backup_filepath)

    return FileResponse(
        path=backup_filepath,
        filename=backup_filename,
        media_type="application/x-sqlite3"
    )

