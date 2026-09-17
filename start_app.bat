@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Prisma Lab ERP - Preparando Sistema
color 0B

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: ============================================================================
:: GESTION DE PARAMETROS (ACTUALIZAR SISTEMA)
:: ============================================================================
if /i "%~1"=="update" goto :DO_GIT_UPDATE
if /i "%~1"=="--update" goto :DO_GIT_UPDATE
if /i "%~1"=="-u" goto :DO_GIT_UPDATE
if /i "%~1"=="/update" goto :DO_GIT_UPDATE
if /i "%~1"=="pull" goto :DO_GIT_UPDATE
if /i "%~1"=="actualizar" goto :DO_GIT_UPDATE

:START_NORMAL
echo ===============================================================================
echo                PRISMA LAB ERP - SISTEMA INTEGRAL 3D
echo           Verificando Componentes y Preparando el Sistema...
echo ===============================================================================
echo.

:: ============================================================================
:: 1. VALIDACION Y AUTO-INSTALACION DE PYTHON
:: ============================================================================
echo [1/6] Verificando instalacion de Python...

call :REFRESH_PATH
call :DETECT_PYTHON
if "%PYTHON_EXE%"=="" goto :INSTALL_PYTHON
goto :PYTHON_READY

:INSTALL_PYTHON
echo       [!] Python no detectado en el equipo.
echo       [*] Iniciando instalacion automatica de Python 3.11...
echo       [*] Por favor espera unos minutos mientras se descarga y configura...

where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo       [*] Instalando mediante Windows Package Manager...
    winget install --exact --id Python.Python.3.11 --scope user --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
)

call :REFRESH_PATH
call :DETECT_PYTHON
if not "%PYTHON_EXE%"=="" goto :PYTHON_INSTALLED

echo       [*] Descargando instalador oficial de Python 3.11...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe', '%TEMP%\python_setup.exe')"
if exist "%TEMP%\python_setup.exe" (
    echo       [*] Ejecutando instalacion silenciosa de Python...
    "%TEMP%\python_setup.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    del "%TEMP%\python_setup.exe" >nul 2>&1
)

call :REFRESH_PATH
call :DETECT_PYTHON
if not "%PYTHON_EXE%"=="" goto :PYTHON_INSTALLED

echo.
echo ===============================================================================
echo [ERROR] No se pudo instalar Python automaticamente.
echo Por favor instala Python manualmente desde: https://www.python.org/downloads/
echo IMPORTANTE: Marca la casilla [X] "Add python.exe to PATH".
echo ===============================================================================
pause
exit /b 1

:PYTHON_INSTALLED
echo       [OK] Python instalado y configurado correctamente.

:PYTHON_READY
for /f "tokens=*" %%v in ('!PYTHON_EXE! -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"') do set PY_VER=%%v
echo       [OK] Python listo: version %PY_VER%

:: ============================================================================
:: 2. VALIDACION Y AUTO-INSTALACION DE NODE.JS Y NPM
:: ============================================================================
echo [2/6] Verificando instalacion de Node.js y npm...

call :REFRESH_PATH
call :DETECT_NODE
if "%NODE_EXE%"=="" goto :INSTALL_NODE
goto :NODE_READY

:INSTALL_NODE
echo       [!] Node.js no detectado en el equipo.
echo       [*] Iniciando instalacion automatica de Node.js LTS...
echo       [*] Por favor espera unos minutos mientras se descarga y configura...

where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo       [*] Instalando mediante Windows Package Manager...
    winget install --exact --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
)

call :REFRESH_PATH
call :DETECT_NODE
if not "%NODE_EXE%"=="" goto :NODE_INSTALLED

echo       [*] Descargando paquete oficial de Node.js LTS...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi', '%TEMP%\node_setup.msi')"
if exist "%TEMP%\node_setup.msi" (
    echo       [*] Ejecutando instalacion silenciosa de Node.js...
    msiexec /i "%TEMP%\node_setup.msi" /qn /norestart
    del "%TEMP%\node_setup.msi" >nul 2>&1
)

call :REFRESH_PATH
call :DETECT_NODE
if not "%NODE_EXE%"=="" goto :NODE_INSTALLED

echo.
echo ===============================================================================
echo [ERROR] No se pudo instalar Node.js automaticamente.
echo Por favor instala Node.js manualmente desde: https://nodejs.org/
echo ===============================================================================
pause
exit /b 1

:NODE_INSTALLED
echo       [OK] Node.js instalado y configurado correctamente.

:NODE_READY
for /f "tokens=*" %%v in ('!NODE_EXE! -v') do set NODE_VER=%%v
for /f "tokens=*" %%v in ('!NPM_CMD! -v') do set NPM_VER=%%v
echo       [OK] Node.js listo: %NODE_VER% - npm v%NPM_VER%

:: ============================================================================
:: 3. VALIDACION DE GIT
:: ============================================================================
echo [3/6] Verificando instalacion de Git...

where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do set GIT_VER=%%v
    echo       [OK] Git listo: !GIT_VER!
) else (
    echo       [AVISO] Git no detectado en el PATH.
    echo               Para recibir actualizaciones automáticas instala Git: https://git-scm.com/
)

:: ============================================================================
:: 4. VALIDACION DE ENTORNO VIRTUAL Y DEPENDENCIAS PYTHON (BACKEND)
:: ============================================================================
echo [4/6] Verificando entorno virtual y dependencias del Backend...

set "VENV_DIR=%ROOT_DIR%backend\venv"
set "VENV_PYTHON=%ROOT_DIR%backend\venv\Scripts\python.exe"
set "VENV_UVICORN=%ROOT_DIR%backend\venv\Scripts\uvicorn.exe"

if not exist "%VENV_PYTHON%" (
    echo       [*] Creando entorno virtual en backend\venv...
    !PYTHON_EXE! -m venv "%VENV_DIR%"
    if not exist "%VENV_PYTHON%" (
        echo [ERROR] No se pudo crear el entorno virtual en "%VENV_DIR%".
        pause
        exit /b 1
    )
)

if not exist "%VENV_UVICORN%" (
    echo       [*] Instalando dependencias de Python desde requirements.txt...
    echo       [*] Esto puede tardar 1 o 2 minutos. Espere por favor...
    "%VENV_DIR%\Scripts\pip" install -r "%ROOT_DIR%backend\requirements.txt"
    if !errorlevel! neq 0 (
        echo [ERROR] Hubo un problema al instalar las dependencias de Python.
        pause
        exit /b 1
    )
    echo       [OK] Dependencias de Python instaladas exitosamente.
) else (
    "%VENV_PYTHON%" -c "import jwt" >nul 2>&1
    if !errorlevel! neq 0 (
        echo       [*] Actualizando librerias de seguridad pyjwt...
        "%VENV_DIR%\Scripts\pip" install -r "%ROOT_DIR%backend\requirements.txt" --quiet
    )
    echo       [OK] Entorno virtual de Python listo y verificado.
)

:: ============================================================================
:: 5. VALIDACION DE DEPENDENCIAS DE NODE.JS (FRONTEND)
:: ============================================================================
echo [5/6] Verificando modulos del Frontend...

set "FRONTEND_VITE=%ROOT_DIR%frontend\node_modules\vite"

if not exist "%FRONTEND_VITE%" (
    echo       [*] Instalando paquetes de Node.js en frontend - npm install...
    echo       [*] Esto puede tardar un momento. Espere por favor...
    cd /d "%ROOT_DIR%frontend"
    cmd /c !NPM_CMD! install
    if !errorlevel! neq 0 (
        echo [ERROR] Hubo un problema ejecutando npm install en frontend.
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
:: 6. VALIDACION DE BASE DE DATOS Y MIGRACION
:: ============================================================================
echo [6/6] Verificando base de datos del sistema...

set "DB_FILE=%ROOT_DIR%prisma_lab.db"
set "BACKEND_DB=%ROOT_DIR%backend\prisma_lab.db"
set "BACKUP_DIR=%ROOT_DIR%backups"
set "EXCEL_FILE=%ROOT_DIR%Sistema_Integral_Produccion_ prisma lab(Recuperado automáticamente).xlsm"

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: Si la base esta en backend pero no en raiz, preservarla en raiz
if not exist "%DB_FILE%" (
    if exist "%BACKEND_DB%" (
        copy /Y "%BACKEND_DB%" "%DB_FILE%" >nul 2>&1
    ) else if exist "%BACKUP_DIR%\auto_backup_prisma_lab.db" (
        copy /Y "%BACKUP_DIR%\auto_backup_prisma_lab.db" "%DB_FILE%" >nul 2>&1
    )
)

:: Crear respaldo de seguridad automatico local cada vez que inicia
if exist "%DB_FILE%" (
    copy /Y "%DB_FILE%" "%BACKUP_DIR%\auto_backup_prisma_lab.db" >nul 2>&1
    goto :DB_EXISTS
)
if exist "%BACKEND_DB%" (
    copy /Y "%BACKEND_DB%" "%DB_FILE%" >nul 2>&1
    copy /Y "%BACKEND_DB%" "%BACKUP_DIR%\auto_backup_prisma_lab.db" >nul 2>&1
    goto :DB_EXISTS
)

if exist "%EXCEL_FILE%" (
    echo       [*] No se encontro base de datos previa pero se detecto archivo Excel.
    echo       [*] Importando catalogo, clientes y costos desde Excel a SQLite...
    "%VENV_PYTHON%" "%ROOT_DIR%backend\import_excel.py"
    echo       [OK] Base de datos SQLite inicializada exitosamente.
    goto :DB_DONE
)

echo       [!] No se encontro base de datos previa. Se creara una nueva al iniciar.
goto :DB_DONE

:DB_EXISTS
echo       [OK] Base de datos local SQLite verificada y respaldada en backups\.

:DB_DONE

:: ============================================================================
:: INICIAR PANEL DE CONTROL INTERACTIVO (LAUNCHER)
:: ============================================================================
echo.
echo [OK] Verificaciones completadas. Cargando Panel de Control...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%launcher.ps1"
set "PS_EXIT_CODE=%errorlevel%"
if %PS_EXIT_CODE% neq 0 (
    echo.
    echo ===============================================================================
    echo [ERROR] El panel de control finalizo inesperadamente con codigo: %PS_EXIT_CODE%
    echo Revisa el mensaje de error anterior.
    echo ===============================================================================
    pause
)
exit /b %PS_EXIT_CODE%

:: ============================================================================
:: RUTINA DE ACTUALIZACION DIRECTA DESDE GIT
:: ============================================================================
:DO_GIT_UPDATE
echo.
echo [*] Iniciando actualizacion de Prisma Lab desde Git...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%launcher.ps1" -Update
set "PS_EXIT_CODE=%errorlevel%"
if %PS_EXIT_CODE% neq 0 (
    echo.
    echo ===============================================================================
    echo [ERROR] La actualizacion finalizo con codigo: %PS_EXIT_CODE%
    echo ===============================================================================
    pause
)
exit /b %PS_EXIT_CODE%

:: ============================================================================
:: FUNCIONES AUXILIARES
:: ============================================================================

:REFRESH_PATH
for /f "tokens=*" %%p in ('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')" 2^>nul') do set "PATH=%%p;%PATH%"
set "PATH=%LocalAppData%\Programs\Python\Python311;%LocalAppData%\Programs\Python\Python311\Scripts;%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;C:\Program Files\Python311;C:\Program Files\Python311\Scripts;C:\Program Files\Python312;C:\Program Files\Python312\Scripts;C:\Program Files\nodejs;%AppData%\npm;%PATH%"
goto :eof

:DETECT_PYTHON
set "PYTHON_EXE="
where python >nul 2>&1
if %errorlevel% equ 0 (
    python -c "import sys; sys.exit(0 if sys.version_info.major == 3 and sys.version_info.minor >= 8 else 1)" >nul 2>&1
    if !errorlevel! equ 0 set "PYTHON_EXE=python"
)
if "%PYTHON_EXE%"=="" (
    where py >nul 2>&1
    if !errorlevel! equ 0 (
        py -c "import sys; sys.exit(0 if sys.version_info.major == 3 and sys.version_info.minor >= 8 else 1)" >nul 2>&1
        if !errorlevel! equ 0 set "PYTHON_EXE=py"
    )
)
if "%PYTHON_EXE%"=="" (
    if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
        set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python311\python.exe"
    ) else if exist "C:\Program Files\Python311\python.exe" (
        set "PYTHON_EXE=C:\Program Files\Python311\python.exe"
    )
)
goto :eof

:DETECT_NODE
set "NODE_EXE="
set "NPM_CMD=npm"
where node >nul 2>&1
if %errorlevel% equ 0 set "NODE_EXE=node"
where npm >nul 2>&1
if %errorlevel% equ 0 set "NPM_CMD=npm"

if "%NODE_EXE%"=="" (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
        set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
    )
)
goto :eof
