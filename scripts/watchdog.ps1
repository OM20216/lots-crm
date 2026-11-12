# Watchdog for the LOTS CRM (port 4000) and the standalone LOTS Support service (port 4100).
#
# The two services already restart themselves when Node crashes (run-crm.ps1 / run-support.ps1 loops).
# This covers what those loops cannot: a service that is listening but not answering (hung, or MySQL
# unreachable), a runner loop that has died, and - most importantly - telling someone about it.
#
#   powershell -ExecutionPolicy Bypass -File scripts\watchdog.ps1 install    create the task and start it
#   ...                                                            status     last check, both services, recent events
#   ...                                                            uninstall  remove the task
#   ...                                                            check      run one check and exit (for testing)
#   ...                                                            run        the loop (what the task starts)
#
# Every pass it writes ~/.lots-crm/watchdog-status.json (the CRM's own /api/health reads it and shows a
# banner) and appends to logs\watchdog.log. A restart also raises a Windows notification.
param(
  [Parameter(Position = 0)][ValidateSet('run', 'install', 'uninstall', 'status', 'check')][string]$Command = 'run',
  [int]$IntervalSeconds = 60,
  # a service must fail this many checks in a row before it is restarted (3 x 60 s = 3 minutes)
  [int]$FailuresBeforeRestart = 3
)

$ErrorActionPreference = 'Continue'
$Task = 'LOTS CRM Watchdog'
$root = Split-Path $PSScriptRoot -Parent
$private = Join-Path $env:USERPROFILE '.lots-crm'
$statusFile = Join-Path $private 'watchdog-status.json'
$logFile = Join-Path $root 'logs\watchdog.log'
$logMaxBytes = 1MB

$crmPort = 4000
$envLine = Get-Content (Join-Path $root '.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*PORT\s*=\s*(\d+)' } | Select-Object -First 1
if ($envLine -match '(\d+)') { $crmPort = [int]$Matches[1] }

$supportPort = 4100
$supLine = Get-Content (Join-Path $private 'support.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*SUPPORT_PORT\s*=\s*(\d+)' } | Select-Object -First 1
if ($supLine -match '(\d+)') { $supportPort = [int]$Matches[1] }

New-Item -ItemType Directory -Force $private | Out-Null
New-Item -ItemType Directory -Force (Split-Path $logFile -Parent) | Out-Null

function Write-Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Write-Host $line
  try {
    if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt $logMaxBytes) {
      $keep = Get-Content $logFile -Tail 2000
      Set-Content -Path $logFile -Value $keep -Encoding UTF8
    }
    Add-Content -Path $logFile -Value $line
  } catch { }
}

# Windows notification (best effort: a hidden task in a signed-in session shows it).
function Show-Alert([string]$Title, [string]$Text) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $icon.Icon = [System.Drawing.SystemIcons]::Warning
    $icon.Visible = $true
    $icon.ShowBalloonTip(10000, $Title, $Text, [System.Windows.Forms.ToolTipIcon]::Warning)
    Start-Sleep -Seconds 7
    $icon.Dispose()
  } catch { }
}

function Test-Crm {
  # One slow answer is not a dead service: the start-up load (3.2 lakh contacts) can stall the event loop for
  # seconds, so a timeout is retried once before it counts as a failure.
  for ($try = 1; $try -le 2; $try++) {
    try {
      $h = Invoke-RestMethod "http://localhost:$crmPort/api/health" -TimeoutSec 15
      if (-not $h.ok) { return [pscustomobject]@{ up = $false; detail = 'health says not ok' } }
      $detail = "database $($h.backend), $($h.pending) pending write(s)"
      if ($h.lastError) { $detail += ' - last write failed' }
      return [pscustomobject]@{ up = $true; detail = $detail }
    } catch {
      $err = $_.Exception.Message
      if ($try -lt 2) { Start-Sleep -Seconds 3 }
    }
  }
  return [pscustomobject]@{ up = $false; detail = $err }
}

function Test-Support {
  try {
    $h = Invoke-RestMethod "http://localhost:$supportPort/api/health" -TimeoutSec 10
    if (-not $h.ok) { return [pscustomobject]@{ up = $false; detail = 'health says not ok' } }
    return [pscustomobject]@{ up = $true; detail = "$($h.tickets) token(s) stored" }
  } catch { return [pscustomobject]@{ up = $false; detail = $_.Exception.Message } }
}

function Test-Listening([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Get-TaskState([string]$Name) {
  $t = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if (-not $t) { return 'not installed' }
  return [string]$t.State
}

# The watchdog loop itself (a hidden powershell running "watchdog.ps1 run").
function Get-WatchdogProcesses {
  return @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*watchdog.ps1*run*' -and $_.ProcessId -ne $PID })
}

# Restarts a service through its own script (which knows how to stop it safely, without losing pending writes).
function Repair([string]$Service) {
  try {
    if ($Service -eq 'crm') {
      $state = Get-TaskState 'LOTS CRM'
      if (Test-Listening $crmPort) {
        # listening but not answering: hung - stop safely (waits for pending writes) then start
        Write-Log 'crm: answering nothing - restarting it'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\crm-service.ps1') restart *>> (Join-Path $root 'logs\watchdog-service.log')
      } else {
        Write-Log "crm: not running (task '$state') - starting it"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\crm-service.ps1') start *>> (Join-Path $root 'logs\watchdog-service.log')
      }
    } else {
      if (Test-Listening $supportPort) {
        Write-Log 'support: answering nothing - restarting it'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\support-service.ps1') restart *>> (Join-Path $root 'logs\watchdog-service.log')
      } else {
        Write-Log 'support: not running - starting it'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\support-service.ps1') start *>> (Join-Path $root 'logs\watchdog-service.log')
      }
    }
    return $true
  } catch {
    Write-Log "${Service}: the repair failed - $($_.Exception.Message)"
    return $false
  }
}

$script:events = @()
function Add-Event([string]$Service, [string]$Kind, [string]$Message) {
  $e = [pscustomobject]@{ at = (Get-Date).ToString('o'); service = $Service; kind = $Kind; message = $Message }
  $script:events = @((@($e) + @($script:events)) | Select-Object -First 30)
  Write-Log "$($Service)/$($Kind): $Message"
}

function Show-StatusOnly {
  $s = Get-Status
  if (-not $s) { Write-Host 'No watchdog status yet - it has not run.'; return }
  $age = [int]((Get-Date) - [datetime]$s.updatedAt).TotalSeconds
  $procs = @(Get-WatchdogProcesses)
  $alive = $procs.Length -gt 0
  $state = if ($alive) { "running (last check $age s ago)" } else { "NOT running (last check $([int]($age / 60)) min ago)" }
  Write-Host "Watchdog: $state"
  Write-Host ("Task:     " + (Get-TaskState $Task))
  foreach ($pair in @(@('CRM', $s.crm), @('Support', $s.support))) {
    $name = $pair[0]
    $svc = $pair[1]
    $word = if ($svc.up) { 'up' } else { 'DOWN since ' + ([datetime]$svc.downSince).ToString('HH:mm') }
    Write-Host ("{0,-8}  {1} - {2} (task {3})" -f $name, $word, $svc.detail, $svc.task)
  }
  Write-Host ("Checks:   " + $s.checks)
  if ($s.lastEvent) { Write-Host ("Last:     " + ([datetime]$s.lastEvent.at).ToString('dd MMM HH:mm') + "  " + $s.lastEvent.service + " " + $s.lastEvent.kind + " - " + $s.lastEvent.message) }
  if ($s.events -and @($s.events).Count -gt 1) {
    Write-Host 'Recent:'
    @($s.events) | Select-Object -Skip 1 -First 5 | ForEach-Object { Write-Host ("          " + ([datetime]$_.at).ToString('dd MMM HH:mm') + "  " + $_.service + " " + $_.kind + " - " + $_.message) }
  }
}

function Save-Status($crm, $support, [int]$checks, [string]$crmDownSince, [string]$supportDownSince) {
  $lastEvent = if ($script:events.Count) { $script:events[0] } else { $null }
  $doc = [ordered]@{
    updatedAt     = (Get-Date).ToString('o')
    watchdog      = 'running'
    pid           = $PID
    intervalSeconds = $IntervalSeconds
    crm           = [ordered]@{ up = $crm.up; detail = $crm.detail; checkedAt = (Get-Date).ToString('o'); downSince = $crmDownSince; task = (Get-TaskState 'LOTS CRM') }
    support       = [ordered]@{ up = $support.up; detail = $support.detail; checkedAt = (Get-Date).ToString('o'); downSince = $supportDownSince; task = (Get-TaskState 'LOTS Support') }
    checks        = $checks
    lastEvent     = $lastEvent
    events        = $script:events
  }
  try {
    # no BOM: the CRM reads this file as JSON
    [System.IO.File]::WriteAllText($statusFile, ($doc | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
  } catch { Write-Log "could not write $statusFile - $($_.Exception.Message)" }
}

function Get-Status {
  if (Test-Path $statusFile) { try { return Get-Content $statusFile -Raw | ConvertFrom-Json } catch { } }
  return $null
}

function Invoke-Pass {
  $crm = Test-Crm
  $support = Test-Support
  if ($crm.up) { $script:crmFails = 0; if ($script:crmDownSince) { Add-Event 'crm' 'recovered' 'answering again'; $script:crmDownSince = '' } }
  else {
    $script:crmFails++
    if (-not $script:crmDownSince) { $script:crmDownSince = (Get-Date).ToString('o'); Add-Event 'crm' 'down' $crm.detail }
    if ($script:crmFails -eq $FailuresBeforeRestart -or ($script:crmFails -gt $FailuresBeforeRestart -and $script:crmFails % 5 -eq 0)) {
      Show-Alert 'LOTS CRM is down' "The CRM is not answering. Restarting it automatically ($($crm.detail))."
      $ok = Repair 'crm'
      $after = Test-Crm
      if ($after.up) { Add-Event 'crm' 'restart' "restarted automatically - $($after.detail)"; $script:crmFails = 0; $crm = $after; $script:crmDownSince = '' }
      elseif (-not $ok) { Add-Event 'crm' 'restart-failed' 'the restart command failed - see logs\watchdog-service.log' }
      else { Add-Event 'crm' 'restart-failed' "still not answering - $($after.detail)" }
    }
  }

  if ($support.up) { $script:supFails = 0; if ($script:supDownSince) { Add-Event 'support' 'recovered' 'answering again'; $script:supDownSince = '' } }
  else {
    $script:supFails++
    if (-not $script:supDownSince) { $script:supDownSince = (Get-Date).ToString('o'); Add-Event 'support' 'down' $support.detail }
    if ($script:supFails -eq $FailuresBeforeRestart -or ($script:supFails -gt $FailuresBeforeRestart -and $script:supFails % 5 -eq 0)) {
      Show-Alert 'LOTS Support is down' "Support tokens are not answering. Restarting the support service ($($support.detail))."
      $ok = Repair 'support'
      $after = Test-Support
      if ($after.up) { Add-Event 'support' 'restart' "restarted automatically - $($after.detail)"; $script:supFails = 0; $support = $after; $script:supDownSince = '' }
      elseif (-not $ok) { Add-Event 'support' 'restart-failed' 'the restart command failed - see logs\watchdog-service.log' }
      else { Add-Event 'support' 'restart-failed' "still not answering - $($after.detail)" }
    }
  }

  $script:checks++
  Save-Status $crm $support $script:checks $script:crmDownSince $script:supDownSince
  return ($crm.up -and $support.up)
}

switch ($Command) {
  'install' {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $root 'scripts\watchdog.ps1')`" run" -WorkingDirectory $root
    $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    # and again every 5 minutes: if the loop itself ever dies, the task starts a new one (a second copy exits
    # at once because of the mutex, and MultipleInstances IgnoreNew skips it entirely)
    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $Task -Action $action -Trigger @($logon, $repeat) -Settings $settings -Principal $principal -Description 'Watches the LOTS CRM and LOTS Support services, restarts them and alerts (scripts\watchdog.ps1)' -Force | Out-Null
    Start-ScheduledTask -TaskName $Task
    Write-Log "task '$Task' installed and started (checks every $IntervalSeconds s)"
    Start-Sleep -Seconds 3
    Show-StatusOnly
  }
  'uninstall' {
    Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like '*watchdog.ps1*run*' -and $_.ProcessId -ne $PID } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "Task '$Task' removed."
  }
  'status' { Show-StatusOnly }
  'check' {
    $ok = Invoke-Pass
    Write-Host ("Both answering: " + $ok)
  }
  default {
    # single instance: two watchdogs would restart the same service twice
    $mutex = New-Object System.Threading.Mutex($false, 'LOTSCRMWatchdog')
    if (-not $mutex.WaitOne(0)) { Write-Host 'A watchdog is already running.'; exit 0 }
    try {
      $script:crmFails = 0
      $script:supFails = 0
      $script:checks = 0
      $script:crmDownSince = ''
      $script:supDownSince = ''
      # keep the history from the previous run (a restart of the watchdog must not forget that a service
      # was restarted 5 minutes ago - the bar in the CRM reads these events)
      $prev = Get-Status
      if ($prev -and $prev.events) { $script:events = @($prev.events) }
      if ($prev -and $prev.checks) { $script:checks = [int]$prev.checks }
      Write-Log "watchdog started (every $IntervalSeconds s, restart after $FailuresBeforeRestart failed checks)"
      while ($true) {
        Invoke-Pass | Out-Null
        Start-Sleep -Seconds $IntervalSeconds
      }
    } finally {
      $mutex.ReleaseMutex()
    }
  }
}


