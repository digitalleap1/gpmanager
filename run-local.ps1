# =============================================================================
# GPOMS - native local runner (NO Docker).
# Runs the FastAPI backend + Next.js frontend directly on this machine, pointed
# at the DATABASE_URL in backend\.env (currently the Neon cloud database).
# Used by START.bat. Safe to re-run (it stops anything already on the ports).
# =============================================================================
$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Venv = Join-Path $Backend ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"
$BackendPort = 8010
$FrontendPort = 3000

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "   [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "   [..] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "   [XX] $m" -ForegroundColor Red }
function Stop-Port($port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} }
}

Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host "   Digital Leap GPOMS - native local run" -ForegroundColor White
Write-Host "===============================================" -ForegroundColor DarkCyan

Step "1/6  Environment file"
if (-not (Test-Path (Join-Path $Backend ".env"))) {
  Copy-Item (Join-Path $Backend ".env.example") (Join-Path $Backend ".env")
  Warn "created backend\.env from example - set DATABASE_URL in it if needed"
}
if (-not (Test-Path (Join-Path $Frontend ".env"))) {
  Copy-Item (Join-Path $Frontend ".env.example") (Join-Path $Frontend ".env")
}
Ok "env files ready"

Step "2/6  Python virtual environment"
if (-not (Test-Path $Py)) { Warn "creating venv (first run)..."; py -3 -m venv $Venv 2>$null; if (-not (Test-Path $Py)) { python -m venv $Venv } }
if (-not (Test-Path $Py)) { Bad "Could not create a Python venv. Install Python 3 and retry."; Read-Host "Press Enter to exit"; exit 1 }
Ok "venv ready"

Step "3/6  Backend dependencies"
& $Py -c "import fastapi, uvicorn, sqlalchemy, psycopg, bcrypt, jose" 2>$null
if ($LASTEXITCODE -ne 0) {
  Warn "installing backend deps (first run, ~1-2 min)..."
  & $Py -m pip install --quiet --disable-pip-version-check --upgrade pip
  & $Py -m pip install --quiet --disable-pip-version-check fastapi "uvicorn[standard]" sqlalchemy "psycopg[binary]" alembic pydantic pydantic-settings python-dotenv "python-jose[cryptography]" bcrypt email-validator python-multipart
  if ($LASTEXITCODE -ne 0) { Bad "dependency install failed"; Read-Host "Press Enter to exit"; exit 1 }
}
Ok "backend deps ready"

Step "4/6  Frontend dependencies"
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
  Warn "installing frontend deps (npm install, first run)..."
  Push-Location $Frontend; npm install; Pop-Location
}
Ok "frontend deps ready"

Step "5/6  Start servers (stopping any old ones first)"
Stop-Port $BackendPort
Stop-Port $FrontendPort
Start-Sleep 1
Start-Process -WindowStyle Hidden -FilePath $Py `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$BackendPort" `
  -WorkingDirectory $Backend `
  -RedirectStandardOutput (Join-Path $env:TEMP "gpoms_api.out") `
  -RedirectStandardError (Join-Path $env:TEMP "gpoms_api.err")
Start-Process -WindowStyle Hidden -FilePath "cmd.exe" `
  -ArgumentList "/c", "npm run dev" `
  -WorkingDirectory $Frontend `
  -RedirectStandardOutput (Join-Path $env:TEMP "gpoms_web.out") `
  -RedirectStandardError (Join-Path $env:TEMP "gpoms_web.err")
Ok "backend + frontend launching"

Step "6/6  Waiting for the app to come up"
$apiOk = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep 2; try { $r = Invoke-RestMethod "http://localhost:$BackendPort/api/health" -TimeoutSec 4; if ($r.status -eq "ok") { $apiOk = $true; break } } catch {} }
if ($apiOk) { Ok "API up: http://localhost:$BackendPort" } else { Warn "API slow - see $env:TEMP\gpoms_api.err" }
$webOk = $false
for ($i = 0; $i -lt 50; $i++) { Start-Sleep 3; try { $w = Invoke-WebRequest "http://localhost:$FrontendPort/login" -TimeoutSec 6 -UseBasicParsing; if ($w.StatusCode -eq 200) { $webOk = $true; break } } catch {} }
if ($webOk) { Ok "Web up: http://localhost:$FrontendPort" } else { Warn "Web still compiling (first load is slow) - give it ~30s" }

Write-Host ""
Write-Host "===============  GPOMS IS RUNNING  ==============" -ForegroundColor Green
Write-Host "   Web   : http://localhost:$FrontendPort/login"
Write-Host "   API   : http://localhost:$BackendPort/docs"
Write-Host "   Login : admin@digitalleap.com  /  ChangeMe123!"
Write-Host "   Data  : Neon (cloud database)"
Write-Host "================================================" -ForegroundColor Green
Start-Process "http://localhost:$FrontendPort/login"
Write-Host "`nServers run in the background. Use STOP.bat to stop them."
Read-Host "Press Enter to close this window (servers keep running)"
