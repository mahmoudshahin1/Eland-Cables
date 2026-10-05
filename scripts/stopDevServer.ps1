# Stops the detached Energya Connect dev server on port 3847.

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$port = 3847
$pidFile = Join-Path $projectRoot 'logs\dev-server.pid'

$listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $listeners) {
  Write-Host "No dev server listening on port $port."
  if (Test-Path $pidFile) { Remove-Item $pidFile -Force }
  exit 0
}

$processIds = $listeners.OwningProcess | Sort-Object -Unique
foreach ($processId in $processIds) {
  Write-Host "Stopping PID $processId (port $port)"
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

if (Test-Path $pidFile) {
  $wrapperPid = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($wrapperPid) {
    Stop-Process -Id ([int]$wrapperPid) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $pidFile -Force
}

Start-Sleep -Seconds 1
$still = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Host "Warning: port $port may still be in use."
  exit 1
}

Write-Host "Dev server stopped."
