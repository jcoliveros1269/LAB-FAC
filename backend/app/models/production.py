from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class ProductionCalculation(Base):
    """Calculadora de Producción de Piezas 3D"""
    __tablename__ = "production_calculations"

    id = Column(Integer, primary_key=True, index=True)
    project_code = Column(String, index=True, nullable=False) # ID o Nombre Proyecto
    project_name = Column(String, nullable=False)
    quantity = Column(Integer, default=1)
    sale_price_override = Column(Float, default=0.0)
    is_internal_use = Column(Boolean, default=False) # True para piezas de taller / uso propio Prisma Lab
    
    # Consumo de hasta 4 filamentos
    filament1_type = Column(String, nullable=True)
    filament1_color = Column(String, nullable=True)
    filament1_grams = Column(Float, default=0.0)
    
    filament2_type = Column(String, nullable=True)
    filament2_color = Column(String, nullable=True)
    filament2_grams = Column(Float, default=0.0)
    
    filament3_type = Column(String, nullable=True)
    filament3_color = Column(String, nullable=True)
    filament3_grams = Column(Float, default=0.0)
    
    filament4_type = Column(String, nullable=True)
    filament4_color = Column(String, nullable=True)
    filament4_grams = Column(Float, default=0.0)
    
    total_grams = Column(Float, default=0.0)
    print_hours = Column(Float, default=0.0)
    
    # Costos calculados
    material_cost = Column(Float, default=0.0)
    energy_cost = Column(Float, default=0.0)
    depreciation_cost = Column(Float, default=0.0)
    labor_cost = Column(Float, default=0.0)
    additional_expenses = Column(Float, default=0.0)
    discount_percentage = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    total_unit_cost = Column(Float, default=0.0)
    suggested_price_margin = Column(Float, default=0.0)
    
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
