# GPOMS - stop the native local servers + the local PostgreSQL. Used by STOP.bat.
$Root = $PSScriptRoot
Write-Host "Stopping GPOMS..." -ForegroundColor Cyan
foreach ($p in 8010, 3000) {
  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} }
}
Write-Host "  servers stopped (ports 8010, 3000)" -ForegroundColor Green

$pgRoot = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
$pgData = Join-Path $Root ".pgdata"
if ($pgRoot -and (Test-Path (Join-Path $pgData "PG_VERSION"))) {
  & (Join-Path $pgRoot.FullName "bin\pg_ctl.exe") -D $pgData stop -m fast 2>$null | Out-Null
  Write-Host "  local database stopped" -ForegroundColor Green
}
Write-Host "`nAll stopped. Your data is kept in .pgdata. Run START.bat to bring it back." -ForegroundColor White
Read-Host "Press Enter to close"
