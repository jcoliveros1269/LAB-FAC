from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Determinar la ruta raíz del proyecto d:\LAB\prisma_lab.db
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__)) # d:\LAB\backend\app
BACKEND_DIR = os.path.dirname(CURRENT_DIR)               # d:\LAB\backend
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)              # d:\LAB

ROOT_DB = os.path.join(PROJECT_ROOT, "prisma_lab.db")
BACKEND_DB = os.path.join(BACKEND_DIR, "prisma_lab.db")

# Garantizar base de datos única y canónica en la raíz del proyecto
if not os.path.exists(ROOT_DB) and os.path.exists(BACKEND_DB):
    try:
        import shutil
        shutil.copy2(BACKEND_DB, ROOT_DB)
    except Exception:
        pass

DEFAULT_DB_PATH = ROOT_DB if os.path.exists(ROOT_DB) else (BACKEND_DB if os.path.exists(BACKEND_DB) else ROOT_DB)

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
