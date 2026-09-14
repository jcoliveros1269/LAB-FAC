#!/usr/bin/env bash

echo "======================================================================="
echo "         PRISMA LAB ERP - SISTEMA INTEGRAL DE PRODUCCIÓN 3D"
echo "======================================================================="
echo ""

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Manejo de actualización desde Git
if [ "$1" == "update" ] || [ "$1" == "--update" ] || [ "$1" == "-u" ] || [ "$1" == "actualizar" ]; then
    echo "======================================================================="
    echo "       PRISMA LAB ERP - ACTUALIZACIÓN DESDE GIT"
    echo "======================================================================="
    git pull origin main
    if [ -f "$ROOT_DIR/backend/requirements.txt" ] && [ -d "$ROOT_DIR/backend/venv" ]; then
        echo "[*] Actualizando dependencias de Python..."
        "$ROOT_DIR/backend/venv/bin/pip" install -r "$ROOT_DIR/backend/requirements.txt" --quiet
    fi
    if [ -f "$ROOT_DIR/frontend/package.json" ]; then
        echo "[*] Actualizando paquetes de Node.js..."
        (cd "$ROOT_DIR/frontend" && npm install --silent)
    fi
    echo ""
    echo "[OK] ¡Actualización completada exitosamente!"
    read -p "¿Deseas iniciar Prisma Lab ahora? (s/n) [s]: " start_choice
    if [ "$start_choice" == "n" ] || [ "$start_choice" == "N" ]; then
        exit 0
    fi
fi

# 1. Verificar Entorno Virtual de Python Backend
if [ ! -d "$ROOT_DIR/backend/venv" ]; then
    echo "[+] Creando entorno virtual de Python..."
    python3 -m venv "$ROOT_DIR/backend/venv"
    echo "[+] Instalando dependencias desde requirements.txt..."
    "$ROOT_DIR/backend/venv/bin/pip" install -r "$ROOT_DIR/backend/requirements.txt"
else
    echo "[OK] Entorno virtual de Python listo."
fi

# 2. Verificar dependencias de Node.js Frontend
if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo "[+] Instalando dependencias de Node.js..."
    cd "$ROOT_DIR/frontend" && npm install
    cd "$ROOT_DIR"
else
    echo "[OK] Dependencias de Node.js listas."
fi

echo ""
echo "[+] Iniciando Backend FastAPI en http://localhost:8000..."
(cd "$ROOT_DIR/backend" && source venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &

echo "[+] Iniciando Frontend React Vite en http://localhost:3000..."
(cd "$ROOT_DIR/frontend" && npm run dev) &

sleep 3

echo "[OK] Abriendo navegador..."
if command -v open > /dev/null; then
    open http://localhost:3000
elif command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3000
fi

echo "======================================================================="
echo "¡Prisma Lab ERP está ejecutándose!"
echo "Backend API Docs: http://localhost:8000/docs"
echo "Web App URL:      http://localhost:3000"
echo "======================================================================="
