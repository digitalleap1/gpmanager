# GPOMS - status check (used by STATUS.bat). Tells you if the app is up.
$Root = $PSScriptRoot
Set-Location $Root
$BackendPort = 8010
$FrontendPort = 3000
if (Test-Path "$Root\.env") {
  foreach ($l in Get-Content "$Root\.env") {
    if ($l -match '^\s*BACKEND_PORT\s*=\s*(\d+)')  { $BackendPort = $matches[1] }
    if ($l -match '^\s*FRONTEND_PORT\s*=\s*(\d+)') { $FrontendPort = $matches[1] }
  }
}

Write-Host "============== GPOMS status ==============" -ForegroundColor Cyan
$ver = docker version --format "{{.Server.Version}}" 2>$null
if ($ver) { Write-Host "  Docker engine : $ver" -ForegroundColor Green }
else { Write-Host "  Docker        : NOT running (open Docker Desktop)" -ForegroundColor Red }

Write-Host "  Containers:"
docker compose ps --format "    {{.Service}}: {{.State}} ({{.Status}})"

function Check($name, $url) {
  try { $r = Invoke-WebRequest $url -TimeoutSec 4 -UseBasicParsing
        Write-Host ("  {0}: UP   (HTTP {1})  {2}" -f $name, $r.StatusCode, $url) -ForegroundColor Green }
  catch { Write-Host ("  {0}: DOWN  {1}" -f $name, $url) -ForegroundColor Red }
}
Check "API" "http://localhost:$BackendPort/api/health"
Check "Web" "http://localhost:$FrontendPort"

Write-Host ""
Write-Host "  Open: http://localhost:$FrontendPort/login   (admin@digitalleap.com / ChangeMe123!)" -ForegroundColor White
Read-Host "Press Enter to close"
