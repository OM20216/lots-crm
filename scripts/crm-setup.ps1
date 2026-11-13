# Prepare the LOTS CRM on a PC that has just cloned the project (a collaborator's machine, a test PC).
#
# A clone is only the code: the settings and the data live outside the project and never go into git. Without
# them the CRM starts on its own empty data file and without the SparkTG dialer, which looks like "all the data
# has disappeared". This script creates what is missing and says exactly which values still have to be pasted.
#
#   powershell -ExecutionPolicy Bypass -File scripts\crm-setup.ps1                  check, install, build
#   powershell -ExecutionPolicy Bypass -File scripts\crm-setup.ps1 -InstallService  also create the "LOTS CRM" task and start
#
# It never overwrites an existing .env or secrets file, and it never prints a password.
param([switch]$InstallService)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$privateDir = Join-Path $env:USERPROFILE '.lots-crm'
$secrets = Join-Path $privateDir 'secrets.env'
$envFile = Join-Path $root '.env'

Write-Host ''
Write-Host 'LOTS CRM - set up this PC'
Write-Host "Project: $root"
Write-Host ''

# 1. Node.js
$nodeVersion = $null
try { $nodeVersion = & node -v 2>$null } catch { $nodeVersion = $null }
if (-not $nodeVersion) {
  throw 'Node.js is not installed. Install Node.js 20.12 or newer (LTS) from https://nodejs.org and run this again.'
}
$nodeVersion = $nodeVersion.Trim()
$nodeNumber = [version]($nodeVersion.TrimStart('v'))
if ($nodeNumber -lt [version]'20.12') {
  Write-Host "WARNING: Node.js $nodeVersion is older than 20.12. Install the current LTS version from https://nodejs.org." -ForegroundColor Yellow
} else {
  Write-Host "Node.js $nodeVersion - ok."
}

# 2. Packages
Push-Location $root
try {
  if (Test-Path (Join-Path $root 'node_modules')) {
    Write-Host 'Packages already installed (node_modules found) - skipping npm install.'
  } else {
    Write-Host 'Installing packages (npm install)...'
    & cmd.exe /c 'npm install 2>&1' | Out-Host
    if ($LASTEXITCODE) { throw 'npm install failed - see the messages above (network, Node version).' }
  }
} finally { Pop-Location }

# 3. .env (non-secret settings: port, SparkTG addresses, mailbox). It is git-ignored, so a clone has none.
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root '.env.example') $envFile
  Write-Host 'Created .env from .env.example (port 4000, SparkTG addresses, mailbox).'
} else {
  Write-Host '.env already exists - left unchanged.'
}

# 4. Private folder and secrets file (MySQL, SparkTG login, support token). It lives outside the project on purpose.
if (-not (Test-Path $privateDir)) { New-Item -ItemType Directory -Force $privateDir | Out-Null }
$secretsCreated = $false
if (-not (Test-Path $secrets)) {
  Copy-Item (Join-Path $root 'secrets.env.example') $secrets
  $secretsCreated = $true
  Write-Host "Created the secrets file: $secrets"
} else {
  Write-Host "Secrets file found: $secrets"
}

# Only says whether a value is filled in - never the value itself.
function Get-Setting([string]$name) {
  foreach ($line in (Get-Content $secrets -ErrorAction SilentlyContinue)) {
    if ($line -match "^\s*$name\s*=\s*(.*)$") {
      $value = $Matches[1].Trim().Trim("'").Trim('"')
      if ($value) { return $value }
    }
  }
  return ''
}

$required = [ordered]@{
  MYSQL_HOST     = 'the company MySQL server address'
  MYSQL_DATABASE = 'the database name (lots)'
  MYSQL_USER     = 'the database user'
  MYSQL_PASSWORD = 'the database password'
  SPARKTG_USERNAME = 'the SparkTG API login'
  SPARKTG_PASSWORD = 'the SparkTG API password'
  SPARKTG_SVC_ID   = 'the SparkTG service id'
}
$missing = @($required.Keys | Where-Object { -not (Get-Setting $_) })

# 5. Screens
Push-Location $root
try {
  Write-Host 'Building the screens (npm run build)...'
  & cmd.exe /c 'npm run build 2>&1' | Out-Host
  if ($LASTEXITCODE) { throw 'The build failed - see the messages above.' }
} finally { Pop-Location }

# 6. Start
if ($InstallService) {
  Write-Host 'Installing the background task "LOTS CRM"...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'crm-service.ps1') install
} else {
  Write-Host ''
  Write-Host 'To start the CRM:  npm start      (or: powershell -ExecutionPolicy Bypass -File scripts\crm-service.ps1 install)'
}

# 7. What is still missing, in plain words
Write-Host ''
if ($missing.Count) {
  Write-Host 'STILL MISSING in the secrets file:' -ForegroundColor Yellow
  foreach ($key in $missing) { Write-Host "  - $key  ($($required[$key]))" }
  Write-Host "Open it with:  notepad `"$secrets`""
  Write-Host 'Paste the same values the live CRM PC uses (they are not in git and must not be committed).'
  Write-Host ''
  if ($secretsCreated -or ($missing -contains 'MYSQL_HOST')) {
    Write-Host 'Without the MYSQL_ values this copy runs on its own empty data file:' -ForegroundColor Yellow
    Write-Host 'the live cases, contacts and call logs will not be there. The CRM shows an amber bar saying so.'
    Write-Host 'Then restart:  powershell -ExecutionPolicy Bypass -File scripts\crm-service.ps1 restart'
  }
} else {
  Write-Host 'All the MySQL and SparkTG settings are filled in - this copy uses the company database.' -ForegroundColor Green
}

# 8. Support tokens (a separate service; the CRM only needs its URL and token)
$supportUrl = Get-Setting 'SUPPORT_SERVICE_URL'
$supportToken = Get-Setting 'SUPPORT_SERVICE_TOKEN'
Write-Host ''
if ($supportToken) {
  Write-Host "Support tokens: SUPPORT_SERVICE_URL=$supportUrl (set). Agent portal: $supportUrl"
} else {
  Write-Host 'Support tokens: SUPPORT_SERVICE_TOKEN is empty, so the Support screen will not reach a support service.'
  Write-Host 'Paste the live PC values, or run this PC its own copy: scripts\support-service.ps1 (support-service\README.md).'
}

Write-Host ''
Write-Host 'Done. Open http://localhost:4000 - the bar at the top of the page says which database the copy is using.'
Write-Host ''
