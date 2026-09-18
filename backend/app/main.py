from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.models import *

from app.api.config import router as config_router
from app.api.inventory import router as inventory_router
from app.api.production import router as production_router
from app.api.sales import router as sales_router
from app.api.accounting import router as accounting_router
from app.api.auth import router as auth_router

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

        res_users = conn.execute(text("PRAGMA table_info(users)"))
        cols_users = [r[1] for r in res_users.fetchall()]
        if cols_users:
            if "can_delete" not in cols_users:
                conn.execute(text("ALTER TABLE users ADD COLUMN can_delete BOOLEAN DEFAULT 1"))
            if "can_edit" not in cols_users:
                conn.execute(text("ALTER TABLE users ADD COLUMN can_edit BOOLEAN DEFAULT 1"))
            if "read_only" not in cols_users:
                conn.execute(text("ALTER TABLE users ADD COLUMN read_only BOOLEAN DEFAULT 0"))
            if "allowed_modules" not in cols_users:
                conn.execute(text("ALTER TABLE users ADD COLUMN allowed_modules TEXT DEFAULT 'dashboard,production,inventory,sales,accounting,config'"))
            if "permissions_matrix" not in cols_users:
                conn.execute(text("ALTER TABLE users ADD COLUMN permissions_matrix TEXT"))
            conn.commit()

        res_prod = conn.execute(text("PRAGMA table_info(production_calculations)"))
        cols_prod = [r[1] for r in res_prod.fetchall()]
        if cols_prod and "is_internal_use" not in cols_prod:
            conn.execute(text("ALTER TABLE production_calculations ADD COLUMN is_internal_use BOOLEAN DEFAULT 0"))
            conn.commit()

        res_fp = conn.execute(text("PRAGMA table_info(finished_products)"))
        cols_fp = [r[1] for r in res_fp.fetchall()]
        if cols_fp and "is_internal_use" not in cols_fp:
            conn.execute(text("ALTER TABLE finished_products ADD COLUMN is_internal_use BOOLEAN DEFAULT 0"))
            conn.commit()

        res_sd = conn.execute(text("PRAGMA table_info(sales_documents)"))
        cols_sd = [r[1] for r in res_sd.fetchall()]
        if cols_sd and "is_internal_use" not in cols_sd:
            conn.execute(text("ALTER TABLE sales_documents ADD COLUMN is_internal_use BOOLEAN DEFAULT 0"))
        if cols_sd and "internal_accounting_target" not in cols_sd:
            conn.execute(text("ALTER TABLE sales_documents ADD COLUMN internal_accounting_target TEXT DEFAULT 'ASSET'"))
        conn.commit()

        res_fp = conn.execute(text("PRAGMA table_info(finished_products)"))
        cols_fp = [r[1] for r in res_fp.fetchall()]
        if cols_fp and "is_internal_use" not in cols_fp:
            conn.execute(text("ALTER TABLE finished_products ADD COLUMN is_internal_use BOOLEAN DEFAULT 0"))
        if cols_fp and "internal_accounting_target" not in cols_fp:
            conn.execute(text("ALTER TABLE finished_products ADD COLUMN internal_accounting_target TEXT DEFAULT 'ASSET'"))
        conn.commit()

        res_sdi = conn.execute(text("PRAGMA table_info(sales_document_items)"))
        cols_sdi = [r[1] for r in res_sdi.fetchall()]
        if cols_sdi:
            for sdi_col, sdi_type in [
                ("material_cost", "REAL DEFAULT 0.0"),
                ("energy_cost", "REAL DEFAULT 0.0"),
                ("depreciation_cost", "REAL DEFAULT 0.0"),
                ("labor_cost", "REAL DEFAULT 0.0"),
                ("additional_cost", "REAL DEFAULT 0.0"),
                ("filaments_data", "TEXT")
            ]:
                if sdi_col not in cols_sdi:
                    conn.execute(text(f"ALTER TABLE sales_document_items ADD COLUMN {sdi_col} {sdi_type}"))
            conn.commit()

        # Asegurar cuentas para manufactura y uso interno en catálogo PUC
        try:
            needed_accounts = [
                ('143005', 'Inventario de Productos Terminados', 'ACTIVO'),
                ('152405', 'Herramientas y Accesorios de Taller (Uso Propio)', 'ACTIVO'),
                ('412005', 'Ingresos - Industrias Manufactureras', 'INGRESO'),
                ('513505', 'Dotación y Mantenimiento de Taller', 'GASTO'),
                ('519505', 'Gastos Diversos (Aseo, Cafetería, Útiles y Mantenimiento)', 'GASTO'),
                ('612005', 'Costo de Ventas - Industrias Manufactureras', 'COSTO'),
                ('710505', 'Costos de Producción - Materias Primas', 'COSTO'),
                ('720505', 'Costos de Producción - Mano de Obra Directa', 'COSTO'),
                ('730505', 'Costos de Producción - Costos Indirectos (CIF)', 'COSTO'),
            ]
            puc_codes = [r[0] for r in conn.execute(text("SELECT code FROM puc_accounts")).fetchall()]
            for code, name, acc_type in needed_accounts:
                if code not in puc_codes:
                    conn.execute(text(f"INSERT INTO puc_accounts (code, name, account_type) VALUES ('{code}', '{name}', '{acc_type}')"))
            conn.commit()
        except Exception:
            pass

        # Migrar documentos y productos previos asociados a clientes de uso interno
        try:
            conn.execute(text("""
                UPDATE sales_documents 
                SET is_internal_use = 1 
                WHERE customer_id IN (
                    SELECT id FROM customers 
                    WHERE LOWER(name) LIKE '%uso interno%' 
                       OR LOWER(name) LIKE '%prisma lab%' 
                       OR LOWER(email) LIKE '%prismalab%'
                )
            """))
            conn.execute(text("""
                UPDATE finished_products 
                SET is_internal_use = 1, sale_price_with_margin = 0 
                WHERE serial IN (
                    SELECT 'PROD-' || REPLACE(REPLACE(doc_number, 'FAC-', ''), 'COT-', '') 
                    FROM sales_documents WHERE is_internal_use = 1
                )
            """))
            conn.commit()
        except Exception:
            pass

        # Auto-corregir escalas de multiplicadores de volumen si tienen valores viejos inflados (ej: 5.0)
        try:
            res_vd = conn.execute(text("SELECT id, suggested_price_multiplier FROM volume_discounts")).fetchall()
            if any(r[1] and r[1] >= 3.5 for r in res_vd) or len(res_vd) == 0:
                conn.execute(text("DELETE FROM volume_discounts"))
                conn.execute(text("INSERT INTO volume_discounts (id, min_units, max_units, discount_percentage, suggested_price_multiplier) VALUES (1, 1, 4, 0.0, 2.8)"))
                conn.execute(text("INSERT INTO volume_discounts (id, min_units, max_units, discount_percentage, suggested_price_multiplier) VALUES (2, 5, 9, 10.71, 2.5)"))
                conn.execute(text("INSERT INTO volume_discounts (id, min_units, max_units, discount_percentage, suggested_price_multiplier) VALUES (3, 10, 49, 21.43, 2.2)"))
                conn.execute(text("INSERT INTO volume_discounts (id, min_units, max_units, discount_percentage, suggested_price_multiplier) VALUES (4, 50, 9999, 28.57, 2.0)"))
                conn.commit()
        except Exception:
            pass
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

    # 3. Auto-sincronizar y reclasificar asientos de Flujo de Caja (Equipos a Activos Fijos 152005, Capital a Patrimonio 311505)
    try:
        from datetime import datetime
        from app.models.accounting import CashFlowRecord, JournalEntry
        from app.api.accounting import map_cashflow_to_puc

        cash_records = db_init.query(CashFlowRecord).all()
        for cf in cash_records:
            is_income = (cf.income or 0) > 0
            amount = cf.income if is_income else cf.credit
            if not amount or amount <= 0:
                continue

            target_puc, target_name = map_cashflow_to_puc(cf.category, cf.description, is_income)

            search_prefix = f"Flujo de Caja ({'Ingreso' if is_income else 'Egreso'}): {cf.description}"
            matching_entries = db_init.query(JournalEntry).filter(JournalEntry.description == search_prefix).all()

            if matching_entries:
                for e in matching_entries:
                    if is_income:
                        if e.credit > 0 and e.puc_code != target_puc:
                            e.puc_code = target_puc
                            e.account_name = target_name
                    else:
                        if e.debit > 0 and e.puc_code != target_puc:
                            e.puc_code = target_puc
                            e.account_name = target_name
            else:
                last_je = db_init.query(JournalEntry).order_by(JournalEntry.entry_number.desc()).first()
                next_num = (last_je.entry_number if last_je else 0) + 1
                entry_dt = cf.record_date or datetime.utcnow()
                if is_income:
                    db_init.add(JournalEntry(
                        entry_number=next_num,
                        entry_date=entry_dt,
                        puc_code="110505",
                        account_name="Caja General",
                        description=search_prefix,
                        debit=round(amount, 2),
                        credit=0.0
                    ))
                    db_init.add(JournalEntry(
                        entry_number=next_num,
                        entry_date=entry_dt,
                        puc_code=target_puc,
                        account_name=target_name,
                        description=search_prefix,
                        debit=0.0,
                        credit=round(amount, 2)
                    ))
                else:
                    db_init.add(JournalEntry(
                        entry_number=next_num,
                        entry_date=entry_dt,
                        puc_code=target_puc,
                        account_name=target_name,
                        description=search_prefix,
                        debit=round(amount, 2),
                        credit=0.0
                    ))
                    db_init.add(JournalEntry(
                        entry_number=next_num,
                        entry_date=entry_dt,
                        puc_code="110505",
                        account_name="Caja General",
                        description=search_prefix,
                        debit=0.0,
                        credit=round(amount, 2)
                    ))
        db_init.commit()
    except Exception as e:
        db_init.rollback()
    finally:
        db_init.close()
except Exception as e:
    pass

# Sincronización contable automática para insumos adicionales (Papelería y Mantenimiento)
try:
    from app.database import SessionLocal
    from app.api.inventory import sync_supplies_accounting
    with SessionLocal() as db_supp_sync:
        sync_supplies_accounting(db_supp_sync)
except Exception:
    pass

# 4. Sincronización e inicialización garantizada de usuario Administrador (admin / admin123)
try:
    from app.database import SessionLocal
    from app.models.auth import User
    from app.core.security import hash_password, verify_password
    from sqlalchemy import func

    with SessionLocal() as auth_db:
        admin_user = auth_db.query(User).filter(func.lower(User.username) == "admin").first()
        if not admin_user:
            initial_admin = User(
                username="admin",
                hashed_password=hash_password("admin123"),
                full_name="Administrador Prisma Lab",
                role="ADMIN",
                is_active=True,
                can_delete=True,
                can_edit=True,
                read_only=False,
                allowed_modules="dashboard,production,inventory,sales,accounting,config"
            )
            auth_db.add(initial_admin)
            auth_db.commit()
            print("[OK] Usuario administrador 'admin' inicializado (Clave: admin123).")
        else:
            needs_update = False
            if not admin_user.is_active:
                admin_user.is_active = True
                needs_update = True
            if admin_user.role != "ADMIN":
                admin_user.role = "ADMIN"
                needs_update = True
            if not admin_user.can_delete or not admin_user.can_edit or admin_user.read_only:
                admin_user.can_delete = True
                admin_user.can_edit = True
                admin_user.read_only = False
                needs_update = True
            if not admin_user.allowed_modules or "config" not in admin_user.allowed_modules:
                admin_user.allowed_modules = "dashboard,production,inventory,sales,accounting,config"
                needs_update = True
            if not verify_password("admin123", admin_user.hashed_password) and ":" not in (admin_user.hashed_password or ""):
                admin_user.hashed_password = hash_password("admin123")
                needs_update = True
            if needs_update:
                auth_db.commit()
except Exception as auth_err:
    print(f"[WARN] Error inicializando usuario admin: {auth_err}")

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
app.include_router(auth_router, prefix="/api")

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
    from app.database import SessionLocal, DEFAULT_DB_PATH
    from app.models.inventory import RawMaterial
    from app.models.accounting import JournalEntry
    db = SessionLocal()
    try:
        mat_count = db.query(RawMaterial).count()
        last_mat = db.query(RawMaterial).order_by(RawMaterial.id.desc()).first()
        entry_count = db.query(JournalEntry).count()
        last_entry = db.query(JournalEntry).order_by(JournalEntry.id.desc()).first()
        return {
            "status": "healthy",
            "backend_version": "v2.1.1",
            "database_file": DEFAULT_DB_PATH,
            "materials_count": mat_count,
            "last_material": {
                "id": last_mat.id,
                "code": last_mat.article_code,
                "name": last_mat.name,
                "created_at": str(last_mat.created_at)
            } if last_mat else None,
            "journal_entries_count": entry_count,
            "last_journal_entry": {
                "entry_number": last_entry.entry_number,
                "puc": last_entry.puc_code,
                "date": str(last_entry.entry_date),
                "description": last_entry.description
            } if last_entry else None
        }
    finally:
        db.close()
