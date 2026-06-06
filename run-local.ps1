# =============================================================================
# GPOMS - native, FULLY-OFFLINE local runner (no Docker, no cloud).
# Starts a local PostgreSQL (from the installed PostgreSQL\<ver>\bin), then the
# FastAPI backend and Next.js frontend, all natively. Used by START.bat.
# Safe to re-run. Everything keeps running in the background until STOP.bat.
# =============================================================================
$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Venv = Join-Path $Backend ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"
$Alembic = Join-Path $Venv "Scripts\alembic.exe"
$BackendPort = 8010
$FrontendPort = 3000
$PgPort = 5441
$PgData = Join-Path $Root ".pgdata"
$PgLog = Join-Path $Root ".pg.log"
$DbUrl = "postgresql+psycopg://postgres@127.0.0.1:$PgPort/gpoms"

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "   [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "   [..] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "   [XX] $m" -ForegroundColor Red }
function Stop-Port($p) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} } }
function PortUp($p) { try { return (Test-NetConnection 127.0.0.1 -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue) } catch { return $false } }

Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host "   Digital Leap GPOMS - offline local run" -ForegroundColor White
Write-Host "===============================================" -ForegroundColor DarkCyan

Step "1/7  Environment files"
if (-not (Test-Path (Join-Path $Backend ".env")))  { Copy-Item (Join-Path $Backend ".env.example")  (Join-Path $Backend ".env") }
if (-not (Test-Path (Join-Path $Frontend ".env"))) { Copy-Item (Join-Path $Frontend ".env.example") (Join-Path $Frontend ".env") }
Ok "env files ready"

Step "2/7  Local PostgreSQL"
$pgRoot = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $pgRoot) { Bad "PostgreSQL not found in C:\Program Files\PostgreSQL. Install PostgreSQL, or point backend\.env DATABASE_URL at a cloud DB."; Read-Host "Press Enter to exit"; exit 1 }
$PgBin = Join-Path $pgRoot.FullName "bin"
if (-not (Test-Path $PgData)) { Warn "initializing local database (first run)..."; & "$PgBin\initdb.exe" -D $PgData -U postgres -A trust -E UTF8 | Out-Null }
if (-not (PortUp $PgPort)) { & "$PgBin\pg_ctl.exe" -D $PgData -o "-p $PgPort" -l $PgLog start | Out-Null; Start-Sleep 3 }
if (PortUp $PgPort) { Ok "PostgreSQL up on 127.0.0.1:$PgPort" } else { Bad "Postgres failed to start - see $PgLog"; Read-Host "Press Enter to exit"; exit 1 }
$dbExists = & "$PgBin\psql.exe" -h 127.0.0.1 -p $PgPort -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='gpoms'" 2>$null
if ("$dbExists".Trim() -ne "1") { & "$PgBin\createdb.exe" -h 127.0.0.1 -p $PgPort -U postgres gpoms; Ok "created database 'gpoms'" } else { Ok "database 'gpoms' ready" }

Step "3/7  Python virtual environment"
if (-not (Test-Path $Py)) { Warn "creating venv (first run)..."; py -3 -m venv $Venv 2>$null; if (-not (Test-Path $Py)) { python -m venv $Venv } }
if (-not (Test-Path $Py)) { Bad "Could not create a Python venv. Install Python 3."; Read-Host "Press Enter to exit"; exit 1 }
Ok "venv ready"

Step "4/7  Backend dependencies"
& $Py -c "import fastapi, uvicorn, sqlalchemy, psycopg, bcrypt, jose, alembic" 2>$null
if ($LASTEXITCODE -ne 0) {
  Warn "installing backend deps (first run, ~1-2 min)..."
  & $Py -m pip install --quiet --disable-pip-version-check --upgrade pip
  & $Py -m pip install --quiet --disable-pip-version-check fastapi "uvicorn[standard]" sqlalchemy "psycopg[binary]" alembic pydantic pydantic-settings python-dotenv "python-jose[cryptography]" bcrypt email-validator python-multipart
  if ($LASTEXITCODE -ne 0) { Bad "dependency install failed"; Read-Host "Press Enter to exit"; exit 1 }
}
Ok "backend deps ready"

Step "5/7  Frontend dependencies"
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) { Warn "npm install (first run)..."; Push-Location $Frontend; npm install; Pop-Location }
Ok "frontend deps ready"

Step "6/7  Database migrate + seed (idempotent)"
$env:DATABASE_URL = $DbUrl
Push-Location $Backend
& $Alembic upgrade head | Out-Null
& $Py -m scripts.seed | Out-Null
Pop-Location
Ok "schema migrated + admin/roles/lookups seeded"

Step "7/7  Start servers (stopping any old ones first)"
Stop-Port $BackendPort; Stop-Port $FrontendPort; Start-Sleep 1
$env:DATABASE_URL = $DbUrl
Start-Process -WindowStyle Hidden -FilePath $Py `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$BackendPort" `
  -WorkingDirectory $Backend `
  -RedirectStandardOutput (Join-Path $env:TEMP "gpoms_api.out") -RedirectStandardError (Join-Path $env:TEMP "gpoms_api.err")
Start-Process -WindowStyle Hidden -FilePath "cmd.exe" `
  -ArgumentList "/c", "npm run dev" `
  -WorkingDirectory $Frontend `
  -RedirectStandardOutput (Join-Path $env:TEMP "gpoms_web.out") -RedirectStandardError (Join-Path $env:TEMP "gpoms_web.err")
$apiOk = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep 2; try { $r = Invoke-RestMethod "http://localhost:$BackendPort/api/health" -TimeoutSec 4; if ($r.status -eq "ok") { $apiOk = $true; break } } catch {} }
if ($apiOk) { Ok "API up: http://localhost:$BackendPort" } else { Warn "API slow - see $env:TEMP\gpoms_api.err" }
$webOk = $false
for ($i = 0; $i -lt 50; $i++) { Start-Sleep 3; try { $w = Invoke-WebRequest "http://localhost:$FrontendPort/login" -TimeoutSec 6 -UseBasicParsing; if ($w.StatusCode -eq 200) { $webOk = $true; break } } catch {} }
if ($webOk) { Ok "Web up: http://localhost:$FrontendPort" } else { Warn "Web still compiling (first load is slow) - give it ~30s" }

Write-Host ""
Write-Host "===========  GPOMS IS RUNNING (OFFLINE)  ===========" -ForegroundColor Green
Write-Host "   Web   : http://localhost:$FrontendPort/login"
Write-Host "   API   : http://localhost:$BackendPort/docs"
Write-Host "   Login : admin@digitalleap.com  /  ChangeMe123!"
Write-Host "   DB    : local PostgreSQL 127.0.0.1:$PgPort  (no internet needed)"
Write-Host "====================================================" -ForegroundColor Green
Start-Process "http://localhost:$FrontendPort/login"
Write-Host "`nEverything runs in the background. Use STOP.bat to stop it all."
Read-Host "Press Enter to close this window (servers + DB keep running)"
