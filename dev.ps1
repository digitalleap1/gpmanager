#requires -version 5
<#
  Digital Leap GPOMS - developer shortcut menu.
  Usage:  cd c:\Users\Admin\projects\guestpost-saas ;  .\dev.ps1
  Pick a number to run a common dev or verification task. The menu loops so you
  can check your work after every step. Ctrl+C or 0 to exit.
#>

$Root        = $PSScriptRoot
$Backend     = Join-Path $Root "backend"
$Frontend    = Join-Path $Root "frontend"
$VenvDir     = Join-Path $Backend ".venv"
$VenvScripts = Join-Path $VenvDir "Scripts"
$VenvPy      = Join-Path $VenvScripts "python.exe"
$Alembic     = Join-Path $VenvScripts "alembic.exe"

function Title($t) { Write-Host "`n>> $t" -ForegroundColor Cyan }
function Ok($t)    { Write-Host "   $t" -ForegroundColor Green }
function Warn($t)  { Write-Host "   $t" -ForegroundColor Yellow }
function Err($t)   { Write-Host "   $t" -ForegroundColor Red }
function PauseMenu { Read-Host "`nPress Enter to return to the menu" | Out-Null }

function Need-Venv {
  if (-not (Test-Path $VenvPy)) { Warn "Backend venv missing - run option [4] first."; return $false }
  return $true
}

function Invoke-In($dir, [scriptblock]$block) {
  Push-Location $dir
  try { & $block } finally { Pop-Location }
}

function Setup-EnvFiles {
  Title "Copy .env.example -> .env (only if missing)"
  $pairs = @(
    @{ s = ".env.example";          d = ".env" },
    @{ s = "backend\.env.example";  d = "backend\.env" },
    @{ s = "frontend\.env.example"; d = "frontend\.env" }
  )
  foreach ($p in $pairs) {
    $src = Join-Path $Root $p.s; $dst = Join-Path $Root $p.d
    if (Test-Path $dst)       { Warn "exists  $($p.d)" }
    elseif (Test-Path $src)   { Copy-Item $src $dst; Ok "created $($p.d)" }
    else                      { Err "missing $($p.s)" }
  }
}

function Health-Check {
  Title "Health check"
  foreach ($u in @("http://localhost:8000/", "http://localhost:8000/api/health")) {
    try {
      $r = Invoke-RestMethod -Uri $u -TimeoutSec 5
      Ok ("{0} -> {1}" -f $u, ($r | ConvertTo-Json -Compress))
    } catch { Err ("{0} -> not reachable ({1})" -f $u, $_.Exception.Message) }
  }
  try {
    $f = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing
    Ok ("http://localhost:3000 -> HTTP {0}" -f $f.StatusCode)
  } catch { Err "http://localhost:3000 -> frontend not reachable" }
}

function Show-Menu {
  Clear-Host
  Write-Host "=====================================================" -ForegroundColor DarkCyan
  Write-Host "   Digital Leap GPOMS - dev menu" -ForegroundColor White
  Write-Host "   $Root" -ForegroundColor DarkGray
  Write-Host "=====================================================" -ForegroundColor DarkCyan
  Write-Host " SETUP & DATABASE"
  Write-Host "   1) First-time setup (copy .env files)"
  Write-Host "   2) Start database only      (docker compose up -d db pgadmin)"
  Write-Host "   3) Stop all docker services (docker compose down)"
  Write-Host " BACKEND"
  Write-Host "   4) Create venv + install deps"
  Write-Host "   5) Apply DB migrations      (alembic upgrade head)"
  Write-Host "   6) Seed roles + admin       (python -m scripts.seed)"
  Write-Host "   7) Run API dev server       (uvicorn --reload)"
  Write-Host "   8) Run backend tests        (pytest)"
  Write-Host "   9) Lint backend             (ruff check)"
  Write-Host "  10) New migration (autogenerate)"
  Write-Host " FRONTEND"
  Write-Host "  11) Install deps             (npm install)"
  Write-Host "  12) Run web dev server       (npm run dev)"
  Write-Host "  13) Lint frontend            (npm run lint)"
  Write-Host " FULL STACK (docker)"
  Write-Host "  14) Up full stack (build)    (docker compose up --build)"
  Write-Host "  15) Tail docker logs"
  Write-Host " CHECKS"
  Write-Host "  16) Health check (API + web)"
  Write-Host "  17) Open in browser (web / API docs / pgAdmin)"
  Write-Host "  18) Git status (short)"
  Write-Host "  19) Git diff (what changed)"
  Write-Host "  20) Show per-step verification checklist"
  Write-Host "   0) Exit"
  Write-Host "-----------------------------------------------------" -ForegroundColor DarkCyan
}

while ($true) {
  Show-Menu
  $choice = Read-Host "Select"
  switch ($choice) {
    "1"  { Setup-EnvFiles; PauseMenu }
    "2"  { Title "Starting Postgres + pgAdmin"; Invoke-In $Root { docker compose up -d db pgadmin }; PauseMenu }
    "3"  { Title "Stopping docker services"; Invoke-In $Root { docker compose down }; PauseMenu }
    "4"  {
            Title "Create venv + install backend deps"
            if (-not (Test-Path $VenvPy)) { py -3.12 -m venv $VenvDir 2>$null; if (-not (Test-Path $VenvPy)) { python -m venv $VenvDir } }
            & $VenvPy -m pip install --upgrade pip
            & $VenvPy -m pip install -r (Join-Path $Backend "requirements.txt") -r (Join-Path $Backend "requirements-dev.txt")
            Ok "deps installed"; PauseMenu
         }
    "5"  { if (Need-Venv) { Title "alembic upgrade head"; Invoke-In $Backend { & $Alembic upgrade head } }; PauseMenu }
    "6"  { if (Need-Venv) { Title "Seeding roles + admin"; Invoke-In $Backend { & $VenvPy -m scripts.seed } }; PauseMenu }
    "7"  { if (Need-Venv) { Title "uvicorn (Ctrl+C to stop)"; Invoke-In $Backend { & $VenvPy -m uvicorn app.main:app --reload } }; PauseMenu }
    "8"  { if (Need-Venv) { Title "pytest"; Invoke-In $Backend { & $VenvPy -m pytest -q } }; PauseMenu }
    "9"  { if (Need-Venv) { Title "ruff check"; Invoke-In $Backend { & $VenvPy -m ruff check app } }; PauseMenu }
    "10" {
            if (Need-Venv) {
              $msg = Read-Host "Migration message"
              Title "alembic revision --autogenerate"
              Invoke-In $Backend { & $Alembic revision --autogenerate -m $msg }
            }
            PauseMenu
         }
    "11" { Title "npm install"; Invoke-In $Frontend { npm install }; PauseMenu }
    "12" { Title "npm run dev (Ctrl+C to stop)"; Invoke-In $Frontend { npm run dev }; PauseMenu }
    "13" { Title "npm run lint"; Invoke-In $Frontend { npm run lint }; PauseMenu }
    "14" { Title "docker compose up --build (Ctrl+C to stop)"; Invoke-In $Root { docker compose up --build }; PauseMenu }
    "15" { Title "docker logs (Ctrl+C to stop)"; Invoke-In $Root { docker compose logs -f --tail=120 }; PauseMenu }
    "16" { Health-Check; PauseMenu }
    "17" {
            Start-Process "http://localhost:3000"
            Start-Process "http://localhost:8000/docs"
            Start-Process "http://localhost:5050"
            Ok "Opened web, API docs, and pgAdmin in your browser."; PauseMenu
         }
    "18" { Title "git status"; Invoke-In $Root { git status --short --branch }; PauseMenu }
    "19" { Title "git diff (q to quit pager)"; Invoke-In $Root { git --no-pager diff --stat; Write-Host ""; git --no-pager diff }; PauseMenu }
    "20" {
            $verify = Join-Path $Root "docs\dev\VERIFY.md"
            if (Test-Path $verify) { Get-Content $verify | Out-Host } else { Err "docs\dev\VERIFY.md not found" }
            PauseMenu
         }
    "0"  { break }
    default { Warn "Unknown option: $choice"; Start-Sleep -Milliseconds 700 }
  }
}
Write-Host "Bye." -ForegroundColor DarkGray
