from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class PucAccountBase(BaseModel):
    code: str
    name: str
    account_type: str # ACTIVO, PASIVO, PATRIMONIO, INGRESO, GASTO, COSTO

class PucAccountCreate(PucAccountBase):
    pass

class PucAccountResponse(PucAccountBase):
    id: int

    class Config:
        from_attributes = True

class JournalEntryItem(BaseModel):
    puc_code: str
    account_name: str
    description: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0

class JournalEntryCreate(BaseModel):
    entry_number: int
    entry_date: Optional[datetime] = None
    description: Optional[str] = None
    items: List[JournalEntryItem]

class JournalEntryResponse(BaseModel):
    id: int
    entry_number: int
    entry_date: datetime
    puc_code: str
    account_name: str
    description: Optional[str] = None
    debit: float
    credit: float

    class Config:
        from_attributes = True

class CashFlowRecordBase(BaseModel):
    record_date: datetime
    description: str
    category: str
    income: float = 0.0
    credit: float = 0.0
    balance: float = 0.0
    migration_status: Optional[str] = "MIGRATED"

class CashFlowRecordCreate(CashFlowRecordBase):
    pass

class CashFlowRecordResponse(CashFlowRecordBase):
    id: int

    class Config:
        from_attributes = True
