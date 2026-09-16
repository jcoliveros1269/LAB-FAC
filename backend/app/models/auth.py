from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(String(20), default="OPERATOR", nullable=False) # ADMIN, OPERATOR, SELLER, CUSTOM
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Permisos Granulares
    can_delete = Column(Boolean, default=True, nullable=False)
    can_edit = Column(Boolean, default=True, nullable=False)
    read_only = Column(Boolean, default=False, nullable=False)
    allowed_modules = Column(String(255), default="dashboard,production,inventory,sales,accounting,config", nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"
