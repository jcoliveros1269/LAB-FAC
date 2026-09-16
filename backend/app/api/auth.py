from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.auth import User
from app.schemas.auth import UserLoginRequest, UserResponse, TokenResponse, ChangePasswordRequest
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
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
                is_active=True
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
