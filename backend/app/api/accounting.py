from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.accounting import PucAccount, JournalEntry, CashFlowRecord
from app.schemas.accounting import (
    PucAccountResponse, PucAccountCreate,
    JournalEntryCreate, JournalEntryResponse,
    CashFlowRecordResponse, CashFlowRecordCreate
)

router = APIRouter(prefix="/accounting", tags=["Contabilidad PUC & Financiero"])

# --- CATÁLOGO PUC ---

@router.get("/puc", response_model=List[PucAccountResponse])
def get_puc_accounts(db: Session = Depends(get_db)):
    return db.query(PucAccount).order_by(PucAccount.code.asc()).all()

@router.post("/puc", response_model=PucAccountResponse)
def create_puc_account(account: PucAccountCreate, db: Session = Depends(get_db)):
    db_account = PucAccount(**account.model_dump())
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

# --- LIBRO DIARIO ---

@router.get("/journal", response_model=List[JournalEntryResponse])
def get_journal_entries(entry_number: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(JournalEntry)
    if entry_number:
        query = query.filter(JournalEntry.entry_number == entry_number)
    return query.order_by(JournalEntry.id.desc()).all()

@router.post("/journal", response_model=List[JournalEntryResponse])
def create_journal_entry(entry: JournalEntryCreate, db: Session = Depends(get_db)):
    """
    Crea un asiento contable validando el principio de Partida Doble (Debe == Haber).
    """
    total_debit = sum(item.debit for item in entry.items)
    total_credit = sum(item.credit for item in entry.items)

    if round(total_debit, 2) != round(total_credit, 2):
        raise HTTPException(
            status_code=400,
            detail=f"Desbalance en asiento contable: Debe (${total_debit:,.2f}) != Haber (${total_credit:,.2f})"
        )

    created_records = []
    entry_date = entry.entry_date or datetime.utcnow()

    for item in entry.items:
        db_item = JournalEntry(
            entry_number=entry.entry_number,
            entry_date=entry_date,
            puc_code=item.puc_code,
            account_name=item.account_name,
            description=item.description or entry.description,
            debit=item.debit,
            credit=item.credit
        )
        db.add(db_item)
        created_records.append(db_item)

    db.commit()
    for r in created_records:
        db.refresh(r)

    return created_records

# --- FLUJO DE CAJA ---

@router.get("/cashflow", response_model=List[CashFlowRecordResponse])
def get_cash_flow_records(db: Session = Depends(get_db)):
    return db.query(CashFlowRecord).order_by(CashFlowRecord.record_date.desc()).all()

@router.post("/cashflow", response_model=CashFlowRecordResponse)
def create_cash_flow_record(record: CashFlowRecordCreate, db: Session = Depends(get_db)):
    # Calcular balance running
    last_record = db.query(CashFlowRecord).order_by(CashFlowRecord.id.desc()).first()
    prev_balance = last_record.balance if last_record else 0.0
    
    new_balance = prev_balance + record.income - record.credit

    db_record = CashFlowRecord(
        record_date=record.record_date,
        description=record.description,
        category=record.category,
        income=record.income,
        credit=record.credit,
        balance=new_balance,
        migration_status="CREATED"
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    # Sincronización Automática con Libro Diario (Partida Doble)
    last_entry = db.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first()
    next_entry_num = (last_entry.entry_number if last_entry else 0) + 1

    if record.income > 0:
        j_debit = JournalEntry(
            entry_number=next_entry_num,
            entry_date=record.record_date or datetime.utcnow(),
            puc_code="110505",
            account_name="Caja General",
            description=f"Flujo de Caja (Ingreso): {record.description}",
            debit=round(record.income, 2),
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=next_entry_num,
            entry_date=record.record_date or datetime.utcnow(),
            puc_code="413505",
            account_name="Comercio al por Mayor y Menor (Ventas 3D)",
            description=f"Flujo de Caja (Ingreso): {record.description}",
            debit=0.0,
            credit=round(record.income, 2)
        )
        db.add(j_debit)
        db.add(j_credit)
        db.commit()
    elif record.credit > 0:
        j_debit = JournalEntry(
            entry_number=next_entry_num,
            entry_date=record.record_date or datetime.utcnow(),
            puc_code="513528",
            account_name="Servicios y Gastos Operacionales",
            description=f"Flujo de Caja (Egreso): {record.description}",
            debit=round(record.credit, 2),
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=next_entry_num,
            entry_date=record.record_date or datetime.utcnow(),
            puc_code="110505",
            account_name="Caja General",
            description=f"Flujo de Caja (Egreso): {record.description}",
            debit=0.0,
            credit=round(record.credit, 2)
        )
        db.add(j_debit)
        db.add(j_credit)
        db.commit()

    return db_record

# --- REPORTES FINANCIEROS (P&L Y BALANCE GENERAL) ---

@router.get("/reports/pnl")
def get_profit_and_loss_report(db: Session = Depends(get_db)):
    """
    Genera el Estado de Resultados (Ganancias y Pérdidas - P&L) desde el Libro Diario.
    - Ingresos (Clase 4 - Crédito)
    - Costos (Clase 6 - Débito)
    - Gastos (Clase 5 - Débito)
    """
    entries = db.query(JournalEntry).all()
    
    total_income = 0.0
    total_costs = 0.0
    total_expenses = 0.0

    for e in entries:
        code = str(e.puc_code)
        if code.startswith("4"): # Ingresos
            total_income += (e.credit - e.debit)
        elif code.startswith("6") or code.startswith("7"): # Costos de Ventas / Producción (Clase 6 y Clase 7)
            total_costs += (e.debit - e.credit)
        elif code.startswith("5"): # Gastos Operacionales / Admin
            total_expenses += (e.debit - e.credit)

    gross_profit = total_income - total_costs
    net_utility = gross_profit - total_expenses

    return {
        "total_income": round(total_income, 2),
        "total_costs": round(total_costs, 2),
        "gross_profit": round(gross_profit, 2),
        "total_expenses": round(total_expenses, 2),
        "net_utility": round(net_utility, 2)
    }

@router.get("/reports/balance")
def get_balance_sheet_report(db: Session = Depends(get_db)):
    """
    Genera el Balance General:
    - Activos (Clase 1)
    - Pasivos (Clase 2)
    - Patrimonio (Clase 3 + Utilidad del Ejercicio)
    """
    entries = db.query(JournalEntry).all()

    total_assets = 0.0
    total_liabilities = 0.0
    total_equity_initial = 0.0
    total_income = 0.0
    total_costs = 0.0
    total_expenses = 0.0

    for e in entries:
        code = str(e.puc_code)
        if code.startswith("1"): # Activos (Naturaleza Débito)
            total_assets += (e.debit - e.credit)
        elif code.startswith("2"): # Pasivos (Naturaleza Crédito)
            total_liabilities += (e.credit - e.debit)
        elif code.startswith("3"): # Patrimonio (Naturaleza Crédito)
            total_equity_initial += (e.credit - e.debit)
        elif code.startswith("4"): # Ingresos
            total_income += (e.credit - e.debit)
        elif code.startswith("5"): # Gastos
            total_expenses += (e.debit - e.credit)
        elif code.startswith("6") or code.startswith("7"): # Costos
            total_costs += (e.debit - e.credit)

    net_utility = total_income - total_costs - total_expenses
    total_equity = total_equity_initial + net_utility

    return {
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liabilities, 2),
        "total_equity_initial": round(total_equity_initial, 2),
        "net_utility": round(net_utility, 2),
        "total_equity": round(total_equity, 2),
        "is_balanced": round(total_assets, 2) == round(total_liabilities + total_equity, 2)
    }

@router.get("/reports/monthly-trend")
def get_monthly_financial_trend(db: Session = Depends(get_db)):
    """
    Calcula la tendencia real mes a mes de Ventas (Clase 4) vs Costos/Gastos (Clase 5 y 6) 
    a partir del Libro Diario registrado en la Base de Datos SQLite.
    """
    entries = db.query(JournalEntry).all()
    
    month_names = {
        '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
        '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
        '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
    }

    monthly = {}
    for e in entries:
        if e.entry_date:
            m_key = e.entry_date.strftime("%Y-%m")
            if m_key not in monthly:
                monthly[m_key] = {"ventas": 0.0, "costos": 0.0}
            
            code = str(e.puc_code)
            if code.startswith("4"):
                monthly[m_key]["ventas"] += (e.credit - e.debit)
            elif code.startswith("5") or code.startswith("6"):
                monthly[m_key]["costos"] += (e.debit - e.credit)

    trend_result = []
    for m_key in sorted(monthly.keys()):
        parts = m_key.split("-")
        m_name = month_names.get(parts[1], parts[1]) if len(parts) > 1 else m_key
        trend_result.append({
            "mes_key": m_key,
            "mes": f"{m_name} {parts[0][-2:]}",
            "ventas": round(max(0.0, monthly[m_key]["ventas"]), 2),
            "costos": round(max(0.0, monthly[m_key]["costos"]), 2)
        })

    return trend_result

