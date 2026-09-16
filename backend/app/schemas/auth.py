from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class UserLoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50, description="Nombre de usuario")
    password: str = Field(..., min_length=4, max_length=100, description="Contraseña")

class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=4, max_length=100)
    new_password: str = Field(..., min_length=4, max_length=100)
