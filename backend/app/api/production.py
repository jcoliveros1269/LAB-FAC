from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.accounting import JournalEntry
from app.models.production import ProductionCalculation
from app.models.config import SystemConfig, VolumeDiscount
from app.models.inventory import RawMaterial
from app.schemas.production import (
    ProductionCalculationInput,
    ProductionCalculationResponse
)
from app.api.inventory import parse_entry_datetime

def get_next_entry_number(db: Session) -> int:
    last_entry = db.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first()
    return (last_entry.entry_number if last_entry else 0) + 1

router = APIRouter(prefix="/production", tags=["Calculadora de Producción 3D"])

def get_config_val(db: Session, key: str, default: float) -> float:
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return cfg.value if cfg else default

@router.get("/next-code")
def get_next_project_code(db: Session = Depends(get_db)):
    """
    Retorna el siguiente número secuencial para el código del proyecto (1, 2, 3...)
    """
    records = db.query(ProductionCalculation.project_code, ProductionCalculation.id).all()
    max_val = 0
    for r in records:
        if r.project_code and r.project_code.isdigit():
            val = int(r.project_code)
            if val > max_val:
                max_val = val
        elif r.id and r.id > max_val:
            max_val = r.id
    
    return {"next_code": str(max_val + 1)}

@router.post("/calculate", response_model=ProductionCalculationResponse)
def calculate_3d_production(
    calc_input: ProductionCalculationInput,
    db: Session = Depends(get_db)
):
    """
    Replica la fórmula exacta del Excel 'Calculadora_Produccion':
    - Costo Material: Suma de (g * costo/g por tipo/color de filamento)
    - Costo Energía: horas * (consumo_kW) * tarifa_kWh
    - Costo Depreciación: horas * (costo_impresora / vida_util_horas)
    - Mano de Obra: horas * tarifa_hora
    """
    # Determinar Código Secuencial si viene vacío
    project_code = calc_input.project_code.strip() if calc_input.project_code else ""
    if not project_code:
        records = db.query(ProductionCalculation.project_code, ProductionCalculation.id).all()
        max_val = 0
        for r in records:
            if r.project_code and r.project_code.isdigit():
                val = int(r.project_code)
                if val > max_val:
                    max_val = val
            elif r.id and r.id > max_val:
                max_val = r.id
        project_code = str(max_val + 1)

    # Parámetros del sistema desde BD
    printer_lifespan = get_config_val(db, "printer_lifespan_hours", 5000.0)
    printer_cost = get_config_val(db, "printer_cost_cop", 3390000.0)
    electricity_cost = get_config_val(db, "electricity_kwh_cost", 763.2)
    power_consumption_kw = get_config_val(db, "power_consumption_kw", 0.15)
    labor_rate = get_config_val(db, "labor_hourly_rate", 0.0)
    default_margin_mult = get_config_val(db, "profit_margin_multiplier", 2.8)

    depreciation_per_hour = printer_cost / printer_lifespan if printer_lifespan > 0 else 678.0

    # 1. Procesar Filamentos y Costo Material
    total_grams = 0.0
    material_cost = 0.0

    filaments_list = []
    if calc_input.filaments:
        for f in calc_input.filaments:
            filaments_list.append((f.filament_type, f.color, f.grams, getattr(f, 'material_id', None)))
    else:
        if calc_input.filament1_type and calc_input.filament1_grams > 0:
            filaments_list.append((calc_input.filament1_type, calc_input.filament1_color, calc_input.filament1_grams, None))
        if calc_input.filament2_type and calc_input.filament2_grams > 0:
            filaments_list.append((calc_input.filament2_type, calc_input.filament2_color, calc_input.filament2_grams, None))
        if calc_input.filament3_type and calc_input.filament3_grams > 0:
            filaments_list.append((calc_input.filament3_type, calc_input.filament3_color, calc_input.filament3_grams, None))
        if calc_input.filament4_type and calc_input.filament4_grams > 0:
            filaments_list.append((calc_input.filament4_type, calc_input.filament4_color, calc_input.filament4_grams, None))

    for f_type, f_color, f_grams, f_mat_id in filaments_list:
        total_grams += f_grams
        mat = None
        if f_mat_id:
            mat = db.query(RawMaterial).filter(RawMaterial.id == f_mat_id).first()
        if not mat:
            mat_query = db.query(RawMaterial).filter(
                RawMaterial.material_type.ilike(f_type.strip())
            )
            if f_color and f_color.strip():
                mat = mat_query.filter(RawMaterial.color.ilike(f_color.strip())).order_by(RawMaterial.id.desc()).first()
                if not mat:
                    mat = mat_query.filter(RawMaterial.color.ilike(f"%{f_color.strip()}%")).order_by(RawMaterial.id.desc()).first()
            else:
                mat = mat_query.order_by(RawMaterial.id.desc()).first()
        
        cost_g = mat.cost_per_g if (mat and mat.cost_per_g and mat.cost_per_g > 0) else 65.0
        material_cost += f_grams * cost_g

        if calc_input.deduct_from_inventory and mat:
            mat.outgoing_stock_g += f_grams * calc_input.quantity
            mat.current_stock_g = mat.initial_stock_g - mat.outgoing_stock_g
            db.add(mat)

    # 2. Costos operacionales (Idénticos al Cotizador de Ventas / Sales.jsx)
    energy_cost = calc_input.print_hours * power_consumption_kw * electricity_cost
    depreciation_cost = calc_input.print_hours * depreciation_per_hour
    add_expenses = calc_input.additional_expenses or 0.0

    # Mano de obra 1.9% sobre costo directo base (igual que en Cotizaciones)
    direct_base = material_cost + energy_cost + depreciation_cost + add_expenses
    labor_cost = direct_base * 0.019

    total_unit_cost = direct_base + labor_cost
    total_project_cost = total_unit_cost * calc_input.quantity

    # 3. Margen oficial de venta según escala de volumen (1-4: 2.8x | 5-9: 2.5x | >=10: 2.2x)
    qty = calc_input.quantity or 1
    base_margin = default_margin_mult if default_margin_mult >= 2.0 else (1.0 + default_margin_mult)
    standard_margin = 2.2 if qty >= 10 else (2.5 if qty >= 5 else base_margin)

    vol_discount = db.query(VolumeDiscount).filter(
        VolumeDiscount.min_units <= qty,
        VolumeDiscount.max_units >= qty
    ).first()

    suggested_mult = standard_margin
    vol_discount_pct = 0.0
    if vol_discount and vol_discount.suggested_price_multiplier:
        if vol_discount.suggested_price_multiplier <= 3.2:
            suggested_mult = vol_discount.suggested_price_multiplier
            vol_discount_pct = float(vol_discount.discount_percentage or 0.0)
        else:
            suggested_mult = standard_margin

    base_suggested_price = total_unit_cost * suggested_mult
    suggested_price = base_suggested_price

    # Descuentos personalizados o por volumen
    discount_pct = float(calc_input.discount_percentage or 0.0)
    discount_amt = float(calc_input.discount_amount or 0.0)

    if discount_pct > 0:
        discount_amt = (suggested_price * discount_pct) / 100.0
        suggested_price = max(0.0, suggested_price - discount_amt)
    elif discount_amt > 0:
        discount_pct = (discount_amt / suggested_price * 100.0) if suggested_price > 0 else 0.0
        suggested_price = max(0.0, suggested_price - discount_amt)
    elif vol_discount_pct > 0:
        discount_pct = vol_discount_pct
        discount_amt = max(0.0, base_suggested_price - suggested_price)

    is_internal = bool(calc_input.is_internal_use)
    if is_internal:
        suggested_price = 0.0
        final_price = 0.0
    else:
        final_price = calc_input.sale_price_override if (calc_input.sale_price_override and calc_input.sale_price_override > 0) else suggested_price

    raw_date = calc_input.production_date or calc_input.created_at
    calc_date = parse_entry_datetime(raw_date) if raw_date else datetime.utcnow()

    db_calc = ProductionCalculation(
        project_code=project_code,
        project_name=calc_input.project_name,
        quantity=calc_input.quantity,
        print_hours=calc_input.print_hours,
        created_at=calc_date,
        total_grams=total_grams,
        material_cost=material_cost,
        energy_cost=energy_cost,
        depreciation_cost=depreciation_cost,
        labor_cost=labor_cost,
        additional_expenses=add_expenses,
        discount_percentage=discount_pct if not is_internal else 0.0,
        discount_amount=discount_amt if not is_internal else 0.0,
        total_unit_cost=total_unit_cost,
        suggested_price_margin=suggested_price,
        sale_price_override=final_price,
        is_internal_use=is_internal,
        filament1_type=filaments_list[0][0] if len(filaments_list) > 0 else None,
        filament1_color=filaments_list[0][1] if len(filaments_list) > 0 else None,
        filament1_grams=filaments_list[0][2] if len(filaments_list) > 0 else 0.0,
        filament2_type=filaments_list[1][0] if len(filaments_list) > 1 else None,
        filament2_color=filaments_list[1][1] if len(filaments_list) > 1 else None,
        filament2_grams=filaments_list[1][2] if len(filaments_list) > 1 else 0.0,
        filament3_type=filaments_list[2][0] if len(filaments_list) > 2 else None,
        filament3_color=filaments_list[2][1] if len(filaments_list) > 2 else None,
        filament3_grams=filaments_list[2][2] if len(filaments_list) > 2 else 0.0,
        filament4_type=filaments_list[3][0] if len(filaments_list) > 3 else None,
        filament4_color=filaments_list[3][1] if len(filaments_list) > 3 else None,
        filament4_grams=filaments_list[3][2] if len(filaments_list) > 3 else 0.0,
    )
    db.add(db_calc)
    db.commit()
    db.refresh(db_calc)

    # Asiento Contable por Consumo de Materia Prima en Producción
    if calc_input.deduct_from_inventory and (material_cost * calc_input.quantity) > 0:
        total_mat_val = material_cost * calc_input.quantity
        entry_num = get_next_entry_number(db)
        
        # Si es Uso Interno, asentar como Gasto Operativo / Mantenimiento; si es venta, Costo de Ventas
        puc_deb = "513505" if is_internal else "613505"
        acc_deb = "Gastos Mantenimiento y Dotación Taller" if is_internal else "Costo de Ventas y Producción"
        prefix_desc = "Uso Interno Prisma" if is_internal else "Producción 3D"
        
        j_debit = JournalEntry(
            entry_number=entry_num,
            entry_date=calc_date,
            puc_code=puc_deb,
            account_name=acc_deb,
            description=f"Consumo Filamento {prefix_desc} #{project_code} ({calc_input.project_name})",
            debit=round(total_mat_val, 2),
            credit=0.0
        )
        j_credit = JournalEntry(
            entry_number=entry_num,
            entry_date=calc_date,
            puc_code="140505",
            account_name="Inventario de Materias Primas / Filamentos",
            description=f"Salida Filamento {prefix_desc} #{project_code}",
            debit=0.0,
            credit=round(total_mat_val, 2)
        )
        db.add(j_debit)
        db.add(j_credit)
        db.commit()

    res = ProductionCalculationResponse.model_validate(db_calc)
    res.total_project_cost = total_project_cost
    return res

@router.get("", response_model=List[ProductionCalculationResponse])
def get_all_calculations(db: Session = Depends(get_db)):
    calculations = db.query(ProductionCalculation).order_by(ProductionCalculation.id.desc()).all()
    result = []
    for c in calculations:
        resp = ProductionCalculationResponse.model_validate(c)
        resp.total_project_cost = c.total_unit_cost * c.quantity
        result.append(resp)
    return result

@router.delete("/{calc_id}")
def delete_calculation(calc_id: int, db: Session = Depends(get_db)):
    calc = db.query(ProductionCalculation).filter(ProductionCalculation.id == calc_id).first()
    if not calc:
        raise HTTPException(status_code=404, detail="Cálculo no encontrado")
    db.delete(calc)
    db.commit()
    return {"message": "Cálculo eliminado correctamente"}

@router.put("/{calc_id}", response_model=ProductionCalculationResponse)
def update_calculation(calc_id: int, calc_input: ProductionCalculationInput, db: Session = Depends(get_db)):
    calc = db.query(ProductionCalculation).filter(ProductionCalculation.id == calc_id).first()
    if not calc:
        raise HTTPException(status_code=404, detail="Cálculo no encontrado")
    
    if calc_input.project_code:
        calc.project_code = calc_input.project_code
    if calc_input.project_name:
        calc.project_name = calc_input.project_name
    if calc_input.quantity:
        calc.quantity = calc_input.quantity
    if calc_input.print_hours:
        calc.print_hours = calc_input.print_hours
    
    db.commit()
    db.refresh(calc)
    resp = ProductionCalculationResponse.model_validate(calc)
    resp.total_project_cost = calc.total_unit_cost * calc.quantity
    return resp

