# Keeps the standalone LOTS Support service running (started by the "LOTS Support" scheduled task,
# scripts/support-service.ps1). It is independent of the CRM: this loop keeps it alive even if the
# CRM is stopped, crashed or its build failed.
# "support-service.ps1 stop" leaves a stop flag so the loop ends instead of restarting.
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$private = Join-Path $env:USERPROFILE '.lots-crm'
New-Item -ItemType Directory -Force $private | Out-Null
$stopFlag = Join-Path $private 'support.stop'
Remove-Item $stopFlag -ErrorAction SilentlyContinue

while ($true) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path (Join-Path $root 'support.log') -Value "[$stamp] service: starting LOTS Support"
  # cmd keeps the logs in plain text (PowerShell 5 would write them as UTF-16)
  & cmd.exe /c "node support-service\server.js >> support.log 2>> support-error.log"
  $code = $LASTEXITCODE
  if (Test-Path $stopFlag) {
    Remove-Item $stopFlag -ErrorAction SilentlyContinue
    Add-Content -Path (Join-Path $root 'support.log') -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] service: stopped"
    break
  }
  Add-Content -Path (Join-Path $root 'support.log') -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] service: the support service stopped (exit $code) - starting it again in 5 seconds"
  Start-Sleep -Seconds 5
}
