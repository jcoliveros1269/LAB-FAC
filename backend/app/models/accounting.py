from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from datetime import datetime
from app.database import Base

class PucAccount(Base):
    """Plan Único de Cuentas (PUC)"""
    __tablename__ = "puc_accounts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False) # ej: 110505
    name = Column(String, nullable=False) # ej: Caja General
    account_type = Column(String, nullable=False) # ACTIVO, PASIVO, PATRIMONIO, INGRESO, GASTO, COSTO

class JournalEntry(Base):
    """Libro Diario / Mayor"""
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    entry_number = Column(Integer, index=True, nullable=False) # ID Asiento
    entry_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    puc_code = Column(String, index=True, nullable=False)
    account_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    debit = Column(Float, default=0.0)  # Debe
    credit = Column(Float, default=0.0) # Haber

class CashFlowRecord(Base):
    """Registro de Flujo de Caja"""
    __tablename__ = "cash_flow_records"

    id = Column(Integer, primary_key=True, index=True)
    record_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    description = Column(String, nullable=False)
    category = Column(String, nullable=False)
    income = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)
    balance = Column(Float, default=0.0)
    migration_status = Column(String, default="MIGRATED")
