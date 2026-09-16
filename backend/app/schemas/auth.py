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
    can_delete: bool = True
    can_edit: bool = True
    read_only: bool = False
    allowed_modules: str = "dashboard,production,inventory,sales,accounting,config"
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

class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50, description="Nombre de usuario")
    password: str = Field(..., min_length=4, max_length=100, description="Contraseña inicial")
    full_name: str = Field(..., min_length=2, max_length=100, description="Nombre y apellido")
    role: str = Field("OPERATOR", description="Rol del usuario (ADMIN, OPERATOR, SELLER, CUSTOM)")
    is_active: bool = Field(True, description="Estado de la cuenta")
    can_delete: bool = Field(False, description="Permiso de eliminar registros")
    can_edit: bool = Field(True, description="Permiso de editar registros")
    read_only: bool = Field(False, description="Modo solo lectura")
    allowed_modules: str = Field("dashboard,production,inventory", description="Módulos autorizados separados por coma")

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[str] = None
    is_active: Optional[bool] = None
    can_delete: Optional[bool] = None
    can_edit: Optional[bool] = None
    read_only: Optional[bool] = None
    allowed_modules: Optional[str] = None
    password: Optional[str] = Field(None, min_length=4, max_length=100)

class UserAdminResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=4, max_length=100, description="Nueva contraseña asignada por el administrador")
