from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)

class DocumentType(Base):
    """COTIZACION o FACTURA"""
    __tablename__ = "sales_documents"

    id = Column(Integer, primary_key=True, index=True)
    doc_number = Column(String, unique=True, index=True, nullable=False) # ej: COT-001, FAC-001
    doc_type = Column(String, nullable=False) # COTIZACION, FACTURA
    created_at = Column(DateTime, default=datetime.utcnow)
    
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    customer = relationship("Customer")
    
    subtotal = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    tax = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    status = Column(String, default="DRAFT") # DRAFT, QUOTED, INVOICED, PAID, CANCELLED
    is_internal_use = Column(Boolean, default=False)

    items = relationship("SalesDocumentItem", backref="document", cascade="all, delete-orphan", lazy="joined")

class SalesDocumentItem(Base):
    __tablename__ = "sales_document_items"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("sales_documents.id"), nullable=False)
    product_name = Column(String, nullable=False)
    quantity = Column(Integer, default=1)
    unit_grams = Column(Float, default=0.0)
    print_hours = Column(Float, default=0.0)
    unit_cost = Column(Float, default=0.0)
    unit_price = Column(Float, default=0.0)
    total_price = Column(Float, default=0.0)
