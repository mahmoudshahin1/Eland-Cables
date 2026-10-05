# Starts Energya Connect dev server detached from Cursor/terminal.
# Survives Cursor close. Logs: logs/dev-server.log

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$port = 3847
$logDir = Join-Path $projectRoot 'logs'
$logFile = Join-Path $logDir 'dev-server.log'
$pidFile = Join-Path $logDir 'dev-server.pid'

$dbPort = 5432
$dbListening = Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue
if (-not $dbListening) {
  $dockerExe = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
  $dockerDesktop = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
  if (Test-Path $dockerExe) {
    Write-Host "PostgreSQL not listening on $dbPort - starting Docker Postgres..."
    if (Test-Path $dockerDesktop) {
      $dockerProc = Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue
      if (-not $dockerProc) { Start-Process $dockerDesktop | Out-Null }
      $dockerDeadline = (Get-Date).AddMinutes(3)
      while ((Get-Date) -lt $dockerDeadline) {
        & $dockerExe info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 3
      }
    }
    & $dockerExe compose -f (Join-Path $projectRoot 'docker-compose.yml') up -d postgres | Out-Null
    $dbDeadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $dbDeadline) {
      $dbListening = Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue
      if ($dbListening) { break }
      Start-Sleep -Seconds 2
    }
  }
  if (-not $dbListening) {
    Write-Host "ERROR: PostgreSQL is not running on port $dbPort."
    Write-Host "Start Docker Desktop, then run: docker compose up -d postgres"
    exit 1
  }
}

function Test-DevPortListening {
  param([int]$ListenPort)
  $tcp = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
  if ($tcp) { return $true }
  $pattern = ":$ListenPort\s+.+\sLISTENING"
  $hit = netstat -ano 2>$null | Select-String -Pattern $pattern
  return [bool]$hit
}

function Test-DevServerHealthy {
  param([int]$ListenPort)
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:$ListenPort/api/platform/health" -UseBasicParsing -TimeoutSec 2
    return ($health.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (Test-DevServerHealthy -ListenPort $port) {
  Write-Host "Dev server already healthy on http://localhost:$port"
  exit 0
}

$existing = Test-DevPortListening -ListenPort $port
if ($existing) {
  Write-Host "Dev server already listening on port $port."
  exit 0
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$nodeHelpers = Join-Path $env:LOCALAPPDATA 'Programs\cursor\resources\app\resources\helpers'
$pathPrefix = if (Test-Path $nodeHelpers) { "$nodeHelpers;C:\Program Files\nodejs;" } else { 'C:\Program Files\nodejs;' }

$env:PATH = $pathPrefix + $env:PATH
$errLog = Join-Path $logDir 'dev-server.err.log'
$proc = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory $projectRoot -RedirectStandardOutput $logFile -RedirectStandardError $errLog -WindowStyle Hidden -PassThru

Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii

# Get-NetTCPConnection (CIM) can lag past a real bind; prefer HTTP health, then netstat.
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
  if (Test-DevServerHealthy -ListenPort $port) {
    $ready = $true
    break
  }
  if (Test-DevPortListening -ListenPort $port) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if ($ready) {
  Write-Host "Energya Connect running at http://localhost:$port (wrapper PID $($proc.Id))"
  Write-Host "Log file: $logFile"
  Write-Host "Stop with: powershell -File scripts/stopDevServer.ps1"
} else {
  Write-Host "Server started but not yet listening on port $port. Check $logFile"
  exit 1
}
