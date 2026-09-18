from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CustomerBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerResponse(CustomerBase):
    id: int

    class Config:
        from_attributes = True

class SalesDocumentItemBase(BaseModel):
    product_name: str
    quantity: int = 1
    unit_grams: float = 0.0
    print_hours: float = 0.0
    unit_cost: float = 0.0
    unit_price: float = 0.0
    total_price: float = 0.0
    material_cost: Optional[float] = 0.0
    energy_cost: Optional[float] = 0.0
    depreciation_cost: Optional[float] = 0.0
    labor_cost: Optional[float] = 0.0
    additional_cost: Optional[float] = 0.0
    filaments: Optional[List[dict]] = None
    filaments_data: Optional[str] = None

class SalesDocumentItemCreate(SalesDocumentItemBase):
    pass

class SalesDocumentItemResponse(SalesDocumentItemBase):
    id: int

    class Config:
        from_attributes = True

class SalesDocumentBase(BaseModel):
    doc_number: str
    doc_type: str # COTIZACION, FACTURA
    customer_id: Optional[int] = None
    subtotal: float = 0.0
    discount: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    status: str = "DRAFT" # DRAFT, QUOTED, INVOICED, PAID, CANCELLED
    is_internal_use: Optional[bool] = False

class SalesDocumentCreate(SalesDocumentBase):
    items: List[SalesDocumentItemCreate] = []

class SalesDocumentResponse(SalesDocumentBase):
    id: int
    created_at: Optional[datetime] = None
    customer: Optional[CustomerResponse] = None
    items: List[SalesDocumentItemResponse] = []

    class Config:
        from_attributes = True
