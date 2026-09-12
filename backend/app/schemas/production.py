from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class FilamentUsage(BaseModel):
    filament_type: str
    color: str
    grams: float

class ProductionCalculationInput(BaseModel):
    project_code: Optional[str] = ""
    project_name: str
    quantity: int = 1
    print_hours: float
    
    # Lista de hasta 4 filamentos o campos específicos
    filaments: Optional[list[FilamentUsage]] = None
    
    filament1_type: Optional[str] = None
    filament1_color: Optional[str] = None
    filament1_grams: Optional[float] = 0.0
    
    filament2_type: Optional[str] = None
    filament2_color: Optional[str] = None
    filament2_grams: Optional[float] = 0.0
    
    filament3_type: Optional[str] = None
    filament3_color: Optional[str] = None
    filament3_grams: Optional[float] = 0.0
    
    filament4_type: Optional[str] = None
    filament4_color: Optional[str] = None
    filament4_grams: Optional[float] = 0.0
    
    additional_expenses: Optional[float] = 0.0
    sale_price_override: Optional[float] = 0.0
    discount_percentage: Optional[float] = 0.0
    discount_amount: Optional[float] = 0.0
    deduct_from_inventory: Optional[bool] = False

class ProductionCalculationResponse(BaseModel):
    id: Optional[int] = None
    project_code: str
    project_name: str
    quantity: int
    print_hours: float
    total_grams: float
    
    material_cost: float
    energy_cost: float
    depreciation_cost: float
    labor_cost: float
    additional_expenses: float
    discount_percentage: Optional[float] = 0.0
    discount_amount: Optional[float] = 0.0
    
    total_unit_cost: float
    total_project_cost: Optional[float] = 0.0
    suggested_price_margin: float
    sale_price_override: float
    
    filament1_type: Optional[str] = None
    filament1_color: Optional[str] = None
    filament1_grams: Optional[float] = 0.0
    
    filament2_type: Optional[str] = None
    filament2_color: Optional[str] = None
    filament2_grams: Optional[float] = 0.0
    
    filament3_type: Optional[str] = None
    filament3_color: Optional[str] = None
    filament3_grams: Optional[float] = 0.0
    
    filament4_type: Optional[str] = None
    filament4_color: Optional[str] = None
    filament4_grams: Optional[float] = 0.0

    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
