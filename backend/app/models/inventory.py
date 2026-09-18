from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from datetime import datetime
from app.database import Base

class RawMaterial(Base):
    """Inventario de Filamentos / Insumos de Impresión 3D"""
    __tablename__ = "raw_materials"

    id = Column(Integer, primary_key=True, index=True)
    article_code = Column(String, index=True, nullable=True) # ej: PGAM01-01, PGBL00-01
    name = Column(String, index=True, nullable=False) # ej: PETG Arrow Yellow 1kg
    color = Column(String, nullable=False) # ej: Amarillo
    material_type = Column(String, index=True, nullable=False) # ej: PETG, PLA, TPU
    initial_stock_g = Column(Float, default=0.0)
    outgoing_stock_g = Column(Float, default=0.0)
    current_stock_g = Column(Float, default=0.0)
    cost_per_g = Column(Float, nullable=False) # Costo COP / gramo
    min_stock_alert_g = Column(Float, default=200.0)
    notes = Column(String, nullable=True, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class FinishedProduct(Base):
    """Inventario de Productos Terminados"""
    __tablename__ = "finished_products"

    id = Column(Integer, primary_key=True, index=True)
    serial = Column(String, index=True, nullable=True)
    name = Column(String, nullable=False)
    color = Column(String, nullable=True)
    material_type = Column(String, nullable=True)
    initial_stock_units = Column(Integer, default=0)
    outgoing_units = Column(Integer, default=0)
    current_stock_units = Column(Integer, default=0)
    unit_cost_cop = Column(Float, default=0.0)
    sale_price_with_margin = Column(Float, default=0.0)
    min_stock_alert = Column(Integer, default=5)
    is_internal_use = Column(Boolean, default=False)
    internal_accounting_target = Column(String, default="ASSET") # 'ASSET' (Activo - 152405) o 'EXPENSE' (Gasto - 519505)

class AdditionalSupply(Base):
    """Costos de Material Adicional: Papelería y Mantenimiento"""
    __tablename__ = "additional_supplies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False) # ej: Caja Kraft, Sticker, Alcohol Isopropílico
    item_type = Column(String, index=True, nullable=False) # "PAPELERIA" o "MANTENIMIENTO"
    unit_cost_cop = Column(Float, default=0.0) # Costo COP unitario o por uso
    stock_units = Column(Float, default=0.0) # Unidades o usos disponibles
    notes = Column(String, nullable=True, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
