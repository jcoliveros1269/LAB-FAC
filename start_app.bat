@echo off
title Prisma Lab ERP - Script de Inicio 1-Clic
color 0A

echo =======================================================================
echo          PRISMA LAB ERP - SISTEMA INTEGRAL DE PRODUCCION 3D
echo =======================================================================
echo.

set ROOT_DIR=%~dp0

:: 1. Verificar Entorno Virtual de Python Backend
if not exist "%ROOT_DIR%backend\venv" (
    echo [+] Creando entorno virtual de Python en backend\venv...
    python -m venv "%ROOT_DIR%backend\venv"
    echo [+] Instalando dependencias de Python desde requirements.txt...
    "%ROOT_DIR%backend\venv\Scripts\pip" install -r "%ROOT_DIR%backend\requirements.txt"
) else (
    echo [OK] Entorno virtual de Python listo.
)

:: 2. Verificar dependencias de Node.js Frontend
if not exist "%ROOT_DIR%frontend\node_modules" (
    echo [+] Instalando dependencias de Node.js en frontend...
    cd /d "%ROOT_DIR%frontend"
    cmd /c npm install
    cd /d "%ROOT_DIR%"
) else (
    echo [OK] Dependencias de Node.js listas.
)

echo.
echo [+] Levantando Servidor Backend (FastAPI en http://localhost:8000)...
start "Prisma Lab - API Backend (FastAPI)" cmd /k "cd /d %ROOT_DIR%backend && .\venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo [+] Levantando Servidor Frontend (React Vite en http://localhost:3000)...
start "Prisma Lab - Web App (React Vite)" cmd /k "cd /d %ROOT_DIR%frontend && npm run dev"

echo.
echo [+] Esperando 3 segundos a que los servidores inicien...
timeout /t 3 /nobreak >nul

echo [OK] Abriendo aplicacion en el navegador predeterminado...
start http://localhost:3000

echo.
echo =======================================================================
echo ¡Prisma Lab ERP esta corriendo exitosamente!
echo Backend API Docs: http://localhost:8000/docs
echo Web App URL:      http://localhost:3000
echo =======================================================================
