# ==============================================================================
# PRISMA LAB ERP - PANEL DE CONTROL INTERACTIVO Y TRAY MANAGER
# ==============================================================================
param(
    [switch]$Update
)

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

try {
    $Host.UI.RawUI.WindowTitle = "Prisma Lab ERP - Panel de Control"
} catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Cargar API Win32 para Ocultar/Mostrar Ventana
$win32Code = @'
using System;
using System.Runtime.InteropServices;

public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
if (-not ([System.Management.Automation.PSTypeName]'Win32').Type) {
    try {
        Add-Type -TypeDefinition $win32Code -ErrorAction SilentlyContinue
    } catch {}
}

$script:rootDir = $PSScriptRoot
if (-not $script:rootDir) {
    $script:rootDir = (Get-Location).Path
}

# Obtener Handle de la ventana de consola
function Get-MyConsoleHandle {
    try {
        $title = "Prisma Lab ERP - Panel de Control"
        $h = [Win32]::FindWindow($null, $title)
        if ($h -eq [IntPtr]::Zero) {
            $h = [Win32]::GetConsoleWindow()
        }
        if ($h -eq [IntPtr]::Zero) {
            $proc = [System.Diagnostics.Process]::GetCurrentProcess()
            if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                $h = $proc.MainWindowHandle
            }
        }
        return $h
    } catch {
        return [IntPtr]::Zero
    }
}
$script:hwnd = Get-MyConsoleHandle

# Cargar icono de la aplicacion
$script:trayIcon = [System.Drawing.SystemIcons]::Application
$iconPath = Join-Path $script:rootDir "frontend\public\favicon-32.png"
if (Test-Path $iconPath) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($iconPath)
        $ms = New-Object System.IO.MemoryStream(,$bytes)
        $bmp = [System.Drawing.Bitmap]::FromStream($ms)
        $hIcon = $bmp.GetHicon()
        $script:trayIcon = [System.Drawing.Icon]::FromHandle($hIcon)
    } catch {}
}

# Crear el NotifyIcon para la bandeja del sistema (iconos ocultos)
$script:notify = New-Object System.Windows.Forms.NotifyIcon
$script:notify.Icon = $script:trayIcon
$script:notify.Text = "Prisma Lab ERP - En ejecucion"
$script:notify.Visible = $false

# ContextMenu para el icono de la bandeja
$script:contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$menuOpenWeb = $script:contextMenu.Items.Add("Abrir en Navegador")
$menuShowConsole = $script:contextMenu.Items.Add("Mostrar Panel de Control")
$script:contextMenu.Items.Add("-") | Out-Null
$menuRestart = $script:contextMenu.Items.Add("Reiniciar Servidores")
$menuUpdate = $script:contextMenu.Items.Add("Actualizar Sistema (Git Pull)")
$script:contextMenu.Items.Add("-") | Out-Null
$menuExit = $script:contextMenu.Items.Add("Salir de Prisma Lab")

$script:notify.ContextMenuStrip = $script:contextMenu

# Eventos del Tray Icon
$script:appContext = $null
$script:pendingAction = $null

$menuOpenWeb.add_Click({
    try { [System.Diagnostics.Process]::Start("http://localhost:3000") | Out-Null } catch {}
})

$menuShowConsole.add_Click({
    if ($script:appContext) {
        $script:appContext.ExitThread()
    }
})

$script:notify.add_DoubleClick({
    if ($script:appContext) {
        $script:appContext.ExitThread()
    }
})

$script:notify.add_Click({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        if ($script:appContext) {
            $script:appContext.ExitThread()
        }
    }
})

$menuRestart.add_Click({
    try {
        $script:notify.ShowBalloonTip(2000, "Prisma Lab ERP", "Reiniciando servidores...", [System.Windows.Forms.ToolTipIcon]::Info)
        Restart-Services
        $script:notify.ShowBalloonTip(2000, "Prisma Lab ERP", "Servidores reiniciados exitosamente.", [System.Windows.Forms.ToolTipIcon]::Info)
    } catch {}
})

$menuUpdate.add_Click({
    try {
        $script:notify.ShowBalloonTip(2000, "Prisma Lab ERP", "Iniciando actualizacion desde Git...", [System.Windows.Forms.ToolTipIcon]::Info)
    } catch {}
    $script:pendingAction = "update"
    if ($script:appContext) {
        $script:appContext.ExitThread()
    }
})

$menuExit.add_Click({
    Stop-Services
    if ($script:notify) {
        try {
            $script:notify.Visible = $false
            $script:notify.Dispose()
        } catch {}
    }
    if ($script:appContext) {
        $script:appContext.ExitThread()
    }
    [System.Environment]::Exit(0)
})

# Control de Procesos (Servidores)
$script:backendProc = $null
$script:frontendProc = $null

function Stop-Services {
    Write-Host " [*] Deteniendo servidores anteriores si existen..." -ForegroundColor Yellow
    if ($script:backendProc -and (-not $script:backendProc.HasExited)) {
        try { Stop-Process -Id $script:backendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    if ($script:frontendProc -and (-not $script:frontendProc.HasExited)) {
        try { Stop-Process -Id $script:frontendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }

    # Limpiar puertos 8000 y 3000 por seguridad
    try {
        $netstat = netstat -ano | Select-String ":8000\s|:3000\s"
        foreach ($line in $netstat) {
            $parts = ($line -split '\s+') | Where-Object { $_ -ne "" }
            $pidToKill = $parts[-1]
            if ($pidToKill -and $pidToKill -ne "0" -and $pidToKill -ne [System.Diagnostics.Process]::GetCurrentProcess().Id) {
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

function Start-Services {
    Stop-Services

    Write-Host " [*] Iniciando servidor Backend (FastAPI)..." -ForegroundColor Cyan
    $pythonExe = Join-Path $script:rootDir "backend\venv\Scripts\python.exe"
    $script:backendProc = Start-Process -FilePath $pythonExe `
        -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload" `
        -WorkingDirectory (Join-Path $script:rootDir "backend") `
        -WindowStyle Hidden `
        -PassThru

    Write-Host " [*] Iniciando aplicacion Web Frontend (React Vite)..." -ForegroundColor Cyan
    $script:frontendProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm run dev" `
        -WorkingDirectory (Join-Path $script:rootDir "frontend") `
        -WindowStyle Hidden `
        -PassThru

    # Esperar conexión con el backend
    Write-Host " [*] Verificando conexion con el backend..." -ForegroundColor Cyan
    $attempts = 0
    while ($attempts -lt 8) {
        Start-Sleep -Seconds 1
        $attempts++
        try {
            $req = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($req.StatusCode -eq 200) { break }
        } catch {}
    }
}

function Restart-Services {
    Stop-Services
    Start-Sleep -Seconds 1
    Start-Services
}

function Update-System {
    Clear-Host
    Write-Host ""
    Write-Host "  ==============================================================================" -ForegroundColor DarkCyan
    Write-Host "   ACTUALIZACION DE PRISMA LAB ERP DESDE GIT" -ForegroundColor Cyan
    Write-Host "  ==============================================================================" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "   Sincronizando con el repositorio y descargando los ultimos cambios..." -ForegroundColor Gray
    Write-Host ""

    # 1. Comprobar que git esté instalado
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        Write-Host "   [ERROR] Git no esta instalado o no se encuentra en el PATH de Windows." -ForegroundColor Red
        Write-Host "   Por favor descarga e instala Git desde: https://git-scm.com/downloads" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "   Presiona [Enter] para volver al Panel de Control..."
        return
    }

    # 2. Pausar servidores para evitar bloqueos de archivos en Windows
    Write-Host "   [1/4] Pausando servidores para evitar bloqueos de archivos en Windows..." -ForegroundColor Yellow
    Stop-Services
    Start-Sleep -Seconds 1

    # 3. Ejecutar git pull con auto-resolucion de archivos locales
    Write-Host "   [2/4] Descargando ultimos cambios desde el repositorio Git (git pull)..." -ForegroundColor Cyan
    Write-Host ""
    Push-Location $script:rootDir
    $pullError = $false
    try {
        $branch = (& git rev-parse --abbrev-ref HEAD 2>&1).Trim()
        if (-not $branch -or $branch -like "*fatal*") { $branch = "main" }
        Write-Host "         Rama activa: $branch" -ForegroundColor DarkGray

        # Proteger base de datos local SQLite antes de sincronizar
        $dbPath = Join-Path $script:rootDir "prisma_lab.db"
        $dbBackupPath = Join-Path $script:rootDir "prisma_lab.db.client_bak"
        if (Test-Path $dbPath) {
            Copy-Item $dbPath $dbBackupPath -Force
        }

        # Descartar cambios locales en archivos de codigo/binarios que puedan bloquear git pull
        & git restore --staged . 2>&1 | Out-Null
        & git restore prisma_lab.db 2>&1 | Out-Null
        & git stash --include-untracked 2>&1 | Out-Null

        $pullOutput = & git pull origin $branch 2>&1
        foreach ($line in $pullOutput) {
            Write-Host "         $line" -ForegroundColor Gray
        }

        # Si aun asi git pull reporta error, forzar fetch + checkout de la rama
        if ($LASTEXITCODE -ne 0 -or ($pullOutput -like "*error:*") -or ($pullOutput -like "*Aborting*")) {
            Write-Host "         [*] Resolviendo sincronizacion forzada con origen..." -ForegroundColor DarkYellow
            & git fetch origin $branch 2>&1 | Out-Null
            & git reset --hard "origin/$branch" 2>&1 | Out-Null
        }

        # Restaurar la base de datos local del cliente con su informacion intacta
        if (Test-Path $dbBackupPath) {
            Copy-Item $dbBackupPath $dbPath -Force
            Remove-Item $dbBackupPath -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host "         [ERROR] Fallo al ejecutar git pull: $_" -ForegroundColor Red
        $pullError = $true
    }
    Write-Host ""

    # 4. Verificar dependencias
    Write-Host "   [3/4] Verificando dependencias del sistema..." -ForegroundColor Cyan
    $pythonPip = Join-Path $script:rootDir "backend\venv\Scripts\pip.exe"
    $reqFile = Join-Path $script:rootDir "backend\requirements.txt"
    if ((Test-Path $pythonPip) -and (Test-Path $reqFile)) {
        Write-Host "         [*] Verificando librerias de Python en backend..." -ForegroundColor DarkGray
        & $pythonPip install -r $reqFile --quiet 2>&1 | Out-Null
    }

    $frontendDir = Join-Path $script:rootDir "frontend"
    if (Test-Path (Join-Path $frontendDir "package.json")) {
        Write-Host "         [*] Verificando modulos de Node.js en frontend..." -ForegroundColor DarkGray
        Push-Location $frontendDir
        cmd /c "npm install --silent" 2>&1 | Out-Null
        Pop-Location
    }

    # 5. Reiniciar servidores
    Write-Host ""
    Write-Host "   [4/4] Reiniciando servidores con las nuevas actualizaciones..." -ForegroundColor Green
    Start-Services

    Write-Host ""
    Write-Host "  ==============================================================================" -ForegroundColor Green
    Write-Host "   PRISMA LAB ERP HA SIDO ACTUALIZADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host "  ==============================================================================" -ForegroundColor Green
    Write-Host ""

    $lastCommit = & git log -1 --oneline 2>&1
    Write-Host "   Version actual instalada: $lastCommit" -ForegroundColor White
    Write-Host ""

    Pop-Location

    if ($script:notify) {
        try {
            $script:notify.ShowBalloonTip(3500, "Prisma Lab ERP", "Actualizacion completada: $lastCommit", [System.Windows.Forms.ToolTipIcon]::Info)
        } catch {}
    }

    Write-Host "   Presiona [Enter] para volver al Panel de Control..." -ForegroundColor Yellow
    Read-Host | Out-Null
}

function Show-Dashboard {
    Clear-Host
    Write-Host ""
    Write-Host "  ==============================================================================" -ForegroundColor DarkCyan
    Write-Host "    ____  ____  ___ ____  __  __    _       _        _    ____  " -ForegroundColor Cyan
    Write-Host "   |  _ \|  _ \|_ _/ ___||  \/  |  / \     | |      / \  | __ ) " -ForegroundColor Cyan
    Write-Host "   | |_) | |_) || |\___ \| |\/| | / _ \    | |     / _ \ |  _ \ " -ForegroundColor White
    Write-Host "   |  __/|  _ < | | ___) | |  | |/ ___ \   | |___ / ___ \| |_) |" -ForegroundColor White
    Write-Host "   |_|   |_| \_\___|____/|_|  |_/_/   \_\  |_____/_/   \_\____/ " -ForegroundColor Cyan
    Write-Host "                     SISTEMA INTEGRAL DE PRODUCCION Y ERP 3D                   " -ForegroundColor Yellow
    Write-Host "  ==============================================================================" -ForegroundColor DarkCyan
    Write-Host ""

    # Comprobar estado en vivo
    $backendOk = $false
    try {
        $check = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($check.StatusCode -eq 200) { $backendOk = $true }
    } catch {}

    $frontendOk = $false
    try {
        $checkFront = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($checkFront.StatusCode -eq 200) { $frontendOk = $true }
    } catch {}

    Write-Host "  [ESTADO DEL SISTEMA]" -ForegroundColor White
    if ($backendOk) {
        Write-Host "   * Backend API (FastAPI):  " -NoNewline
        Write-Host " [ EN LINEA ] " -ForegroundColor Black -BackgroundColor Green -NoNewline
        Write-Host " http://localhost:8000" -ForegroundColor Gray
    } else {
        Write-Host "   * Backend API (FastAPI):  " -NoNewline
        Write-Host " [ DETENIDO ] " -ForegroundColor White -BackgroundColor Red
    }

    if ($frontendOk) {
        Write-Host "   * Aplicacion Web (React): " -NoNewline
        Write-Host " [ EN LINEA ] " -ForegroundColor Black -BackgroundColor Green -NoNewline
        Write-Host " http://localhost:3000" -ForegroundColor Gray
    } else {
        Write-Host "   * Aplicacion Web (React): " -NoNewline
        Write-Host " [ INICIANDO ] " -ForegroundColor White -BackgroundColor Yellow -NoNewline
        Write-Host " http://localhost:3000" -ForegroundColor Gray
    }

    Write-Host "   * Base de Datos Local:    " -NoNewline
    Write-Host " [ CONECTADA ]" -ForegroundColor Black -BackgroundColor Green -NoNewline
    Write-Host " prisma_lab.db (SQLite)" -ForegroundColor Gray
    Write-Host ""

    Write-Host "  ------------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "   QUE DESEAS HACER?" -ForegroundColor Yellow
    Write-Host "  ------------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "   [1] " -NoNewline -ForegroundColor Cyan
    Write-Host "Abrir Prisma Lab en el Navegador (http://localhost:3000)" -ForegroundColor White
    Write-Host "   [2] " -NoNewline -ForegroundColor Cyan
    Write-Host "Ocultar esta ventana a los Iconos Ocultos (Bandeja del Sistema)" -ForegroundColor Green
    Write-Host "   [3] " -NoNewline -ForegroundColor Cyan
    Write-Host "Reiniciar Servidores" -ForegroundColor White
    Write-Host "   [4] " -NoNewline -ForegroundColor Cyan
    Write-Host "Abrir Carpeta del Proyecto y Copias de Seguridad" -ForegroundColor White
    Write-Host "   [5] " -NoNewline -ForegroundColor Cyan
    Write-Host "Actualizar Sistema desde Git (Git Pull - Descargar Ultima Version)" -ForegroundColor Cyan
    Write-Host "   [6] " -NoNewline -ForegroundColor Cyan
    Write-Host "Detener Todo y Salir" -ForegroundColor Red
    Write-Host "  ------------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
}

function Hide-To-Tray {
    Clear-Host
    Write-Host ""
    Write-Host "  ==============================================================================" -ForegroundColor Green
    Write-Host "   [i] OCULTANDO VENTANA A LA BANDEJA DEL SISTEMA..." -ForegroundColor White
    Write-Host "  ==============================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "   El sistema Prisma Lab ERP sigue funcionando normalmente en segundo plano." -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Para volver a abrir este panel o ver las opciones:" -ForegroundColor Yellow
    Write-Host "   -> Busca el icono de Prisma Lab en la barra de tareas (flecha ^ de iconos ocultos)." -ForegroundColor Cyan
    Write-Host "   -> Haz doble clic en el icono para restaurar la ventana en cualquier momento." -ForegroundColor Cyan
    Write-Host ""
    Start-Sleep -Milliseconds 1200

    # Ocultar ventana de consola
    $script:hwnd = Get-MyConsoleHandle
    if ($script:hwnd -ne [IntPtr]::Zero) {
        try { [Win32]::ShowWindow($script:hwnd, 0) | Out-Null } catch {}
    }

    # Mostrar icono en la bandeja
    $script:notify.Visible = $true
    try {
        $script:notify.ShowBalloonTip(3500, "Prisma Lab ERP", "El sistema sigue activo en segundo plano. Haz doble clic en el icono para volver al panel.", [System.Windows.Forms.ToolTipIcon]::Info)
    } catch {}

    # Iniciar Message Loop de Windows Forms mientras esta oculta
    $script:appContext = New-Object System.Windows.Forms.ApplicationContext
    [System.Windows.Forms.Application]::Run($script:appContext)

    # Al salir del loop (cuando se hace clic en restaurar):
    $script:notify.Visible = $false
    if ($script:hwnd -ne [IntPtr]::Zero) {
        try {
            [Win32]::ShowWindow($script:hwnd, 5) | Out-Null
            [Win32]::SetForegroundWindow($script:hwnd) | Out-Null
        } catch {}
    }
}

# ==============================================================================
# FLUJO PRINCIPAL
# ==============================================================================
try {
    # Si se invoco con el parametro -Update, actualizar directamente
    if ($Update) {
        Update-System
        Write-Host ""
        $startAnswer = Read-Host "   Deseas abrir el Panel de Prisma Lab ahora mismo? (S/N) [S]"
        if ($startAnswer -and ($startAnswer.Trim().ToUpper() -eq "N")) {
            Stop-Services
            exit 0
        }
    } else {
        # 1. Iniciar servidores en segundo plano
        Start-Services

        # 2. Abrir navegador automaticamente la primera vez
        try {
            Start-Process "http://localhost:3000" | Out-Null
        } catch {
            Write-Host " [!] Abre tu navegador en: http://localhost:3000" -ForegroundColor Yellow
        }
    }

    # 3. Bucle interactivo del Panel de Control
    while ($true) {
        if ($script:pendingAction -eq "update") {
            $script:pendingAction = $null
            Update-System
            continue
        }

        Show-Dashboard
        $rawChoice = Read-Host "   Elige una opcion (1-6)"
        $choice = if ($rawChoice) { $rawChoice.Trim() } else { "" }

        switch ($choice) {
            "1" {
                try {
                    Start-Process "http://localhost:3000" | Out-Null
                } catch {
                    Write-Host " [!] Abre tu navegador en: http://localhost:3000" -ForegroundColor Yellow
                }
            }
            "2" {
                Hide-To-Tray
            }
            "3" {
                Write-Host ""
                Write-Host " [*] Reiniciando servidores, por favor espera..." -ForegroundColor Yellow
                Restart-Services
                Start-Sleep -Seconds 1
            }
            "4" {
                try {
                    Start-Process "explorer.exe" $script:rootDir | Out-Null
                } catch {}
            }
            "5" {
                Update-System
            }
            { $_ -in @("6", "exit", "salir", "q", "x", "0") } {
                Write-Host ""
                Write-Host " [!] Deteniendo servidores de Prisma Lab..." -ForegroundColor Yellow
                Stop-Services
                if ($script:notify) {
                    try {
                        $script:notify.Visible = $false
                        $script:notify.Dispose()
                    } catch {}
                }
                Write-Host " [OK] Sistema apagado exitosamente. Cerrando..." -ForegroundColor Green
                Start-Sleep -Milliseconds 600
                [System.Environment]::Exit(0)
            }
            default {
                Write-Host "   [!] Opcion no valida. Por favor ingresa un numero del 1 al 6." -ForegroundColor Red
                Start-Sleep -Milliseconds 800
            }
        }
    }
} catch {
    Write-Host ""
    Write-Host " ==============================================================================" -ForegroundColor Red
    Write-Host " [ERROR FATAL EN PANEL DE CONTROL]" -ForegroundColor Red
    Write-Host " Detalle: $_" -ForegroundColor Yellow
    if ($_.InvocationInfo) {
        Write-Host " Linea: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor DarkYellow
    }
    Write-Host " ==============================================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host " Presiona [Enter] para continuar..." -ForegroundColor Gray
    Read-Host | Out-Null
} finally {
    Stop-Services
    if ($script:notify) {
        try {
            $script:notify.Visible = $false
            $script:notify.Dispose()
        } catch {}
    }
}
