# ==============================================================================
# PRISMA LAB ERP - PANEL DE CONTROL INTERACTIVO Y TRAY MANAGER
# ==============================================================================
param(
    [switch]$Update
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Prisma Lab ERP - Panel de Control"

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
    Add-Type -TypeDefinition $win32Code
}

$script:rootDir = $PSScriptRoot
if (-not $script:rootDir) {
    $script:rootDir = (Get-Location).Path
}

# Obtener Handle de la ventana de consola
function Get-MyConsoleHandle {
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
}
$script:hwnd = Get-MyConsoleHandle

# Cargar icono de la aplicacion
$script:trayIcon = [System.Drawing.SystemIcons]::Application
$iconPath = Join-Path $script:rootDir "frontend\public\favicon-32.png"
if (Test-Path $iconPath) {
    try {
        $bmp = [System.Drawing.Bitmap]::FromFile($iconPath)
        $hIcon = $bmp.GetHicon()
        $script:trayIcon = [System.Drawing.Icon]::FromHandle($hIcon)
    } catch {}
}

# Crear el NotifyIcon para la bandeja del sistema (iconos ocultos)
$script:notify = New-Object System.Windows.Forms.NotifyIcon
$script:notify.Icon = $script:trayIcon
$script:notify.Text = "Prisma Lab ERP - En ejecución"
$script:notify.Visible = $false

# ContextMenu para el icono de la bandeja
$script:contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$menuOpenWeb = $script:contextMenu.Items.Add("🌐 Abrir en Navegador")
$menuShowConsole = $script:contextMenu.Items.Add("🖥️ Mostrar Panel de Control")
$script:contextMenu.Items.Add("-") | Out-Null
$menuRestart = $script:contextMenu.Items.Add("🔄 Reiniciar Servidores")
$menuUpdate = $script:contextMenu.Items.Add("📥 Actualizar Sistema (Git Pull)")
$script:contextMenu.Items.Add("-") | Out-Null
$menuExit = $script:contextMenu.Items.Add("🛑 Salir de Prisma Lab")

$script:notify.ContextMenuStrip = $script:contextMenu

# Eventos del Tray Icon
$script:appContext = $null
$script:pendingAction = $null

$menuOpenWeb.add_Click({
    [System.Diagnostics.Process]::Start("http://localhost:3000") | Out-Null
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
    $script:notify.ShowBalloonTip(2000, "Prisma Lab ERP", "Reiniciando servidores...", [System.Windows.Forms.ToolTipIcon]::Info)
    Restart-Services
    $script:notify.ShowBalloonTip(2000, "Prisma Lab ERP", "Servidores reiniciados exitosamente.", [System.Windows.Forms.ToolTipIcon]::Info)
})

$menuUpdate.add_Click({
    $script:notify.ShowBalloonTip(2000, "Prisma Lab ERP", "Iniciando actualización desde Git...", [System.Windows.Forms.ToolTipIcon]::Info)
    $script:pendingAction = "update"
    if ($script:appContext) {
        $script:appContext.ExitThread()
    }
})

$menuExit.add_Click({
    Stop-Services
    if ($script:notify) {
        $script:notify.Visible = $false
        $script:notify.Dispose()
    }
    if ($script:appContext) {
        $script:appContext.ExitThread()
    }
    [System.Environment]::Exit(0)
})

# Control de Procesos (Servidores)
$script:backendProc = $null
$script:frontendProc = $null

function Start-Services {
    Write-Host " [*] Iniciando servidor Backend (FastAPI)..." -ForegroundColor Cyan
    $pythonExe = Join-Path $script:rootDir "backend\venv\Scripts\python.exe"
    $script:backendProc = Start-Process -FilePath $pythonExe `
        -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" `
        -WorkingDirectory (Join-Path $script:rootDir "backend") `
        -WindowStyle Hidden `
        -PassThru

    Write-Host " [*] Iniciando aplicacion Web Frontend (React Vite)..." -ForegroundColor Cyan
    $script:frontendProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm run dev" `
        -WorkingDirectory (Join-Path $script:rootDir "frontend") `
        -WindowStyle Hidden `
        -PassThru

    # Esperar conexión
    Write-Host " [*] Verificando conexion..." -ForegroundColor Cyan
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

function Stop-Services {
    Write-Host " [*] Deteniendo servidores..." -ForegroundColor Yellow
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

function Restart-Services {
    Stop-Services
    Start-Sleep -Seconds 1
    Start-Services
}

function Update-System {
    Clear-Host
    Write-Host ""
    Write-Host "  ==============================================================================" -ForegroundColor DarkCyan
    Write-Host "   📥 ACTUALIZACIÓN DE PRISMA LAB ERP DESDE GIT" -ForegroundColor Cyan
    Write-Host "  ==============================================================================" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "   Sincronizando con el repositorio y descargando los últimos cambios..." -ForegroundColor Gray
    Write-Host ""

    # 1. Comprobar que git esté instalado
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        Write-Host "   [ERROR] Git no está instalado o no se encuentra en el PATH de Windows." -ForegroundColor Red
        Write-Host "   Por favor descarga e instala Git desde: https://git-scm.com/downloads" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "   Presiona [Enter] para volver al Panel de Control..."
        return
    }

    # 2. Pausar servidores para evitar bloqueos de archivos en Windows
    Write-Host "   [1/4] Pausando servidores para evitar bloqueos de archivos en Windows..." -ForegroundColor Yellow
    Stop-Services
    Start-Sleep -Seconds 1

    # 3. Ejecutar git pull
    Write-Host "   [2/4] Descargando últimos cambios desde el repositorio Git (git pull)..." -ForegroundColor Cyan
    Write-Host ""
    Push-Location $script:rootDir
    $pullError = $false
    try {
        $branch = (& git rev-parse --abbrev-ref HEAD 2>&1).Trim()
        if (-not $branch -or $branch -like "*fatal*") { $branch = "main" }
        Write-Host "         Rama activa: $branch" -ForegroundColor DarkGray

        $pullOutput = & git pull origin $branch 2>&1
        foreach ($line in $pullOutput) {
            Write-Host "         $line" -ForegroundColor Gray
        }
        if ($LASTEXITCODE -ne 0) {
            $pullError = $true
        }
    } catch {
        Write-Host "         [ERROR] Fallo al ejecutar git pull: $_" -ForegroundColor Red
        $pullError = $true
    }
    Write-Host ""

    if ($pullError) {
        Write-Host "   [AVISO] git pull reportó una advertencia o no se pudo sincronizar." -ForegroundColor Yellow
        Write-Host "           Verifica tu conexión a internet o si tienes cambios locales pendientes." -ForegroundColor Yellow
        Write-Host ""
    }

    # 4. Verificar dependencias
    Write-Host "   [3/4] Verificando dependencias del sistema..." -ForegroundColor Cyan
    $pythonPip = Join-Path $script:rootDir "backend\venv\Scripts\pip.exe"
    $reqFile = Join-Path $script:rootDir "backend\requirements.txt"
    if ((Test-Path $pythonPip) -and (Test-Path $reqFile)) {
        Write-Host "         [*] Verificando librerías de Python en backend..." -ForegroundColor DarkGray
        & $pythonPip install -r $reqFile --quiet 2>&1 | Out-Null
    }

    $frontendDir = Join-Path $script:rootDir "frontend"
    if (Test-Path (Join-Path $frontendDir "package.json")) {
        Write-Host "         [*] Verificando módulos de Node.js en frontend..." -ForegroundColor DarkGray
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
    Write-Host "   ✅ ¡PRISMA LAB ERP HA SIDO ACTUALIZADO EXITOSAMENTE!" -ForegroundColor Green
    Write-Host "  ==============================================================================" -ForegroundColor Green
    Write-Host ""

    $lastCommit = & git log -1 --oneline 2>&1
    Write-Host "   Versión actual instalada: $lastCommit" -ForegroundColor White
    Write-Host ""

    Pop-Location

    if ($script:notify) {
        $script:notify.ShowBalloonTip(3500, "Prisma Lab ERP", "Actualización completada: $lastCommit", [System.Windows.Forms.ToolTipIcon]::Info)
    }

    Write-Host "   Presiona [Enter] para volver al Panel de Control..." -ForegroundColor Yellow
    Read-Host | Out-Null
}

function Show-Dashboard {
    Clear-Host
    Write-Host ""
    Write-Host "  ==============================================================================" -ForegroundColor DarkCyan
    Write-Host "    ██████╗ ██████╗ ██╗███████╗███╗   ███╗ █████╗     ██╗      █████╗ ██████╗   " -ForegroundColor Cyan
    Write-Host "    ██╔══██╗██╔══██╗██║██╔════╝████╗ ████║██╔══██╗    ██║     ██╔══██╗██╔══██╗  " -ForegroundColor Cyan
    Write-Host "    ██████╔╝██████╔╝██║███████╗██╔████╔██║███████║    ██║     ███████║██████╔╝  " -ForegroundColor White
    Write-Host "    ██╔═══╝ ██╔══██╗██║╚════██║██║╚██╔╝██║██╔══██║    ██║     ██╔══██║██╔══██╗  " -ForegroundColor White
    Write-Host "    ██║     ██║  ██║██║███████║██║ ╚═╝ ██║██║  ██║    ███████╗██║  ██║██████╔╝  " -ForegroundColor Cyan
    Write-Host "    ╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝    ╚══════╝╚═╝  ╚═╝╚═════╝   " -ForegroundColor DarkCyan
    Write-Host "                     SISTEMA INTEGRAL DE PRODUCCIÓN Y ERP 3D                   " -ForegroundColor Yellow
    Write-Host "  ==============================================================================" -ForegroundColor DarkCyan
    Write-Host ""

    # Comprobar estado en vivo
    $backendOk = $false
    try {
        $check = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($check.StatusCode -eq 200) { $backendOk = $true }
    } catch {}

    Write-Host "  [ESTADO DEL SISTEMA]" -ForegroundColor White
    if ($backendOk) {
        Write-Host "   ● Backend API (FastAPI):  " -NoNewline
        Write-Host " [ EN LÍNEA ] " -ForegroundColor Black -BackgroundColor Green -NoNewline
        Write-Host " http://localhost:8000" -ForegroundColor Gray
    } else {
        Write-Host "   ● Backend API (FastAPI):  " -NoNewline
        Write-Host " [ DETENIDO ] " -ForegroundColor White -BackgroundColor Red
    }

    Write-Host "   ● Aplicación Web (React): " -NoNewline
    Write-Host " [ EN LÍNEA ] " -ForegroundColor Black -BackgroundColor Green -NoNewline
    Write-Host " http://localhost:3000" -ForegroundColor Gray

    Write-Host "   ● Base de Datos Local:    " -NoNewline
    Write-Host " [ CONECTADA ]" -ForegroundColor Black -BackgroundColor Green -NoNewline
    Write-Host " prisma_lab.db (SQLite)" -ForegroundColor Gray
    Write-Host ""

    Write-Host "  ──────────────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "   ¿QUÉ DESEAS HACER?" -ForegroundColor Yellow
    Write-Host "  ──────────────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "   [1] " -NoNewline -ForegroundColor Cyan
    Write-Host "🌐 Abrir Prisma Lab en el Navegador" -ForegroundColor White
    Write-Host "   [2] " -NoNewline -ForegroundColor Cyan
    Write-Host "🫥 Ocultar esta ventana a los Iconos Ocultos (Bandeja del Sistema)" -ForegroundColor Green
    Write-Host "   [3] " -NoNewline -ForegroundColor Cyan
    Write-Host "🔄 Reiniciar Servidores" -ForegroundColor White
    Write-Host "   [4] " -NoNewline -ForegroundColor Cyan
    Write-Host "📂 Abrir Carpeta del Proyecto y Copias de Seguridad" -ForegroundColor White
    Write-Host "   [5] " -NoNewline -ForegroundColor Cyan
    Write-Host "📥 Actualizar Sistema desde Git (Git Pull - Descargar Última Versión)" -ForegroundColor Cyan
    Write-Host "   [6] " -NoNewline -ForegroundColor Cyan
    Write-Host "🛑 Detener Todo y Salir" -ForegroundColor Red
    Write-Host "  ──────────────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
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
    Write-Host "   👉 Busca el icono de Prisma Lab en la barra de tareas (flecha ^ de iconos ocultos)." -ForegroundColor Cyan
    Write-Host "   👉 Haz doble clic en el icono para restaurar la ventana en cualquier momento." -ForegroundColor Cyan
    Write-Host ""
    Start-Sleep -Milliseconds 1200

    # Ocultar ventana de consola
    $script:hwnd = Get-MyConsoleHandle
    if ($script:hwnd -ne [IntPtr]::Zero) {
        [Win32]::ShowWindow($script:hwnd, 0) | Out-Null
    }

    # Mostrar icono en la bandeja
    $script:notify.Visible = $true
    $script:notify.ShowBalloonTip(3500, "Prisma Lab ERP", "El sistema sigue activo en segundo plano. Haz clic en el icono para volver al panel o acceder a las opciones.", [System.Windows.Forms.ToolTipIcon]::Info)

    # Iniciar Message Loop de Windows Forms mientras esta oculta
    $script:appContext = New-Object System.Windows.Forms.ApplicationContext
    [System.Windows.Forms.Application]::Run($script:appContext)

    # Al salir del loop (cuando se hace clic en restaurar):
    $script:notify.Visible = $false
    if ($script:hwnd -ne [IntPtr]::Zero) {
        [Win32]::ShowWindow($script:hwnd, 5) | Out-Null
        [Win32]::SetForegroundWindow($script:hwnd) | Out-Null
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
        $startAnswer = Read-Host "   ¿Deseas abrir el Panel de Prisma Lab ahora mismo? (S/N) [S]"
        if ($startAnswer.Trim().ToUpper() -eq "N") {
            Stop-Services
            exit 0
        }
    } else {
        # 1. Iniciar servidores en segundo plano
        Start-Services

        # 2. Abrir navegador automaticamente la primera vez
        Start-Process "http://localhost:3000" | Out-Null
    }

    # 3. Bucle interactivo del Panel de Control
    while ($true) {
        if ($script:pendingAction -eq "update") {
            $script:pendingAction = $null
            Update-System
            continue
        }

        Show-Dashboard
        $choice = Read-Host "   Elige una opción (1-6)"

        switch ($choice.Trim()) {
            "1" {
                Start-Process "http://localhost:3000" | Out-Null
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
                Start-Process "explorer.exe" $script:rootDir | Out-Null
            }
            "5" {
                Update-System
            }
            "6" {
                Write-Host ""
                Write-Host " [!] Deteniendo servidores de Prisma Lab..." -ForegroundColor Yellow
                Stop-Services
                Write-Host " [OK] Sistema apagado exitosamente. ¡Hasta luego!" -ForegroundColor Green
                Start-Sleep -Seconds 1
                break
            }
            default {
                Write-Host "   [!] Opción inválida. Por favor ingresa un número del 1 al 6." -ForegroundColor Red
                Start-Sleep -Milliseconds 800
            }
        }
    }
} finally {
    Stop-Services
    if ($script:notify) {
        $script:notify.Visible = $false
        $script:notify.Dispose()
    }
}
