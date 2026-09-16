from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
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
    permissions_matrix = Column(Text, nullable=True) # JSON con matriz por módulo: {module: {read, write, delete}}

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String(50), nullable=False, index=True)
    module = Column(String(30), nullable=False, index=True)
    action = Column(String(20), nullable=False, index=True) # CREATE, UPDATE, DELETE, LOGIN, PASSWORD_RESET
    description = Column(Text, nullable=False)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<AuditLog(id={self.id}, user='{self.username}', action='{self.action}', module='{self.module}')>"
