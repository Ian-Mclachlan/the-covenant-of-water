#Requires -Version 5.1
<#
.SYNOPSIS
    Phone-to-laptop relay. Runs the sync on demand when a trigger file appears
    in the OneDrive inbox folder.

.DESCRIPTION
    A cloud session (Claude on your phone) cannot reach the HP laptop directly -
    the laptop is behind the work network and is not listening for anything.
    OneDrive is the one channel that already crosses that boundary in both
    directions, so it is used as the mailbox.

    Drop ANY file into  <PersonalOneDrive>\PersonalSync\_status\inbox\
    and the next time this watcher fires (every 15 minutes while the laptop is
    awake and logged in) it will:
      1. move the trigger file into inbox\.claimed\ so it fires only once
      2. run Sync-PersonalFiles.ps1 with -Reason on-demand
      3. leave a fresh receipt in _status\LAST-RUN.txt

    Any file works - a photo, a note, an empty text file - so it can be
    triggered from the OneDrive mobile app, from the MacBook, or by an
    automation such as Zapier.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'sync-config.json')
)

$ErrorActionPreference = 'Stop'

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json

$reg = 'HKCU:\Software\Microsoft\OneDrive\Accounts\Personal'
$oneDrive = if (Test-Path -LiteralPath $reg) { (Get-ItemProperty -LiteralPath $reg).UserFolder } else { $env:OneDriveConsumer }
if (-not $oneDrive -or -not (Test-Path -LiteralPath $oneDrive)) {
    Write-Host 'Personal OneDrive not found; nothing to watch.'
    exit 0
}

$stageName = if ($config.stageFolderName) { $config.stageFolderName } else { 'PersonalSync' }
$inbox     = Join-Path $oneDrive "$stageName\_status\inbox"
$claimed   = Join-Path $inbox '.claimed'

if (-not (Test-Path -LiteralPath $inbox)) { exit 0 }
if (-not (Test-Path -LiteralPath $claimed)) { New-Item -ItemType Directory -Path $claimed -Force | Out-Null }

$triggers = @(Get-ChildItem -LiteralPath $inbox -File -ErrorAction SilentlyContinue)
if (-not $triggers.Count) { exit 0 }

Write-Host "Trigger detected ($($triggers.Count) file(s)). Running sync on demand."

foreach ($t in $triggers) {
    $target = Join-Path $claimed ('{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $t.Name)
    try { Move-Item -LiteralPath $t.FullName -Destination $target -Force } catch { Remove-Item -LiteralPath $t.FullName -Force -ErrorAction SilentlyContinue }
}

# Keep the claimed folder from growing without bound.
Get-ChildItem -LiteralPath $claimed -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

& (Join-Path $PSScriptRoot 'Sync-PersonalFiles.ps1') -ConfigPath $ConfigPath -Reason 'on-demand'
exit $LASTEXITCODE
