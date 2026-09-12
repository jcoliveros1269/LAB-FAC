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
