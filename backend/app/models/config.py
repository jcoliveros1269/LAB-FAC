from sqlalchemy import Column, Integer, String, Float
from app.database import Base

class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False) # ej: printer_lifespan_hours, electricity_kwh_cost
    value = Column(Float, nullable=False)
    unit = Column(String, nullable=True) # ej: Horas, COP/kWh, Watts
    description = Column(String, nullable=True)

class VolumeDiscount(Base):
    __tablename__ = "volume_discounts"

    id = Column(Integer, primary_key=True, index=True)
    min_units = Column(Integer, nullable=False)
    max_units = Column(Integer, nullable=False)
    discount_percentage = Column(Float, nullable=False)
    suggested_price_multiplier = Column(Float, nullable=True)
