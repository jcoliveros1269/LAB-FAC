from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class RawMaterialBase(BaseModel):
    article_code: Optional[str] = None
    name: str
    color: str
    material_type: str
    initial_stock_g: float = 0.0
    outgoing_stock_g: float = 0.0
    current_stock_g: float = 0.0
    cost_per_g: float
    min_stock_alert_g: float = 200.0
    notes: Optional[str] = ""
    created_at: Optional[datetime] = None

class RawMaterialCreate(RawMaterialBase):
    pass

class RawMaterialUpdate(BaseModel):
    article_code: Optional[str] = None
    name: Optional[str] = None
    color: Optional[str] = None
    material_type: Optional[str] = None
    initial_stock_g: Optional[float] = None
    outgoing_stock_g: Optional[float] = None
    current_stock_g: Optional[float] = None
    cost_per_g: Optional[float] = None
    min_stock_alert_g: Optional[float] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

class RawMaterialResponse(RawMaterialBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class FinishedProductBase(BaseModel):
    serial: Optional[str] = None
    name: str
    color: Optional[str] = None
    material_type: Optional[str] = None
    initial_stock_units: int = 0
    outgoing_units: int = 0
    current_stock_units: int = 0
    unit_cost_cop: float = 0.0
    sale_price_with_margin: float = 0.0
    min_stock_alert: int = 5

class FinishedProductCreate(FinishedProductBase):
    pass

class FinishedProductResponse(FinishedProductBase):
    id: int

    class Config:
        from_attributes = True

class AdditionalSupplyBase(BaseModel):
    name: str
    item_type: str # "PAPELERIA" o "MANTENIMIENTO"
    unit_cost_cop: float = 0.0
    stock_units: float = 0.0
    notes: Optional[str] = ""
    created_at: Optional[datetime] = None

class AdditionalSupplyCreate(AdditionalSupplyBase):
    pass

class AdditionalSupplyUpdate(BaseModel):
    name: Optional[str] = None
    item_type: Optional[str] = None
    unit_cost_cop: Optional[float] = None
    stock_units: Optional[float] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

class AdditionalSupplyResponse(AdditionalSupplyBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
