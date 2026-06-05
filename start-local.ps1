# =============================================================================
# GPOMS - one-click local launcher (used by START.bat)
# Brings up the full stack on Docker, migrates + seeds the DB, and opens the app.
# Safe to run repeatedly.
# =============================================================================
$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
Set-Location $Root

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "   [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "   [..] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "   [XX] $m" -ForegroundColor Red }

# --- read ports from .env (fallback to the local-dev defaults) ---
$BackendPort = 8010
$FrontendPort = 3000
if (Test-Path "$Root\.env") {
  foreach ($l in Get-Content "$Root\.env") {
    if ($l -match '^\s*BACKEND_PORT\s*=\s*(\d+)')  { $BackendPort = $matches[1] }
    if ($l -match '^\s*FRONTEND_PORT\s*=\s*(\d+)') { $FrontendPort = $matches[1] }
  }
}

Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host "   Digital Leap GPOMS - local launcher" -ForegroundColor White
Write-Host "===============================================" -ForegroundColor DarkCyan

Step "1/7  Environment files"
$pairs = @(
  @(".env.example", ".env"),
  @("backend\.env.example", "backend\.env"),
  @("frontend\.env.example", "frontend\.env")
)
foreach ($p in $pairs) {
  if ((-not (Test-Path $p[1])) -and (Test-Path $p[0])) { Copy-Item $p[0] $p[1]; Ok "created $($p[1])" }
  else { Ok "$($p[1]) ready" }
}

Step "2/7  Docker Desktop"
$ver = docker version --format "{{.Server.Version}}" 2>$null
if (-not $ver) {
  $dd = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) { Warn "Docker not running - starting Docker Desktop (give it a minute)..."; Start-Process $dd }
  for ($i = 0; $i -lt 60; $i++) { Start-Sleep 5; $ver = docker version --format "{{.Server.Version}}" 2>$null; if ($ver) { break } }
}
if ($ver) { Ok "Docker engine $ver" }
else { Bad "Docker is not available. Open Docker Desktop, wait for it to start, then run START again."; Read-Host "Press Enter to exit"; exit 1 }

Step "3/7  Backend dependency wheels (offline install source)"
# This machine's Docker VM can't reach PyPI reliably, so we pre-download the
# Python wheels on the host (fast) and the backend image installs them offline.
$wheelDir = Join-Path $Root "backend\wheels"
$haveWheels = (Test-Path $wheelDir) -and ((Get-ChildItem $wheelDir -Filter *.whl -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
if ($haveWheels) { Ok "wheels present ($((Get-ChildItem $wheelDir -Filter *.whl).Count) files)" }
else {
  Warn "downloading backend wheels on the host (one-time; needs Python 3 + internet)..."
  New-Item -ItemType Directory -Force -Path $wheelDir | Out-Null
  python -m pip download -r (Join-Path $Root "backend\requirements.txt") --dest $wheelDir `
    --only-binary=:all: --platform manylinux_2_17_x86_64 --platform manylinux_2_28_x86_64 `
    --python-version 3.12 --implementation cp
  $dl1 = $LASTEXITCODE
  # Linux-only deps the Windows host skips during cross-platform download:
  python -m pip download greenlet uvloop sniffio --dest $wheelDir --no-deps `
    --only-binary=:all: --platform manylinux_2_17_x86_64 --platform manylinux_2_28_x86_64 `
    --python-version 3.12 --implementation cp
  if ($dl1 -eq 0 -and $LASTEXITCODE -eq 0) { Ok "wheels downloaded" }
  else { Bad "wheel download failed (need Python 3 + internet on the host)."; Read-Host "Press Enter to exit"; exit 1 }
}

Step "4/7  Build + start containers (first run builds the images)"
docker compose up -d --build db backend frontend
if ($LASTEXITCODE -ne 0) { Bad "docker compose failed (see messages above)."; Read-Host "Press Enter to exit"; exit 1 }
Ok "containers started"

Step "5/7  Waiting for the API to come up"
$apiOk = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep 3
  try { $r = Invoke-RestMethod "http://localhost:$BackendPort/api/health" -TimeoutSec 3; if ($r.status -eq "ok") { $apiOk = $true; break } } catch {}
}
if ($apiOk) { Ok "API healthy at http://localhost:$BackendPort" } else { Warn "API still starting - continuing anyway" }

Step "6/7  Database migrate + seed (idempotent)"
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend python -m scripts.seed
Ok "schema migrated + admin/roles/lookups seeded"

Step "7/7  Status"
docker compose ps --format "   {{.Service}}: {{.State}} ({{.Status}})"

Write-Host ""
Write-Host "===============  GPOMS IS READY  ==============" -ForegroundColor Green
Write-Host "   Web app : http://localhost:$FrontendPort/login"
Write-Host "   API docs: http://localhost:$BackendPort/docs"
Write-Host "   Login   : admin@digitalleap.com  /  ChangeMe123!"
Write-Host "===============================================" -ForegroundColor Green
Start-Process "http://localhost:$FrontendPort/login"
Read-Host "`nPress Enter to close this window (the app keeps running in the background)"
