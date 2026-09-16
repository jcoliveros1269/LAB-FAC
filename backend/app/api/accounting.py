from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
import calendar

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

@router.delete("/puc/{puc_id}")
def delete_puc_account(puc_id: int, db: Session = Depends(get_db)):
    account = db.query(PucAccount).filter(PucAccount.id == puc_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta PUC no encontrada")

    # Validar si tiene asientos contables asociados
    has_entries = db.query(JournalEntry).filter(JournalEntry.puc_code == account.code).first()
    if has_entries:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar la cuenta {account.code} ({account.name}) porque tiene asientos registrados en el Libro Diario."
        )

    db.delete(account)
    db.commit()
    return {"message": "Cuenta PUC eliminada correctamente"}

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

@router.delete("/journal/{entry_number}")
def delete_journal_entry(entry_number: int, db: Session = Depends(get_db)):
    entries = db.query(JournalEntry).filter(JournalEntry.entry_number == entry_number).all()
    if not entries:
        raise HTTPException(status_code=404, detail="Asiento contable no encontrado")

    for entry in entries:
        db.delete(entry)
    db.commit()
    return {"message": f"Asiento contable #{entry_number} eliminado correctamente"}

# --- MAPEO CONTABLE INTELIGENTE FLUJO DE CAJA -> PUC ---

def map_cashflow_to_puc(category: str, description: str, is_income: bool):
    """
    Mapea de forma inteligente la categoría y descripción de un movimiento de Flujo de Caja
    a su respectiva cuenta contable PUC (Partida Doble):
    - Equipos / Maquinaria / Impresoras -> 152005 (Activo Fijo: Maquinaria y Equipo)
    - Insumos / Filamentos / Materiales -> 140505 (Activo: Inventario de Materias Primas)
    - Capital / Aportes / Inversión Inicial -> 311505 (Patrimonio: Aportes Sociales / Capital Inicial)
    - Mano de Obra / Salarios -> 510506 (Gasto: Sueldos y Mano de Obra)
    - Servicios Públicos / Energía -> 513528 (Gasto: Servicios de Energía Eléctrica)
    - Ventas Directas -> 413505 (Ingreso: Comercio al por Mayor y Menor - Ventas 3D)
    - Otros Gastos -> 513528 (Gasto: Servicios y Gastos Operacionales)
    """
    cat_str = (category or "").lower().strip()
    desc_str = (description or "").lower().strip()
    full_text = f"{cat_str} {desc_str}"

    if is_income:
        # Entrada a Caja General (110505 Debe). Contrapartida en Haber (Crédito):
        if any(k in full_text for k in ["capital", "aporte", "inversion", "inversión", "socio", "patrimonio"]):
            return "311505", "Aportes Sociales / Capital Inicial"
        elif any(k in full_text for k in ["equipo", "maquinaria", "impresora"]):
            return "152005", "Maquinaria y Equipo (Bambu Lab A1)"
        elif any(k in full_text for k in ["reembolso", "devolucion"]):
            return "513528", "Servicios y Gastos Operacionales"
        else:
            return "413505", "Comercio al por Mayor y Menor (Ventas 3D)"
    else:
        # Salida de Caja General (110505 Haber). Contrapartida en Debe (Débito):
        if any(k in full_text for k in ["equipo", "maquinaria", "impresora", "activo", "herramienta"]):
            return "152005", "Maquinaria y Equipo (Bambu Lab A1)"
        elif any(k in full_text for k in ["materia", "insumo", "filamento", "bobina", "resina"]):
            return "140505", "Inventario de Materias Primas"
        elif any(k in full_text for k in ["sueldo", "salario", "mano de obra", "nomina", "nómina", "operario"]):
            return "510506", "Sueldos y Mano de Obra"
        elif any(k in full_text for k in ["energia", "energía", "luz", "electricidad", "servicio publico", "servicios públicos"]):
            return "513528", "Servicios de Energía Eléctrica"
        elif any(k in full_text for k in ["capital", "aporte", "retiro socio", "devolucion aporte"]):
            return "311505", "Aportes Sociales / Capital Inicial"
        else:
            return "513528", "Servicios y Gastos Operacionales"


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

    # Sincronización Automática con Libro Diario (Partida Doble Inteligente)
    last_entry = db.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first()
    next_entry_num = (last_entry.entry_number if last_entry else 0) + 1

    if record.income > 0:
        puc_code, acc_name = map_cashflow_to_puc(record.category, record.description, is_income=True)
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
            puc_code=puc_code,
            account_name=acc_name,
            description=f"Flujo de Caja (Ingreso): {record.description}",
            debit=0.0,
            credit=round(record.income, 2)
        )
        db.add(j_debit)
        db.add(j_credit)
        db.commit()
    elif record.credit > 0:
        puc_code, acc_name = map_cashflow_to_puc(record.category, record.description, is_income=False)
        j_debit = JournalEntry(
            entry_number=next_entry_num,
            entry_date=record.record_date or datetime.utcnow(),
            puc_code=puc_code,
            account_name=acc_name,
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

@router.delete("/cashflow/{record_id}")
def delete_cash_flow_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(CashFlowRecord).filter(CashFlowRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro de flujo de caja no encontrado")

    # Eliminar asientos contables sincronizados en Libro Diario
    desc_ingreso = f"Flujo de Caja (Ingreso): {record.description}"
    desc_egreso = f"Flujo de Caja (Egreso): {record.description}"
    db.query(JournalEntry).filter(
        (JournalEntry.description == desc_ingreso) | (JournalEntry.description == desc_egreso)
    ).delete(synchronize_session=False)

    db.delete(record)
    db.commit()
    return {"message": "Registro de flujo de caja y sus asientos contables eliminados correctamente"}


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


@router.get("/reports/monthly-cashflow")
def get_monthly_cash_flow_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Estado de Flujo de Efectivo Mensual exacto de acuerdo a la hoja 'Flujo_de_Caja' del Excel:
    - Recaudación del mes (Ingresos a Caja/Bancos: Débito en cuentas 110000..119999)
    - Pagos del mes (proveedores, nómina, gastos: Crédito en cuentas 110000..119999)
    - Flujo neto del mes (Recaudación - Pagos)
    - Saldo inicial de efectivo (Meses Anteriores: Débito - Crédito acumulado antes del inicio de mes)
    - Saldo final disponible en caja y bancos (Saldo inicial + Flujo neto)
    """
    month_names_es = {
        1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
        5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
        9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
    }
    short_month_names = {
        1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr",
        5: "May", 6: "Jun", 7: "Jul", 8: "Ago",
        9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic"
    }

    caja_entries = db.query(JournalEntry).filter(
        JournalEntry.puc_code >= "110000",
        JournalEntry.puc_code < "120000"
    ).all()

    entry_dates = [e.entry_date for e in caja_entries if e.entry_date]
    years_set = set(d.year for d in entry_dates) if entry_dates else set()
    years_set.add(datetime.utcnow().year)
    available_years = sorted(list(years_set))

    target_year = year if year is not None else (available_years[-1] if available_years else datetime.utcnow().year)

    months_with_data = sorted(list(set(
        e.entry_date.month for e in caja_entries 
        if e.entry_date and e.entry_date.year == target_year and (e.debit > 0 or e.credit > 0)
    )))

    if month is not None:
        target_month = month
    elif target_year == 2026 and 5 in months_with_data:
        target_month = 5
    elif months_with_data:
        target_month = months_with_data[-1]
    else:
        target_month = datetime.utcnow().month

    last_day = calendar.monthrange(target_year, target_month)[1]
    d_start = datetime(target_year, target_month, 1, 0, 0, 0)
    d_end = datetime(target_year, target_month, last_day, 23, 59, 59)

    recaudacion_mes = sum(e.debit for e in caja_entries if e.entry_date and d_start <= e.entry_date <= d_end)
    pagos_mes = sum(e.credit for e in caja_entries if e.entry_date and d_start <= e.entry_date <= d_end)
    flujo_neto_mes = recaudacion_mes - pagos_mes

    saldo_inicial = sum(e.debit - e.credit for e in caja_entries if e.entry_date and e.entry_date < d_start)
    saldo_final = saldo_inicial + flujo_neto_mes

    month_movements = []
    for e in sorted(
        [e for e in caja_entries if e.entry_date and d_start <= e.entry_date <= d_end],
        key=lambda x: x.entry_date,
        reverse=True
    ):
        month_movements.append({
            "id": e.id,
            "entry_number": e.entry_number,
            "date": e.entry_date.strftime("%Y-%m-%d"),
            "description": e.description or "Movimiento de Caja",
            "puc_code": e.puc_code,
            "account_name": e.account_name,
            "income": round(e.debit, 2),
            "expense": round(e.credit, 2),
            "type": "INGRESO" if e.debit > 0 else "EGRESO"
        })

    monthly_evolution = []
    for m in range(1, 13):
        m_last_day = calendar.monthrange(target_year, m)[1]
        m_start = datetime(target_year, m, 1, 0, 0, 0)
        m_end = datetime(target_year, m, m_last_day, 23, 59, 59)

        m_rec = sum(e.debit for e in caja_entries if e.entry_date and m_start <= e.entry_date <= m_end)
        m_pag = sum(e.credit for e in caja_entries if e.entry_date and m_start <= e.entry_date <= m_end)
        m_net = m_rec - m_pag
        m_s_ini = sum(e.debit - e.credit for e in caja_entries if e.entry_date and e.entry_date < m_start)
        m_s_fin = m_s_ini + m_net

        monthly_evolution.append({
            "month": m,
            "month_name": month_names_es[m],
            "short_name": short_month_names[m],
            "recaudacion": round(m_rec, 2),
            "pagos": round(m_pag, 2),
            "flujo_neto": round(m_net, 2),
            "saldo_inicial": round(m_s_ini, 2),
            "saldo_final": round(m_s_fin, 2),
            "has_data": (m_rec > 0 or m_pag > 0)
        })

    return {
        "year": target_year,
        "month": target_month,
        "month_name": month_names_es[target_month],
        "start_date": f"{target_year}-{target_month:02d}-01",
        "end_date": f"{target_year}-{target_month:02d}-{last_day:02d}",
        "recaudacion_mes": round(recaudacion_mes, 2),
        "pagos_mes": round(pagos_mes, 2),
        "flujo_neto_mes": round(flujo_neto_mes, 2),
        "saldo_inicial": round(saldo_inicial, 2),
        "saldo_final": round(saldo_final, 2),
        "movements": month_movements,
        "monthly_evolution": monthly_evolution,
        "available_years": available_years,
        "months_with_data": months_with_data
    }


@router.get("/reports/monthly-pnl")
def get_monthly_pnl_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Estado de Resultados Mensual exacto de acuerdo a la hoja 'Panel_GyP' del Excel:
    - INGRESOS DE EXPLOTACIÓN (Clase 4): Haber - Debe en cuentas 400000..499999
    - Costos de explotación (menos) (Clase 7): Haber - Debe en cuentas 700000..799999 (valor negativo)
    - RESULTADO DE EXPLOTACIÓN (UTILIDAD BRUTA): Ingresos + Costos
    - Gastos de administración y ventas (menos) (Clase 5): Haber - Debe en cuentas 500000..599999 (valor negativo)
    - UTILIDAD (pérdida) DEL MES: Utilidad Bruta + Gastos
    - Margen Bruto: IF(Ingresos > 0, ABS(Utilidad Bruta) / Ingresos, 0)
    - Margen Neto: IF(Ingresos > 0, Utilidad Neta / Ingresos, 0)
    """
    month_names_es = {
        1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
        5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
        9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
    }
    short_month_names = {
        1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr",
        5: "May", 6: "Jun", 7: "Jul", 8: "Ago",
        9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic"
    }

    all_entries = db.query(JournalEntry).all()
    entry_dates = [e.entry_date for e in all_entries if e.entry_date]
    years_set = set(d.year for d in entry_dates) if entry_dates else set()
    years_set.add(datetime.utcnow().year)
    available_years = sorted(list(years_set))

    target_year = year if year is not None else (available_years[-1] if available_years else datetime.utcnow().year)

    months_with_data = sorted(list(set(
        e.entry_date.month for e in all_entries
        if e.entry_date and e.entry_date.year == target_year and any(
            str(e.puc_code).startswith(c) for c in ['4', '5', '7']
        )
    )))

    if month is not None:
        target_month = month
    elif target_year == 2026 and 5 in months_with_data:
        target_month = 5
    elif months_with_data:
        target_month = months_with_data[-1]
    else:
        target_month = datetime.utcnow().month

    last_day = calendar.monthrange(target_year, target_month)[1]
    d_start = datetime(target_year, target_month, 1, 0, 0, 0)
    d_end = datetime(target_year, target_month, last_day, 23, 59, 59)

    month_entries = [e for e in all_entries if e.entry_date and d_start <= e.entry_date <= d_end]

    # Ingresos Clase 4: Crédito - Débito
    ingresos_mes = sum((e.credit - e.debit) for e in month_entries if str(e.puc_code).startswith('4'))

    # Costos Clase 7: en Excel fórmula B4 es Haber - Debe (da negativo)
    costos_mes_excel = sum((e.credit - e.debit) for e in month_entries if str(e.puc_code).startswith('7'))
    costos_mes = abs(costos_mes_excel)

    # Utilidad Bruta (Resultado de Explotación): B3 + B4
    utilidad_bruta = ingresos_mes + costos_mes_excel

    # Gastos Clase 5: en Excel fórmula B7 es Haber - Debe (da negativo)
    gastos_mes_excel = sum((e.credit - e.debit) for e in month_entries if str(e.puc_code).startswith('5'))
    gastos_mes = abs(gastos_mes_excel)

    # Utilidad (pérdida) del Mes: B5 + B7
    utilidad_neta = utilidad_bruta + gastos_mes_excel

    # Márgenes de Rentabilidad
    margen_bruto = (abs(utilidad_bruta) / ingresos_mes * 100) if ingresos_mes > 0 else 0.0
    margen_neto = (utilidad_neta / ingresos_mes * 100) if ingresos_mes > 0 else 0.0

    # Desglose de Cuentas PUC para el mes
    def get_class_breakdown(cls_char: str, is_income: bool = False):
        accts = {}
        for e in month_entries:
            if e.puc_code and str(e.puc_code).startswith(cls_char):
                code = str(e.puc_code)
                if code not in accts:
                    accts[code] = {
                        "puc_code": code,
                        "account_name": e.account_name,
                        "debit": 0.0,
                        "credit": 0.0
                    }
                accts[code]["debit"] += e.debit
                accts[code]["credit"] += e.credit

        breakdown = []
        for code, item in sorted(accts.items()):
            net_val = (item["credit"] - item["debit"]) if is_income else (item["debit"] - item["credit"])
            breakdown.append({
                "puc_code": code,
                "account_name": item["account_name"],
                "debit": round(item["debit"], 2),
                "credit": round(item["credit"], 2),
                "net": round(net_val, 2)
            })
        return breakdown

    ingresos_breakdown = get_class_breakdown('4', is_income=True)
    costos_breakdown = get_class_breakdown('7', is_income=False)
    gastos_breakdown = get_class_breakdown('5', is_income=False)

    # Evolución Anual (12 Meses)
    monthly_evolution = []
    for m in range(1, 13):
        m_last_day = calendar.monthrange(target_year, m)[1]
        m_start = datetime(target_year, m, 1, 0, 0, 0)
        m_end = datetime(target_year, m, m_last_day, 23, 59, 59)

        m_entries = [e for e in all_entries if e.entry_date and m_start <= e.entry_date <= m_end]
        m_ing = sum((e.credit - e.debit) for e in m_entries if str(e.puc_code).startswith('4'))
        m_cos_excel = sum((e.credit - e.debit) for e in m_entries if str(e.puc_code).startswith('7'))
        m_cos = abs(m_cos_excel)
        m_ub = m_ing + m_cos_excel

        m_gas_excel = sum((e.credit - e.debit) for e in m_entries if str(e.puc_code).startswith('5'))
        m_gas = abs(m_gas_excel)
        m_un = m_ub + m_gas_excel

        m_mb = (abs(m_ub) / m_ing * 100) if m_ing > 0 else 0.0
        m_mn = (m_un / m_ing * 100) if m_ing > 0 else 0.0

        monthly_evolution.append({
            "month": m,
            "month_name": month_names_es[m],
            "short_name": short_month_names[m],
            "ingresos": round(m_ing, 2),
            "costos": round(m_cos, 2),
            "costos_excel": round(m_cos_excel, 2),
            "utilidad_bruta": round(m_ub, 2),
            "gastos": round(m_gas, 2),
            "gastos_excel": round(m_gas_excel, 2),
            "utilidad_neta": round(m_un, 2),
            "margen_bruto": round(m_mb, 2),
            "margen_neto": round(m_mn, 2),
            "is_profitable": m_un >= 0,
            "has_data": (m_ing > 0 or m_cos > 0 or m_gas > 0)
        })

    return {
        "year": target_year,
        "month": target_month,
        "month_name": month_names_es[target_month],
        "start_date": f"{target_year}-{target_month:02d}-01",
        "end_date": f"{target_year}-{target_month:02d}-{last_day:02d}",
        "ingresos_mes": round(ingresos_mes, 2),
        "costos_mes": round(costos_mes, 2),
        "costos_mes_excel": round(costos_mes_excel, 2),
        "utilidad_bruta": round(utilidad_bruta, 2),
        "gastos_mes": round(gastos_mes, 2),
        "gastos_mes_excel": round(gastos_mes_excel, 2),
        "utilidad_neta": round(utilidad_neta, 2),
        "margen_bruto": round(margen_bruto, 2),
        "margen_neto": round(margen_neto, 2),
        "is_profitable": utilidad_neta >= 0,
        "accounts_breakdown": {
            "ingresos": ingresos_breakdown,
            "costos": costos_breakdown,
            "gastos": gastos_breakdown
        },
        "monthly_evolution": monthly_evolution,
        "available_years": available_years,
        "months_with_data": months_with_data
    }


@router.get("/reports/balance-general")
def get_balance_general_report(
    scope: Optional[str] = "all",
    db: Session = Depends(get_db)
):
    """
    Balance General (Acumulado Histórico) exacto de acuerdo a la hoja 'Balance_General' del Excel:
    - ACTIVOS CIRCULANTES: Disponible (11xxxx), Deudores (13xxxx), Inventarios (14xxxx)
    - ACTIVOS FIJOS: Maquinarias y Equipos (150000..159199), Depreciación (159200..159999)
    - OTROS ACTIVOS: 160000..199999
    - TOTAL ACTIVOS: Circulantes + Fijos + Otros
    - PASIVOS CIRCULANTES: CXP y Proveedores (220000..239999), Impuestos (240000..249999)
    - PASIVOS LARGO PLAZO: Obligaciones Bancarias (210000..219999)
    - TOTAL PASIVOS: Circulantes + Largo Plazo
    - PATRIMONIO: Capital Pagado (310000..319999), Utilidad Histórica (Clase 4 - Clases 5..7)
    - TOTAL PATRIMONIO: Capital + Utilidad Histórica
    - TOTAL PASIVOS Y PATRIMONIO: Total Pasivos + Total Patrimonio
    - DIFERENCIA: Total Activos - Total Pasivos y Patrimonio ($24,609.77 en Excel)
    """
    query = db.query(JournalEntry)
    if scope == "excel":
        # Las 570 operaciones originales migradas exactamente del Excel Libro_Diario_Mayor
        entries = query.filter(JournalEntry.id <= 570).all()
    else:
        entries = query.all()

    def sum_deb_minus_cred(min_c, max_c):
        return sum(e.debit - e.credit for e in entries if e.puc_code and min_c <= e.puc_code < max_c)

    def sum_cred_minus_deb(min_c, max_c):
        return sum(e.credit - e.debit for e in entries if e.puc_code and min_c <= e.puc_code < max_c)

    # 1. ACTIVOS
    caja_bancos = sum_deb_minus_cred("110000", "120000")
    deudores = sum_deb_minus_cred("130000", "140000")
    inventarios = sum_deb_minus_cred("140000", "150000")
    activos_circulantes = caja_bancos + deudores + inventarios

    maquinaria_equipos = sum_deb_minus_cred("150000", "159200")
    depreciacion = sum_deb_minus_cred("159200", "160000")
    activos_fijos = maquinaria_equipos + depreciacion

    otros_activos = sum_deb_minus_cred("160000", "200000")
    total_activos = activos_circulantes + activos_fijos + otros_activos

    # 2. PASIVOS (Incluye Proveedores, Impuestos y Obligaciones Laborales / Nómina)
    cxp_proveedores = sum_cred_minus_deb("220000", "240000")
    impuestos = sum_cred_minus_deb("240000", "250000")
    obligaciones_laborales = sum_cred_minus_deb("250000", "260000")
    pasivos_circulantes = cxp_proveedores + impuestos + obligaciones_laborales

    obligaciones_bancarias = sum_cred_minus_deb("210000", "220000")
    pasivos_largo_plazo = obligaciones_bancarias
    total_pasivos = pasivos_circulantes + pasivos_largo_plazo

    # 3. PATRIMONIO
    capital_pagado = sum_cred_minus_deb("310000", "320000")
    ingresos_totales = sum(e.credit - e.debit for e in entries if e.puc_code and "400000" <= e.puc_code < "500000")
    gastos_costos_totales = sum(e.debit - e.credit for e in entries if e.puc_code and "500000" <= e.puc_code < "800000")
    utilidad_historica = ingresos_totales - gastos_costos_totales
    total_patrimonio = capital_pagado + utilidad_historica

    # 4. TOTAL Y DIFERENCIA (Ecuación Contable Equilibrada)
    total_pasivos_patrimonio = total_pasivos + total_patrimonio
    diferencia = round(total_activos - total_pasivos_patrimonio, 2)
    if abs(diferencia) < 0.01:
        diferencia = 0.0

    # 5. RATIOS FINANCIEROS
    liquidez_corriente = (activos_circulantes / pasivos_circulantes) if pasivos_circulantes > 0 else 0.0
    capital_trabajo = activos_circulantes - pasivos_circulantes
    endeudamiento = (total_pasivos / total_activos * 100) if total_activos > 0 else 0.0
    solvencia_patrimonial = (total_patrimonio / total_pasivos) if total_pasivos > 0 else 0.0

    # 6. DESGLOSE DE CUENTAS PUC DE BALANCE
    def get_accounts_list(min_c, max_c, is_credit_nature=False):
        accts = {}
        for e in entries:
            if e.puc_code and min_c <= e.puc_code < max_c:
                c = e.puc_code
                if c not in accts:
                    accts[c] = {
                        "puc_code": c,
                        "account_name": e.account_name,
                        "debit": 0.0,
                        "credit": 0.0
                    }
                accts[c]["debit"] += e.debit
                accts[c]["credit"] += e.credit

        result = []
        for c, d in sorted(accts.items()):
            saldo = (d["credit"] - d["debit"]) if is_credit_nature else (d["debit"] - d["credit"])
            result.append({
                "puc_code": c,
                "account_name": d["account_name"],
                "debit": round(d["debit"], 2),
                "credit": round(d["credit"], 2),
                "saldo": round(saldo, 2),
                "net": round(saldo, 2)
            })
        return result

    dates = [e.entry_date for e in entries if e.entry_date]
    as_of_date = max(dates).strftime("%Y-%m-%d") if dates else None

    statement_obj = {
        "activos": {
            "circulante": {
                "disponible": round(caja_bancos, 2),
                "deudores": round(deudores, 2),
                "inventarios": round(inventarios, 2),
                "total": round(activos_circulantes, 2)
            },
            "fijos": {
                "maquinarias_equipos": round(maquinaria_equipos, 2),
                "depreciacion": round(depreciacion, 2),
                "total": round(activos_fijos, 2)
            },
            "otros": {
                "total": round(otros_activos, 2)
            },
            "total_activos": round(total_activos, 2)
        },
        "pasivos": {
            "circulante": {
                "cuentas_por_pagar_proveedores": round(cxp_proveedores, 2),
                "impuestos": round(impuestos, 2),
                "obligaciones_laborales": round(obligaciones_laborales, 2),
                "total": round(pasivos_circulantes, 2)
            },
            "largo_plazo": {
                "obligaciones_bancarias": round(obligaciones_bancarias, 2),
                "total": round(pasivos_largo_plazo, 2)
            },
            "total_pasivos": round(total_pasivos, 2)
        },
        "patrimonio": {
            "capital_pagado": round(capital_pagado, 2),
            "utilidad_historica": round(utilidad_historica, 2),
            "total_patrimonio": round(total_patrimonio, 2)
        },
        "total_pasivo_patrimonio": round(total_pasivos_patrimonio, 2),
        "diferencia": diferencia,
        "ecuacion_patrimonial_cuadrada": abs(diferencia) < 0.01,
        "nota_diferencia": ""
    }

    puc_breakdown_obj = {
        "activos": get_accounts_list("100000", "200000", is_credit_nature=False),
        "pasivos": get_accounts_list("200000", "300000", is_credit_nature=True),
        "patrimonio": get_accounts_list("300000", "400000", is_credit_nature=True)
    }

    return {
        "title": "PRISMA LAB - BALANCE GENERAL (ACUMULADO HISTÓRICO)",
        "scope": scope,
        "scope_description": "Corte Histórico Inicial (570 asientos contables)" if scope in ["excel", "historico", "initial"] else "Consolidado en Vivo (todos los asientos registrados)",
        "as_of_date": as_of_date,
        "total_journal_entries": len(entries),
        "statement": statement_obj,
        "ratios": {
            "liquidez_corriente": round(liquidez_corriente, 2),
            "razon_corriente": round(liquidez_corriente, 2),
            "capital_trabajo": round(capital_trabajo, 2),
            "capital_de_trabajo": round(capital_trabajo, 2),
            "endeudamiento": round(endeudamiento, 2),
            "endeudamiento_porcentaje": round(endeudamiento, 2),
            "solvencia_patrimonial": round(solvencia_patrimonial, 2)
        },
        "puc_breakdown": puc_breakdown_obj,
        "activos": statement_obj["activos"],
        "pasivos": statement_obj["pasivos"],
        "patrimonio": statement_obj["patrimonio"],
        "total_pasivos_patrimonio": round(total_pasivos_patrimonio, 2),
        "diferencia": diferencia,
        "diferencia_explicacion": "",
        "cuentas_detalle": puc_breakdown_obj
    }



