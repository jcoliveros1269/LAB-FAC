from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.models.auth import User
from app.schemas.auth import (
    UserLoginRequest, UserResponse, TokenResponse, ChangePasswordRequest,
    UserCreateRequest, UserUpdateRequest, UserAdminResetPasswordRequest
)
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_role
)

router = APIRouter(prefix="/auth", tags=["Autenticación"])

@router.post("/login", response_model=TokenResponse)
def login(request: UserLoginRequest, db: Session = Depends(get_db)):
    """
    Inicia sesión validando credenciales y entrega un token JWT con los datos del usuario y rol.
    """
    clean_username = (request.username or "").strip()
    raw_password = request.password or ""
    clean_password = raw_password.strip()

    # Buscar usuario de forma case-insensitive y sin espacios
    user = db.query(User).filter(func.lower(User.username) == clean_username.lower()).first()

    # Bootstrap / Auto-reparación para admin / admin123
    if clean_username.lower() == "admin" and (raw_password == "admin123" or clean_password == "admin123"):
        if not user:
            user = User(
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
            db.add(user)
            db.commit()
            db.refresh(user)
        elif not verify_password(raw_password, user.hashed_password) and not verify_password(clean_password, user.hashed_password):
            user.hashed_password = hash_password("admin123")
            user.is_active = True
            db.commit()
            db.refresh(user)

    password_valid = False
    if user and user.hashed_password:
        if verify_password(raw_password, user.hashed_password) or verify_password(clean_password, user.hashed_password):
            password_valid = True

    if not user or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta de usuario está desactivada. Contacte al administrador.",
        )

    # Generar token JWT con el username y rol
    token_data = {
        "sub": user.username,
        "role": user.role,
        "name": user.full_name
    }
    access_token = create_access_token(token_data)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """
    Devuelve los datos del usuario actualmente autenticado según su Bearer Token.
    """
    return UserResponse.model_validate(current_user)

@router.post("/change-password")
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Permite al usuario autenticado cambiar su contraseña propia.
    """
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta",
        )

    if len(request.new_password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 4 caracteres",
        )

    current_user.hashed_password = hash_password(request.new_password)
    db.commit()

    return {"message": "Contraseña actualizada exitosamente"}

# ============================================================================
# ENDPOINTS ADMINISTRATIVOS DE GESTIÓN DE USUARIOS (Solo ADMIN)
# ============================================================================

@router.get("/users", response_model=List[UserResponse])
def get_all_users(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role(["ADMIN"]))
):
    """
    Listado administrativo de todos los usuarios registrados en el sistema.
    """
    return db.query(User).order_by(User.id.asc()).all()

@router.post("/users", response_model=UserResponse)
def create_user(
    request: UserCreateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role(["ADMIN"]))
):
    """
    Crea un nuevo usuario con rol y permisos asignados por el administrador.
    """
    clean_username = request.username.strip().lower()
    existing = db.query(User).filter(func.lower(User.username) == clean_username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El nombre de usuario '{request.username}' ya está registrado."
        )

    role = request.role.upper() if request.role else "OPERATOR"
    can_delete = request.can_delete if role != "ADMIN" else True
    can_edit = request.can_edit if role != "ADMIN" else True
    read_only = request.read_only if role != "ADMIN" else False
    allowed_modules = request.allowed_modules or "dashboard,production,inventory"
    if role == "ADMIN":
        allowed_modules = "dashboard,production,inventory,sales,accounting,config"

    new_user = User(
        username=clean_username,
        hashed_password=hash_password(request.password),
        full_name=request.full_name.strip(),
        role=role,
        is_active=request.is_active,
        can_delete=can_delete,
        can_edit=can_edit,
        read_only=read_only,
        allowed_modules=allowed_modules
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    request: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role(["ADMIN"]))
):
    """
    Actualiza datos, rol y permisos granulares de un usuario.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    is_primary_admin = (user.username.lower() == "admin")

    if request.full_name is not None:
        user.full_name = request.full_name.strip()
    
    if request.role is not None:
        if is_primary_admin and request.role.upper() != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede degradar el rol del usuario administrador principal 'admin'."
            )
        user.role = request.role.upper()

    if request.is_active is not None:
        if is_primary_admin and not request.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede desactivar la cuenta del administrador principal 'admin'."
            )
        user.is_active = request.is_active

    if request.can_delete is not None:
        user.can_delete = True if user.role == "ADMIN" else request.can_delete

    if request.can_edit is not None:
        user.can_edit = True if user.role == "ADMIN" else request.can_edit

    if request.read_only is not None:
        user.read_only = False if user.role == "ADMIN" else request.read_only

    if request.allowed_modules is not None:
        user.allowed_modules = "dashboard,production,inventory,sales,accounting,config" if user.role == "ADMIN" else request.allowed_modules

    if request.password:
        if len(request.password) < 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La contraseña debe tener al menos 4 caracteres"
            )
        user.hashed_password = hash_password(request.password)

    db.commit()
    db.refresh(user)
    return user

@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    request: UserAdminResetPasswordRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role(["ADMIN"]))
):
    """
    El administrador restablece la contraseña de cualquier usuario directamente.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    user.hashed_password = hash_password(request.new_password)
    db.commit()
    return {"message": f"Contraseña del usuario '{user.username}' actualizada exitosamente."}

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role(["ADMIN"]))
):
    """
    Elimina un usuario del sistema (no permitido para la cuenta admin principal ni para uno mismo).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    if user.username.lower() == "admin" or user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar la cuenta del administrador principal ni tu propia cuenta activa."
        )

    db.delete(user)
    db.commit()
    return {"message": f"Usuario '{user.username}' eliminado correctamente."}
