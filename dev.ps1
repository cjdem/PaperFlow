<#
.SYNOPSIS
  One-click dev startup for PaperFlow (backend + frontend)

.DESCRIPTION
  - Backend: FastAPI + Uvicorn (default http://127.0.0.1:8000)
  - Frontend: Next.js dev server (default http://localhost:3000)
  - Opens two new PowerShell windows for logs

.PARAMETER Install
  Install missing deps via pip/npm (does NOT run DB migrations).

.PARAMETER BackendPort
  Backend port (default 8000).

.PARAMETER FrontendPort
  Frontend port (default 3000).

.PARAMETER BackendHost
  Backend host (default 127.0.0.1).

.PARAMETER ApiUrl
  Sets NEXT_PUBLIC_API_URL for the frontend (default: unset; frontend uses http://localhost:8000).
#>

[CmdletBinding()]
param(
  [switch]$Install,
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 3000,
  [string]$BackendHost = "127.0.0.1",
  [string]$ApiUrl = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  param([string]$ScriptRoot)
  return (Resolve-Path -Path (Join-Path -Path $ScriptRoot -ChildPath ".")).Path
}

function Ensure-FileExists {
  param(
    [string]$Path,
    [string]$Hint
  )
  if (-not (Test-Path -Path $Path)) {
    throw "File not found: $Path`n$Hint"
  }
}

function Ensure-Command {
  param([string]$Name)
  $cmd = Get-Command -Name $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Command not found: $Name (please install it and ensure it is on PATH)"
  }
  return $cmd.Source
}

$repoRoot = Get-RepoRoot -ScriptRoot $PSScriptRoot
$backendTarget = "backend.main:app"

$envExamplePath = Join-Path -Path $repoRoot -ChildPath ".env.example"
$envPath = Join-Path -Path $repoRoot -ChildPath ".env"
if (-not (Test-Path -Path $envPath) -and (Test-Path -Path $envExamplePath)) {
  Copy-Item -Path $envExamplePath -Destination $envPath -Force
  Write-Host "Created .env: $envPath (please set JWT_SECRET_KEY at minimum)" -ForegroundColor Yellow
}

Ensure-FileExists -Path (Join-Path -Path $repoRoot -ChildPath "backend/main.py") -Hint "Make sure you are running this from the PaperFlow repo root."
Ensure-FileExists -Path (Join-Path -Path $repoRoot -ChildPath "frontend/package.json") -Hint "Missing frontend directory; cannot start frontend."

# --- Python / venv ---
$venvPython = Join-Path -Path $repoRoot -ChildPath ".venv/Scripts/python.exe"
if (-not (Test-Path -Path $venvPython)) {
  if (-not $Install) {
    throw "Virtual env not found: $venvPython`nRun: python -m venv .venv, then re-run this script (or pass -Install to auto-init)."
  }
  $pythonExe = Ensure-Command -Name "python"
  Write-Host "Initializing Python venv: $repoRoot/.venv" -ForegroundColor Cyan
  & $pythonExe -m venv (Join-Path -Path $repoRoot -ChildPath ".venv")
  $venvPython = Join-Path -Path $repoRoot -ChildPath ".venv/Scripts/python.exe"
}

if ($Install) {
  Write-Host "Installing Python dependencies..." -ForegroundColor Cyan
  & $venvPython -m pip install -r (Join-Path -Path $repoRoot -ChildPath "requirements.txt")
  & $venvPython -m pip install -r (Join-Path -Path $repoRoot -ChildPath "backend/requirements.txt")
}

# --- Node / npm ---
$npmExe = Ensure-Command -Name "npm"
$frontendDir = Join-Path -Path $repoRoot -ChildPath "frontend"
$nodeModulesDir = Join-Path -Path $frontendDir -ChildPath "node_modules"
if ($Install -and -not (Test-Path -Path $nodeModulesDir)) {
  Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Cyan
  Push-Location $frontendDir
  try {
    & $npmExe install
  } finally {
    Pop-Location
  }
}

# --- Spawn servers in new windows ---
$shellExe = $null
$pwshCmd = Get-Command -Name "pwsh" -ErrorAction SilentlyContinue
if ($pwshCmd) {
  $shellExe = $pwshCmd.Source
} else {
  $powershellCmd = Get-Command -Name "powershell" -ErrorAction SilentlyContinue
  if ($powershellCmd) {
    $shellExe = $powershellCmd.Source
  }
}
if (-not $shellExe) {
  $shellExe = "powershell.exe"
}

$backendCmd = @(
  "Set-Location `"$repoRoot`"",
  "& `"$venvPython`" -m uvicorn `"$backendTarget`" --reload --host `"$BackendHost`" --port $BackendPort"
) -join "; "

$frontendEnv = @()
if ($ApiUrl.Trim()) {
  $frontendEnv += "`$env:NEXT_PUBLIC_API_URL = `"$ApiUrl`""
}
if ($FrontendPort -ne 3000) {
  $frontendEnv += "`$env:PORT = `"$FrontendPort`""
}
$frontendEnv += "`$env:PAPERFLOW_BACKEND_URL = `"http://$BackendHost`:$BackendPort`""

$frontendCmdParts = @(
  "Set-Location `"$frontendDir`""
)
if ($frontendEnv.Count -gt 0) {
  $frontendCmdParts += ($frontendEnv -join "; ")
}
$frontendCmdParts += "& `"$npmExe`" run dev"
$frontendCmd = $frontendCmdParts -join "; "

Start-Process -FilePath $shellExe -WorkingDirectory $repoRoot -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $backendCmd
) | Out-Null

Start-Process -FilePath $shellExe -WorkingDirectory $frontendDir -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $frontendCmd
) | Out-Null

Write-Host ""
Write-Host "Started:" -ForegroundColor Green
Write-Host ("- Backend:  http://{0}:{1}  (docs: /docs)" -f $BackendHost, $BackendPort)
Write-Host ("- Frontend: http://localhost:{0}" -f $FrontendPort)
Write-Host ""
Write-Host "To stop: Ctrl+C in each window, or close the window." -ForegroundColor DarkGray
