from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.models import *

from app.api.config import router as config_router
from app.api.inventory import router as inventory_router
from app.api.production import router as production_router
from app.api.sales import router as sales_router
from app.api.accounting import router as accounting_router

# Sincronizar esquemas de base de datos SQLite
Base.metadata.create_all(bind=engine)

# Migración segura de columnas adicionales en SQLite
try:
    from sqlalchemy import text
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(raw_materials)"))
        cols = [r[1] for r in res.fetchall()]
        if cols and "created_at" not in cols:
            conn.execute(text("ALTER TABLE raw_materials ADD COLUMN created_at DATETIME"))
            conn.execute(text("UPDATE raw_materials SET created_at = updated_at WHERE created_at IS NULL"))
            conn.commit()

        if cols and "article_code" not in cols:
            conn.execute(text("ALTER TABLE raw_materials ADD COLUMN article_code TEXT"))
            conn.commit()

        res_supp = conn.execute(text("PRAGMA table_info(additional_supplies)"))
        cols_supp = [r[1] for r in res_supp.fetchall()]
        if cols_supp and "created_at" not in cols_supp:
            conn.execute(text("ALTER TABLE additional_supplies ADD COLUMN created_at DATETIME"))
            conn.execute(text("UPDATE additional_supplies SET created_at = updated_at WHERE created_at IS NULL"))
            conn.commit()
except Exception as e:
    pass

# Auto-asignar código de artículo oficial a cualquier material existente que tenga '-' o nulo
# e importar catálogo oficial de 60 bobinas si la base de datos tiene menos de 10 registros
try:
    from app.database import SessionLocal, PROJECT_ROOT
    from app.models.inventory import RawMaterial
    from app.utils.article_codes import generate_article_code
    import os
    db_init = SessionLocal()
    mats_without_code = db_init.query(RawMaterial).filter(
        (RawMaterial.article_code == None) | (RawMaterial.article_code == "") | (RawMaterial.article_code == "-")
    ).all()
    for m in mats_without_code:
        m.article_code = generate_article_code(m.material_type or "PETG", m.color or "Blanco", db=db_init)
    if mats_without_code:
        db_init.commit()

    # Si la base de datos tiene menos de 10 materiales, auto-sincronizar el catálogo oficial de bobinas del Excel
    if db_init.query(RawMaterial).count() < 10:
        import openpyxl
        excel_path = os.path.join(PROJECT_ROOT, "Sistema_Integral_Produccion_ prisma lab(Recuperado automáticamente).xlsm")
        if os.path.exists(excel_path):
            wb = openpyxl.load_workbook(excel_path, data_only=True)
            sheet_name = "Inventario_Materiales_(2)" if "Inventario_Materiales_(2)" in wb.sheetnames else "Inventario_Materiales"
            sheet = wb[sheet_name]
            start_row = 7 if sheet_name == "Inventario_Materiales_(2)" else 2
            for r in range(start_row, sheet.max_row + 1):
                raw_code = sheet.cell(row=r, column=1).value if sheet_name == "Inventario_Materiales_(2)" else None
                raw_name = sheet.cell(row=r, column=2 if sheet_name == "Inventario_Materiales_(2)" else 1).value
                if not raw_name:
                    continue
                name_str = str(raw_name).strip()
                if not name_str:
                    continue
                
                code_str = str(raw_code).strip() if raw_code else None
                if code_str and db_init.query(RawMaterial).filter(RawMaterial.article_code == code_str).first():
                    continue
                if db_init.query(RawMaterial).filter(RawMaterial.name == name_str).first():
                    continue

                color_val = str(sheet.cell(row=r, column=3 if sheet_name == "Inventario_Materiales_(2)" else 2).value or "Estándar").strip()
                mtype_val = str(sheet.cell(row=r, column=4 if sheet_name == "Inventario_Materiales_(2)" else 3).value or "PLA").strip()
                try:
                    stock_init_val = float(sheet.cell(row=r, column=7 if sheet_name == "Inventario_Materiales_(2)" else 4).value or 1000.0)
                except Exception:
                    stock_init_val = 1000.0
                try:
                    outgoing_val = float(sheet.cell(row=r, column=8 if sheet_name == "Inventario_Materiales_(2)" else 5).value or 0.0)
                except Exception:
                    outgoing_val = 0.0
                try:
                    cost_g_val = float(sheet.cell(row=r, column=10 if sheet_name == "Inventario_Materiales_(2)" else 8).value or 65.0)
                except Exception:
                    cost_g_val = 65.0
                if cost_g_val <= 0:
                    cost_g_val = 65.0
                
                notes_val = str(sheet.cell(row=r, column=14 if sheet_name == "Inventario_Materiales_(2)" else 10).value or "").strip()
                prov_val = str(sheet.cell(row=r, column=5).value or "").strip() if sheet_name == "Inventario_Materiales_(2)" else ""
                if prov_val:
                    notes_val = f"Proveedor: {prov_val}. {notes_val}".strip()

                mat = RawMaterial(
                    article_code=code_str if code_str else generate_article_code(mtype_val, color_val, db=db_init),
                    name=name_str,
                    color=color_val.capitalize() if color_val else "Estándar",
                    material_type=mtype_val.upper() if mtype_val else "PLA",
                    initial_stock_g=stock_init_val,
                    outgoing_stock_g=outgoing_val,
                    current_stock_g=stock_init_val - outgoing_val,
                    cost_per_g=cost_g_val,
                    notes=notes_val,
                    min_stock_alert_g=200.0
                )
                db_init.add(mat)
            db_init.commit()

    db_init.close()
except Exception as e:
    pass

app = FastAPI(
    title="Prisma Lab ERP - API Backend",
    description="Sistema Integral de Producción, Cotización y Contabilidad 3D (Migración Excel a Web)",
    version="1.0.0"
)

# Habilitar CORS para frontend local React Vite
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar Routers API con prefijo /api
app.include_router(config_router, prefix="/api")
app.include_router(inventory_router, prefix="/api")
app.include_router(production_router, prefix="/api")
app.include_router(sales_router, prefix="/api")
app.include_router(accounting_router, prefix="/api")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": "Prisma Lab ERP & 3D Production System",
        "version": "1.0.0",
        "docs": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database": "connected (SQLite local)"}
