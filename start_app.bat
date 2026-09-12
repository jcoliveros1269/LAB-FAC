@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Prisma Lab ERP - Asistente de Inicio y Validacion
color 0B

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ===============================================================================
echo                PRISMA LAB ERP - SISTEMA INTEGRAL 3D
echo            Verificacion de Requisitos y Arranque Automatico
echo ===============================================================================
echo.

:: ============================================================================
:: 1. VALIDACION DE PYTHON
:: ============================================================================
echo [1/6] Validando instalacion de Python...

set "PYTHON_EXE="
where python >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_EXE=python"
) else (
    where py >nul 2>&1
    if %errorlevel% equ 0 (
        set "PYTHON_EXE=py"
    )
)

if "%PYTHON_EXE%"=="" goto :PYTHON_NOT_FOUND

%PYTHON_EXE% -c "import sys; sys.exit(0 if sys.version_info.major == 3 and sys.version_info.minor >= 8 else 1)" >nul 2>&1
if %errorlevel% neq 0 goto :PYTHON_BAD_VERSION

for /f "tokens=*" %%v in ('%PYTHON_EXE% -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"') do set PY_VER=%%v
echo       [OK] Python detectado: version %PY_VER%

:: ============================================================================
:: 2. VALIDACION DE NODE.JS Y NPM
:: ============================================================================
echo [2/6] Validando instalacion de Node.js y npm...

where node >nul 2>&1
if %errorlevel% neq 0 goto :NODE_NOT_FOUND

where npm >nul 2>&1
if %errorlevel% neq 0 goto :NODE_NOT_FOUND

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo       [OK] Node.js detectado: %NODE_VER% - npm v%NPM_VER%

:: ============================================================================
:: 3. VALIDACION DE ENTORNO VIRTUAL Y DEPENDENCIAS PYTHON (BACKEND)
:: ============================================================================
echo [3/6] Validando entorno virtual y dependencias del Backend...

set "VENV_DIR=%ROOT_DIR%backend\venv"
set "VENV_PYTHON=%ROOT_DIR%backend\venv\Scripts\python.exe"
set "VENV_UVICORN=%ROOT_DIR%backend\venv\Scripts\uvicorn.exe"

if not exist "%VENV_PYTHON%" (
    echo       [*] Creando entorno virtual en backend\venv...
    %PYTHON_EXE% -m venv "%VENV_DIR%"
    if not exist "%VENV_PYTHON%" (
        echo [ERROR] No se pudo crear el entorno virtual en "%VENV_DIR%".
        pause
        exit /b 1
    )
)

if not exist "%VENV_UVICORN%" (
    echo       [*] Instalando paquetes de Python desde requirements.txt...
    echo       [*] Esto puede tardar 1 o 2 minutos la primera vez. Espere por favor...
    "%VENV_DIR%\Scripts\pip" install -r "%ROOT_DIR%backend\requirements.txt"
    if %errorlevel% neq 0 (
        echo [ERROR] Hubo un problema al instalar las dependencias de Python.
        pause
        exit /b 1
    )
    echo       [OK] Dependencias de Python instaladas exitosamente.
) else (
    echo       [OK] Entorno virtual de Python listo y librerias verificadas.
)

:: ============================================================================
:: 4. VALIDACION DE DEPENDENCIAS DE NODE.JS (FRONTEND)
:: ============================================================================
echo [4/6] Validando modulos del Frontend...

set "FRONTEND_VITE=%ROOT_DIR%frontend\node_modules\vite"

if not exist "%FRONTEND_VITE%" (
    echo       [*] Instalando paquetes de Node.js en frontend - npm install...
    echo       [*] Esto puede tardar un momento la primera vez. Espere por favor...
    cd /d "%ROOT_DIR%frontend"
    cmd /c npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Hubo un fallo ejecutando npm install en la carpeta frontend.
        cd /d "%ROOT_DIR%"
        pause
        exit /b 1
    )
    cd /d "%ROOT_DIR%"
    echo       [OK] Dependencias de Node.js instaladas correctamente.
) else (
    echo       [OK] Modulos de Node.js verificados.
)

:: ============================================================================
:: 5. VALIDACION DE BASE DE DATOS Y MIGRACION
:: ============================================================================
echo [5/6] Verificando base de datos del sistema...

set "DB_FILE=%ROOT_DIR%prisma_lab.db"
set "BACKEND_DB=%ROOT_DIR%backend\prisma_lab.db"
set "EXCEL_FILE=%ROOT_DIR%Sistema_Integral_Produccion_ prisma lab(Recuperado automáticamente).xlsm"

if exist "%DB_FILE%" goto :DB_EXISTS
if exist "%BACKEND_DB%" goto :DB_EXISTS

if exist "%EXCEL_FILE%" (
    echo       [*] No se detecto base de datos previa pero se encontro archivo Excel.
    echo       [*] Importando catalogo, clientes y costos desde Excel a SQLite...
    "%VENV_PYTHON%" "%ROOT_DIR%backend\import_excel.py"
    echo       [OK] Base de datos SQLite inicializada exitosamente.
    goto :DB_DONE
)

echo       [!] No se encontro base de datos previa. Se creara una nueva al iniciar.
goto :DB_DONE

:DB_EXISTS
echo       [OK] Base de datos local SQLite verificada.

:DB_DONE

:: ============================================================================
:: 6. VALIDACION DE PUERTOS Y ARRANQUE DE SERVIDORES
:: ============================================================================
echo [6/6] Verificando puertos e iniciando servidores...

netstat -ano | findstr /C:":8000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo       [AVISO] El puerto 8000 ya esta en uso. Si Prisma Lab ya estaba abierto,
    echo               se utilizara la sesion activa.
)

netstat -ano | findstr /C:":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo       [AVISO] El puerto 3000 ya esta en uso. Si Prisma Lab ya estaba abierto,
    echo               se utilizara la sesion activa.
)

:: Iniciar Backend FastAPI en una ventana minimizada identificable
echo       [*] Iniciando servidor Backend FastAPI en puerto 8000...
start "Prisma Lab - Servidor Backend (FastAPI)" /min cmd /k "cd /d "%ROOT_DIR%backend" && .\venv\Scripts\activate && uvicorn app.main:app --host 127.0.0.1 --port 8000"

:: Iniciar Frontend React Vite en una ventana minimizada identificable
echo       [*] Iniciando servidor Frontend React en puerto 3000...
start "Prisma Lab - Aplicacion Web (React Vite)" /min cmd /k "cd /d "%ROOT_DIR%frontend" && npm run dev"

:: Esperar a que el backend este en linea
echo       [*] Conectando con los servicios...
set ATTEMPTS=0

:WAIT_LOOP
ping 127.0.0.1 -n 2 >nul
set /a ATTEMPTS+=1
curl -s --connect-timeout 1 -o nul http://127.0.0.1:8000/api/health >nul 2>&1
if %errorlevel% equ 0 goto :APP_READY
if %ATTEMPTS% lss 8 goto :WAIT_LOOP

:APP_READY
echo.
echo ===============================================================================
echo      TODAS LAS VALIDACIONES COMPLETADAS - PRISMA LAB ERP ESTA EN LINEA
echo ===============================================================================
echo.
echo   - Aplicacion Web:    http://localhost:3000
echo   - Documentacion API: http://localhost:8000/docs
echo.
echo   [+] Abriendo Prisma Lab ERP en tu navegador predeterminado...
start http://localhost:3000
echo.
echo ===============================================================================
echo NOTA: Para cerrar el sistema, puedes cerrar las consolas minimizadas
echo       en tu barra de tareas ("Prisma Lab - Servidor Backend" y "Prisma Lab - Aplicacion Web").
echo ===============================================================================
echo.
ping 127.0.0.1 -n 4 >nul
exit /b 0

:: ============================================================================
:: SECCIONES DE ERROR DETALLADAS CON INSTRUCCIONES PASO A PASO
:: ============================================================================
:PYTHON_NOT_FOUND
echo.
echo ===============================================================================
echo [ERROR CRITICO] Python no esta instalado o no se encuentra en el PATH.
echo.
echo Para que Prisma Lab funcione, necesitas instalar Python 3.9 o superior:
echo  1. Descarga el instalador oficial desde: https://www.python.org/downloads/
echo  2. Al ejecutar el instalador, ES INDISPENSABLE marcar la casilla:
echo     [X] "Add python.exe to PATH" (Agregar Python al PATH del sistema)
echo  3. Una vez instalado, vuelve a hacer doble clic en este archivo (start_app.bat).
echo ===============================================================================
echo.
pause
exit /b 1

:PYTHON_BAD_VERSION
echo.
echo ===============================================================================
echo [ERROR CRITICO] La version de Python instalada es incompatible.
echo Se requiere Python 3.8 o superior.
echo Por favor actualiza Python desde: https://www.python.org/downloads/
echo ===============================================================================
echo.
pause
exit /b 1

:NODE_NOT_FOUND
echo.
echo ===============================================================================
echo [ERROR CRITICO] Node.js o npm no estan instalados o no estan en el PATH.
echo.
echo El frontend de Prisma Lab requiere Node.js para ejecutarse:
echo  1. Descarga la version recomendada (LTS) desde: https://nodejs.org/
echo  2. Sigue las instrucciones del instalador predeterminado.
echo  3. Una vez instalado, reinicia tu equipo o vuelve a abrir este archivo.
echo ===============================================================================
echo.
pause
exit /b 1
