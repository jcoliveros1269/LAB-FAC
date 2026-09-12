from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Determinar la ruta raíz del proyecto d:\LAB\prisma_lab.db
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__)) # d:\LAB\backend\app
BACKEND_DIR = os.path.dirname(CURRENT_DIR)               # d:\LAB\backend
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)              # d:\LAB

DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "prisma_lab.db")
# Fallback si por alguna razón no existe en la raíz
if not os.path.exists(DEFAULT_DB_PATH) and os.path.exists(os.path.join(BACKEND_DIR, "prisma_lab.db")):
    DEFAULT_DB_PATH = os.path.join(BACKEND_DIR, "prisma_lab.db")

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
