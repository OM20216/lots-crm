# Run the standalone LOTS Support service in the background, like a Windows service, without administrator rights.
# It has its own scheduled task, process, port and storage, so support tokens keep working when the CRM is
# stopped, crashed or its build failed. The CRM is only a client of this service.
#
#   powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 install    create the task and start
#   ...                                                            status     running? port, start time, ticket count
#   ...                                                            restart    after an update
#   ...                                                            stop
#   ...                                                            start
#   ...                                                            uninstall  stop and remove the task
param([Parameter(Position = 0)][ValidateSet('install', 'uninstall', 'start', 'stop', 'restart', 'status')][string]$Command = 'status')

$ErrorActionPreference = 'Stop'
$Task = 'LOTS Support'
$root = Split-Path $PSScriptRoot -Parent
$private = Join-Path $env:USERPROFILE '.lots-crm'
$stopFlag = Join-Path $private 'support.stop'
$envFile = Join-Path $private 'support.env'
$port = 4100
$envLine = Get-Content $envFile -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*SUPPORT_PORT\s*=\s*\d+' } | Select-Object -First 1
if ($envLine -match '(\d+)') { $port = [int]$Matches[1] }

function Health {
  try { return Invoke-RestMethod "http://localhost:$port/api/health" -TimeoutSec 4 } catch { return $null }
}
function SupportProcess {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue }
}
function Stop-Support {
  $p = SupportProcess
  if (-not $p) { Write-Host 'LOTS Support is not running.'; return }
  New-Item -ItemType File -Force $stopFlag | Out-Null # the runner loop ends instead of restarting
  Stop-Process -Id $p.Id -Force
  for ($i = 0; $i -lt 10 -and (SupportProcess); $i++) { Start-Sleep -Seconds 1 }
  Write-Host 'Stopped.'
}
function Start-Support {
  if (-not (Test-Path $envFile)) { throw "Missing $envFile - create it with the support access codes first." }
  if (SupportProcess) { Write-Host "Already running on port $port."; return }
  if (-not (Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue)) { throw "The task is not installed: run 'install' first." }
  Remove-Item $stopFlag -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName $Task
  for ($i = 0; $i -lt 60 -and -not (Health); $i++) { Start-Sleep -Seconds 1 }
  if (Health) { Write-Host "Running: http://localhost:$port" } else { throw "LOTS Support did not answer within 60 s - see support-error.log" }
}
function Show-Status {
  $t = Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
  $p = SupportProcess
  $h = Health
  Write-Host ("Task:     " + ($(if ($t) { "$($t.State) (starts at log-on)" } else { 'not installed' })))
  Write-Host ("Support:  " + ($(if ($p) { "running on port $port since $($p.StartTime)" } else { 'not running' })))
  if ($h) {
    Write-Host ("Tickets:  $($h.tickets) stored in $($h.data)")
    Write-Host ("Independent of the CRM: yes (the CRM reads these tokens through this service)")
  }
}

switch ($Command) {
  'install' {
    if (-not (Test-Path $envFile)) { throw "Missing $envFile - create it with the support access codes first." }
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $root 'scripts\run-support.ps1')`"" -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $Task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'LOTS Support tokens in the background, independent of the CRM (scripts\support-service.ps1)' -Force | Out-Null
    Write-Host "Task '$Task' installed: support starts when $env:USERNAME logs on."
    if (SupportProcess) { Write-Host 'A support service is already running on the port: stopping it first.'; Stop-Support }
    Start-Support
  }
  'uninstall' { Stop-Support; Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue; Write-Host 'Task removed.' }
  'start' { Start-Support }
  'stop' { Stop-Support }
  'restart' { Stop-Support; Start-Support }
  'status' { Show-Status }
}
