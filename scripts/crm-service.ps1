# Run the LOTS CRM in the background, like a Windows service, without administrator rights:
# a scheduled task under this Windows user starts it at log-on, hidden, and scripts/run-crm.ps1 restarts it if it stops.
#
#   powershell -ExecutionPolicy Bypass -File scripts\crm-service.ps1 install    build the screens, create the task, start
#   ...                                                            status     running? port, start time, pending writes
#   ...                                                            restart    after an update: build, stop safely, start
#   ...                                                            stop       stop safely (waits for pending database writes)
#   ...                                                            start
#   ...                                                            uninstall  stop and remove the task
param([Parameter(Position = 0)][ValidateSet('install', 'uninstall', 'start', 'stop', 'restart', 'status')][string]$Command = 'status')

$ErrorActionPreference = 'Stop'
$Task = 'LOTS CRM'
$root = Split-Path $PSScriptRoot -Parent
$stopFlag = Join-Path (Join-Path $env:USERPROFILE '.lots-crm') 'crm.stop'
$port = 4000
$envLine = Get-Content (Join-Path $root '.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*PORT\s*=\s*(\d+)' } | Select-Object -First 1
if ($envLine -match '(\d+)') { $port = [int]$Matches[1] }

function Health {
  try { return Invoke-RestMethod "http://localhost:$port/api/health" -TimeoutSec 5 } catch {}
  # a CRM from before 23 Oct 2026 has no /api/health: its database status is in /api/meta
  try {
    $m = Invoke-RestMethod "http://localhost:$port/api/meta" -TimeoutSec 10
    return [pscustomobject]@{ ok = $true; backend = $m.database.backend; pending = [int]$m.database.pending; lastError = [bool]$m.database.lastError }
  } catch { return $null }
}
function CrmProcess {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue }
}
function Build {
  Write-Host 'Building the screens (npm run build)...'
  Push-Location $root
  try { & cmd.exe /c 'npm run build' | Out-Host; if ($LASTEXITCODE) { throw 'The build failed - the CRM was not changed.' } } finally { Pop-Location }
}
function Stop-Crm {
  $p = CrmProcess
  if (-not $p) { Write-Host 'The CRM is not running.'; return }
  # never stop with database writes still pending
  for ($i = 0; $i -lt 30; $i++) {
    $h = Health
    if (-not $h -or $h.pending -eq 0) { break }
    Write-Host "Waiting for $($h.pending) pending database write(s)..."
    Start-Sleep -Seconds 2
  }
  $h = Health
  if ($h -and $h.pending -gt 0) { throw "Still $($h.pending) pending database write(s) after 60 s (is MySQL reachable?). Not stopped." }
  New-Item -ItemType File -Force $stopFlag | Out-Null # the runner loop ends instead of restarting
  Stop-Process -Id $p.Id -Force
  for ($i = 0; $i -lt 10 -and (CrmProcess); $i++) { Start-Sleep -Seconds 1 }
  Write-Host 'Stopped (no pending writes).'
}
function Start-Crm {
  if (CrmProcess) { Write-Host "Already running on port $port."; return }
  if (-not (Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue)) { throw "The task is not installed: run 'install' first." }
  Remove-Item $stopFlag -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName $Task
  # A cold start reads ~1.6 lakh cases and ~3.2 lakh contacts from the remote MySQL before it listens (several
  # minutes). 40 s was too short: the CRM was healthy but still loading, and the start was reported as failed.
  $wait = 600
  for ($i = 0; $i -lt $wait -and -not (Health); $i++) {
    if ($i -gt 0 -and $i % 30 -eq 0) { Write-Host "Still starting ($i s): loading cases and contacts from MySQL..." }
    Start-Sleep -Seconds 1
  }
  if (Health) { Write-Host "Running: http://localhost:$port" } else { throw "The CRM did not answer within $wait s - see crm-error.log" }
}
function Show-Status {
  $t = Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
  $p = CrmProcess
  $h = Health
  Write-Host ("Task:     " + ($(if ($t) { "$($t.State) (starts at log-on)" } else { 'not installed' })))
  Write-Host ("CRM:      " + ($(if ($p) { "running on port $port since $($p.StartTime)" } else { 'not running' })))
  if ($h) { Write-Host ("Database: $($h.backend), pending writes $($h.pending)" + ($(if ($h.lastError) { ' - last write had an error (Stores & settings > Database)' } else { '' }))) }
}

switch ($Command) {
  'install' {
    Build
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $root 'scripts\run-crm.ps1')`"" -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $Task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'LOTS CRM in the background (scripts\crm-service.ps1)' -Force | Out-Null
    Write-Host "Task '$Task' installed: the CRM starts when $env:USERNAME logs on."
    if (CrmProcess) { Write-Host 'A CRM is already running on the port: stopping it safely first.'; Stop-Crm }
    Start-Crm
  }
  'uninstall' { Stop-Crm; Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue; Write-Host 'Task removed.' }
  'start' { Start-Crm }
  'stop' { Stop-Crm }
  'restart' { Build; Stop-Crm; Start-Crm }
  'status' { Show-Status }
}
