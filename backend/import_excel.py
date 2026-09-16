import os
import sys
import openpyxl
from datetime import datetime

# Asegurar que app sea importable
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, SessionLocal, Base
from app.models import (
    SystemConfig, VolumeDiscount, RawMaterial, FinishedProduct,
    ProductionCalculation, Customer, DocumentType, SalesDocumentItem,
    PucAccount, JournalEntry, CashFlowRecord
)

EXCEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Sistema_Integral_Produccion_ prisma lab(Recuperado automáticamente).xlsm")

def clean_val(val, default=None):
    if val is None:
        return default
    if isinstance(val, str):
        val = val.strip()
        if not val or val.lower() == 'none':
            return default
    return val

def clean_float(val, default=0.0):
    val = clean_val(val)
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def clean_int(val, default=0):
    val = clean_val(val)
    if val is None:
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default

def run_import():
    print(f"[+] Cargando archivo Excel desde: {EXCEL_PATH}")
    if not os.path.exists(EXCEL_PATH):
        print(f"[ERROR] Archivo {EXCEL_PATH} no encontrado.")
        return

    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    
    # Reiniciar tablas de base de datos
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. IMPORTAR CONFIGURACIÓN DE COSTOS
        print("[+] Importando Configuracion de Costos...")
        if "Configuracion_Costos" in wb.sheetnames:
            sheet = wb["Configuracion_Costos"]
            key_mapping = {
                "Vida útil Impresora": ("printer_lifespan_hours", "Horas"),
                "Costo Máquina ( BAMBULAB A1)": ("printer_cost_cop", "COP"),
                "Costo Energía KWh": ("electricity_kwh_cost", "COP/KWh"),
                "Consumo BAMBULAB A1": ("power_consumption_kw", "KW/h"),
                "Mano de Obra": ("labor_hourly_rate", "COP/Hora"),
                "Margen de Beneficio": ("profit_margin_multiplier", "%"),
                "Depreciación por Hora": ("depreciation_hourly_rate", "COP/h"),
            }
            for r in range(2, sheet.max_row + 1):
                param = clean_val(sheet.cell(row=r, column=1).value)
                val = clean_float(sheet.cell(row=r, column=2).value)
                unit = clean_val(sheet.cell(row=r, column=3).value)
                desc = clean_val(sheet.cell(row=r, column=4).value)

                if param in key_mapping:
                    db_key, default_unit = key_mapping[param]
                    cfg = SystemConfig(
                        key=db_key,
                        value=val,
                        unit=unit or default_unit,
                        description=desc or param
                    )
                    db.add(cfg)
        db.commit()

        # 2. IMPORTAR DESCUENTOS POR VOLUMEN
        print("[+] Importando Descuentos por Volumen...")
        if "Descuentos_Volumen" in wb.sheetnames:
            sheet = wb["Descuentos_Volumen"]
            for r in range(2, sheet.max_row + 1):
                r_min = clean_int(sheet.cell(row=r, column=1).value, -1)
                if r_min > 0:
                    r_max = clean_int(sheet.cell(row=r, column=2).value, 9999)
                    disc_str = str(sheet.cell(row=r, column=3).value or "0").replace("%", "").strip()
                    disc_pct = clean_float(disc_str)
                    sug_price = clean_float(sheet.cell(row=r, column=4).value)
                    
                    disc = VolumeDiscount(
                        min_units=r_min,
                        max_units=r_max,
                        discount_percentage=disc_pct,
                        suggested_price_multiplier=sug_price
                    )
                    db.add(disc)
        db.commit()

        # 3. IMPORTAR INVENTARIO DE MATERIALES (FILAMENTOS)
        print("[+] Importando Inventario de Materiales / Filamentos...")
        if "Inventario_Materiales_(2)" in wb.sheetnames:
            sheet = wb["Inventario_Materiales_(2)"]
            for r in range(7, sheet.max_row + 1):
                code = clean_val(sheet.cell(row=r, column=1).value)
                name = clean_val(sheet.cell(row=r, column=2).value)
                if name:
                    color = clean_val(sheet.cell(row=r, column=3).value, "Estándar")
                    mtype = clean_val(sheet.cell(row=r, column=4).value, "PLA")
                    prov = clean_val(sheet.cell(row=r, column=5).value)
                    stock_init = clean_float(sheet.cell(row=r, column=7).value, 1000.0)
                    outgoing = clean_float(sheet.cell(row=r, column=8).value, 0.0)
                    stock_act = sheet.cell(row=r, column=9).value
                    current_stock = clean_float(stock_act, stock_init - outgoing)
                    cost_g = clean_float(sheet.cell(row=r, column=10).value)
                    if cost_g == 0:
                        cost_tot = clean_float(sheet.cell(row=r, column=6).value)
                        cost_g = cost_tot / 1000.0 if cost_tot > 0 else 65.0
                    notes = clean_val(sheet.cell(row=r, column=14).value, "")
                    if prov:
                        notes = f"Proveedor: {prov}. {notes}".strip()

                    mat = RawMaterial(
                        article_code=code,
                        name=name,
                        color=color.capitalize() if color else "Estándar",
                        material_type=mtype.upper() if mtype else "PLA",
                        initial_stock_g=stock_init,
                        outgoing_stock_g=outgoing,
                        current_stock_g=current_stock,
                        cost_per_g=cost_g,
                        notes=notes,
                        min_stock_alert_g=200.0
                    )
                    db.add(mat)
        elif "Inventario_Materiales" in wb.sheetnames:
            sheet = wb["Inventario_Materiales"]
            for r in range(2, sheet.max_row + 1):
                name = clean_val(sheet.cell(row=r, column=1).value)
                if name:
                    color = clean_val(sheet.cell(row=r, column=2).value, "Estándar")
                    mtype = clean_val(sheet.cell(row=r, column=3).value, "PLA")
                    stock_init = clean_float(sheet.cell(row=r, column=4).value, 1000.0)
                    outgoing = clean_float(sheet.cell(row=r, column=5).value, 0.0)
                    current_stock = clean_float(sheet.cell(row=r, column=6).value, stock_init - outgoing)
                    cost_g = clean_float(sheet.cell(row=r, column=8).value) # precio*gramo
                    if cost_g == 0:
                        cost_tot = clean_float(sheet.cell(row=r, column=7).value)
                        cost_g = cost_tot / 1000.0 if cost_tot > 0 else 65.0

                    mat = RawMaterial(
                        name=name,
                        color=color,
                        material_type=mtype,
                        initial_stock_g=stock_init,
                        outgoing_stock_g=outgoing,
                        current_stock_g=current_stock,
                        cost_per_g=cost_g,
                        min_stock_alert_g=200.0
                    )
                    db.add(mat)
        db.commit()

        # 4. IMPORTAR PRODUCTOS TERMINADOS
        print("[+] Importando Productos Terminados...")
        if "Inventario_Prod_terminado" in wb.sheetnames:
            sheet = wb["Inventario_Prod_terminado"]
            for r in range(3, sheet.max_row + 1):
                serial = clean_val(sheet.cell(row=r, column=1).value)
                name = clean_val(sheet.cell(row=r, column=2).value)
                if name:
                    color = clean_val(sheet.cell(row=r, column=3).value)
                    mtype = clean_val(sheet.cell(row=r, column=4).value)
                    s_init = clean_int(sheet.cell(row=r, column=5).value, 0)
                    s_out = clean_int(sheet.cell(row=r, column=6).value, 0)
                    s_curr = clean_int(sheet.cell(row=r, column=7).value, s_init - s_out)
                    unit_cost = clean_float(sheet.cell(row=r, column=8).value, 0.0)
                    sale_price = clean_float(sheet.cell(row=r, column=10).value, 0.0)

                    prod = FinishedProduct(
                        serial=serial,
                        name=name,
                        color=color,
                        material_type=mtype,
                        initial_stock_units=s_init,
                        outgoing_units=s_out,
                        current_stock_units=s_curr,
                        unit_cost_cop=unit_cost,
                        sale_price_with_margin=sale_price
                    )
                    db.add(prod)
        db.commit()

        # 5. IMPORTAR CALCULADORA DE PRODUCCIÓN (186 REGISTROS)
        print("[+] Importando Historico de Calculadora de Produccion...")
        if "Calculadora_Produccion" in wb.sheetnames:
            sheet = wb["Calculadora_Produccion"]
            for r in range(2, sheet.max_row + 1):
                code = clean_val(sheet.cell(row=r, column=1).value)
                name = clean_val(sheet.cell(row=r, column=2).value)
                if code and name:
                    qty = clean_int(sheet.cell(row=r, column=3).value, 1)
                    vta = clean_float(sheet.cell(row=r, column=4).value, 0.0)
                    
                    f1_g = clean_float(sheet.cell(row=r, column=5).value, 0.0)
                    f1_col = clean_val(sheet.cell(row=r, column=6).value)
                    
                    f2_g = clean_float(sheet.cell(row=r, column=7).value, 0.0)
                    f2_col = clean_val(sheet.cell(row=r, column=8).value)
                    
                    f3_g = clean_float(sheet.cell(row=r, column=9).value, 0.0)
                    f3_col = clean_val(sheet.cell(row=r, column=10).value)
                    
                    f4_g = clean_float(sheet.cell(row=r, column=11).value, 0.0)
                    f4_col = clean_val(sheet.cell(row=r, column=12).value)

                    tot_g = clean_float(sheet.cell(row=r, column=13).value, f1_g + f2_g + f3_g + f4_g)
                    hours = clean_float(sheet.cell(row=r, column=14).value, 0.0)

                    c_mat = clean_float(sheet.cell(row=r, column=15).value, 0.0)
                    c_ene = clean_float(sheet.cell(row=r, column=16).value, 0.0)
                    c_dep = clean_float(sheet.cell(row=r, column=17).value, 0.0)
                    c_mob = clean_float(sheet.cell(row=r, column=18).value, 0.0)
                    c_add = clean_float(sheet.cell(row=r, column=19).value, 0.0)
                    c_tot = clean_float(sheet.cell(row=r, column=20).value, c_mat + c_ene + c_dep + c_mob + c_add)
                    p_margin = clean_float(sheet.cell(row=r, column=21).value, 0.0)

                    calc = ProductionCalculation(
                        project_code=str(code).zfill(3),
                        project_name=name,
                        quantity=qty,
                        sale_price_override=vta,
                        filament1_type="PETG/PLA" if f1_g > 0 else None,
                        filament1_color=f1_col,
                        filament1_grams=f1_g,
                        filament2_type="PETG/PLA" if f2_g > 0 else None,
                        filament2_color=f2_col,
                        filament2_grams=f2_g,
                        filament3_type="PETG/PLA" if f3_g > 0 else None,
                        filament3_color=f3_col,
                        filament3_grams=f3_g,
                        filament4_type="PETG/PLA" if f4_g > 0 else None,
                        filament4_color=f4_col,
                        filament4_grams=f4_g,
                        total_grams=tot_g,
                        print_hours=hours,
                        material_cost=c_mat,
                        energy_cost=c_ene,
                        depreciation_cost=c_dep,
                        labor_cost=c_mob,
                        additional_expenses=c_add,
                        total_unit_cost=c_tot,
                        suggested_price_margin=p_margin
                    )
                    db.add(calc)
        db.commit()

        # 6. IMPORTAR CLIENTES Y FACTURAS DE VENTA
        print("[+] Importando Clientes y Documentos de Venta...")
        if "Facturacin" in wb.sheetnames or any("Factura" in s for s in wb.sheetnames):
            sheet_name = [s for s in wb.sheetnames if "Factura" in s][0]
            sheet = wb[sheet_name]
            # Cliente genérico Prisma Lab
            default_customer = Customer(
                name="CLIENTE GENERAL PRISMA LAB",
                email="contacto@prismalab.co",
                phone="3000000000"
            )
            db.add(default_customer)
            db.commit()
            db.refresh(default_customer)

            # Factura inicial de muestra de la pestaña Facturación
            doc = DocumentType(
                doc_number="FAC-001",
                doc_type="FACTURA",
                customer_id=default_customer.id,
                subtotal=574343.23,
                discount=0.0,
                tax=0.0,
                total=574343.23,
                status="PAID"
            )
            db.add(doc)
            db.commit()

        # 7. IMPORTAR CONTABILIDAD - CATÁLOGO PUC & LIBRO DIARIO
        print("[+] Importando Catalogo PUC y Asientos de Libro Diario...")
        
        # Cuentas PUC Estándar Prisma Lab
        puc_catalog = [
            ("110505", "Caja General", "ACTIVO"),
            ("140505", "Inventario de Materias Primas", "ACTIVO"),
            ("143005", "Inventario de Productos Terminados", "ACTIVO"),
            ("152005", "Maquinaria y Equipo (Bambu Lab A1)", "ACTIVO"),
            ("311505", "Aportes Sociales / Capital Inicial", "PATRIMONIO"),
            ("413505", "Comercio al por Mayor y Menor (Ventas 3D)", "INGRESO"),
            ("510506", "Sueldos y Mano de Obra", "GASTO"),
            ("513528", "Servicios de Energía Eléctrica", "GASTO"),
            ("516005", "Depreciación Maquinaria", "GASTO"),
            ("613505", "Costo de Ventas y Producción", "COSTO"),
        ]

        for code, name, atype in puc_catalog:
            puc = PucAccount(code=code, name=name, account_type=atype)
            db.add(puc)
        db.commit()

        if "Libro_Diario_Mayor" in wb.sheetnames:
            sheet = wb["Libro_Diario_Mayor"]
            for r in range(2, sheet.max_row + 1):
                entry_num = clean_int(sheet.cell(row=r, column=1).value)
                if entry_num > 0:
                    dt_val = sheet.cell(row=r, column=2).value
                    entry_date = dt_val if isinstance(dt_val, datetime) else datetime.utcnow()
                    puc_code = str(clean_val(sheet.cell(row=r, column=3).value, "110505"))
                    acc_name = clean_val(sheet.cell(row=r, column=4).value, "Cuenta Contable")
                    desc = clean_val(sheet.cell(row=r, column=5).value, "Asiento Importado")
                    debit = clean_float(sheet.cell(row=r, column=6).value, 0.0)
                    credit = clean_float(sheet.cell(row=r, column=7).value, 0.0)

                    j_entry = JournalEntry(
                        entry_number=entry_num,
                        entry_date=entry_date,
                        puc_code=puc_code,
                        account_name=acc_name,
                        description=desc,
                        debit=debit,
                        credit=credit
                    )
                    db.add(j_entry)
        db.commit()

        # 8. IMPORTAR REGISTRO DE FLUJO DE CAJA
        print("[+] Importando Registro de Flujo de Caja...")
        if "Registro_Flujo_Caja" in wb.sheetnames:
            sheet = wb["Registro_Flujo_Caja"]
            for r in range(5, sheet.max_row + 1):
                dt_val = sheet.cell(row=r, column=2).value
                desc = clean_val(sheet.cell(row=r, column=3).value)
                if desc and dt_val:
                    r_date = dt_val if isinstance(dt_val, datetime) else datetime.utcnow()
                    cat = clean_val(sheet.cell(row=r, column=4).value, "General")
                    inc = clean_float(sheet.cell(row=r, column=5).value, 0.0)
                    cred = clean_float(sheet.cell(row=r, column=6).value, 0.0)
                    bal = clean_float(sheet.cell(row=r, column=8).value, 0.0)

                    cf = CashFlowRecord(
                        record_date=r_date,
                        description=desc,
                        category=cat,
                        income=inc,
                        credit=cred,
                        balance=bal,
                        migration_status="MIGRATED"
                    )
                    db.add(cf)
        db.commit()

        print("[OK] MIGRACION DE DATOS DESDE EL EXCEL A SQLITE COMPLETADA EXITOSAMENTE!")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error durante la migracion: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    run_import()
