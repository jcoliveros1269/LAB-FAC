from pydantic import BaseModel
from typing import Optional, List

class SystemConfigBase(BaseModel):
    key: str
    value: float
    unit: Optional[str] = None
    description: Optional[str] = None

class SystemConfigCreate(SystemConfigBase):
    pass

class SystemConfigResponse(SystemConfigBase):
    id: int

    class Config:
        from_attributes = True

class VolumeDiscountBase(BaseModel):
    min_units: int
    max_units: int
    discount_percentage: float
    suggested_price_multiplier: Optional[float] = None

class VolumeDiscountCreate(VolumeDiscountBase):
    pass

class VolumeDiscountResponse(VolumeDiscountBase):
    id: int

    class Config:
        from_attributes = True
