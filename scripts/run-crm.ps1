# Keeps the LOTS CRM running in the background (started by the "LOTS CRM" scheduled task, scripts/crm-service.ps1).
# Runs the server in production mode; if it stops or crashes it is started again after 10 seconds.
# "crm-service.ps1 stop" leaves a stop flag so the loop ends instead of restarting.
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$private = Join-Path $env:USERPROFILE '.lots-crm'
New-Item -ItemType Directory -Force $private | Out-Null
$stopFlag = Join-Path $private 'crm.stop'
Remove-Item $stopFlag -ErrorAction SilentlyContinue

while ($true) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path (Join-Path $root 'crm.log') -Value "[$stamp] service: starting the CRM"
  # cmd keeps the logs in plain text (PowerShell 5 would write them as UTF-16)
  # 4 GB for Node (default 2.2 GB on this PC): about 3 lakh contacts from Vtiger are held in memory for caller search
  & cmd.exe /c "node --max-old-space-size=4096 server\index.js --prod >> crm.log 2>> crm-error.log"
  $code = $LASTEXITCODE
  if (Test-Path $stopFlag) {
    Remove-Item $stopFlag -ErrorAction SilentlyContinue
    Add-Content -Path (Join-Path $root 'crm.log') -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] service: stopped"
    break
  }
  Add-Content -Path (Join-Path $root 'crm.log') -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] service: the CRM stopped (exit $code) - starting it again in 10 seconds"
  Start-Sleep -Seconds 10
}
