#Requires -Version 5.1
<#
.SYNOPSIS
    Registers the two Task Scheduler jobs that keep the sync running.

.DESCRIPTION
    Both tasks are registered for the CURRENT USER with an interactive logon
    type, so no administrator rights are needed. That matters on a managed work
    laptop, and it is also required for correctness: the OneDrive sync client
    only runs inside your logged-on session, so a task running as SYSTEM would
    copy files into a folder that never uploads.

      PersonalSync-Nightly    daily at the chosen time. StartWhenAvailable
                              means a missed run (laptop off / lid shut) fires
                              as soon as the machine is back, which is the fix
                              for "it did not happen last night".

      PersonalSync-Watcher    every 15 minutes. Checks the OneDrive inbox for a
                              phone-initiated trigger file.

.PARAMETER At
    Nightly run time, 24h "HH:mm". Default 23:00.

.PARAMETER WatchIntervalMinutes
    How often to poll for a phone trigger. Default 15.

.PARAMETER Uninstall
    Remove both tasks and exit.

.EXAMPLE
    .\Install-SyncTasks.ps1
    .\Install-SyncTasks.ps1 -At 22:30
    .\Install-SyncTasks.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [ValidatePattern('^\d{1,2}:\d{2}$')]
    [string]$At = '23:00',

    [ValidateRange(5, 720)]
    [int]$WatchIntervalMinutes = 15,

    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$nightlyName = 'PersonalSync-Nightly'
$watcherName = 'PersonalSync-Watcher'

if ($Uninstall) {
    foreach ($name in @($nightlyName, $watcherName)) {
        if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Host "Removed $name"
        }
    }
    Write-Host 'Done. Your files and OneDrive folder are untouched.'
    exit 0
}

$syncScript  = Join-Path $PSScriptRoot 'Sync-PersonalFiles.ps1'
$watchScript = Join-Path $PSScriptRoot 'Watch-RunNow.ps1'
$configPath  = Join-Path $PSScriptRoot 'sync-config.json'

foreach ($p in @($syncScript, $watchScript)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "Missing script: $p" }
}
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Missing sync-config.json. Copy sync-config.example.json to sync-config.json and edit the source folders first."
}

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

# ---------------------------------------------------------------- nightly ---

$nightlyAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden ' +
    "-File `"$syncScript`" -ConfigPath `"$configPath`" -Reason scheduled"
)

$nightlyTrigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($At, 'H:mm', $null))

$nightlySettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $nightlyName `
    -Description 'Copies personal files into personal OneDrive and writes a run receipt.' `
    -Action $nightlyAction -Trigger $nightlyTrigger -Settings $nightlySettings -Principal $principal -Force | Out-Null

Write-Host "Registered $nightlyName (daily at $At, catches up on missed runs)"

# ---------------------------------------------------------------- watcher ---

$watchAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden ' +
    "-File `"$watchScript`" -ConfigPath `"$configPath`""
)

# Repetition with no explicit duration repeats indefinitely.
$watchTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Minutes $WatchIntervalMinutes)

$watchSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $watcherName `
    -Description 'Watches the OneDrive inbox for a phone-initiated sync trigger.' `
    -Action $watchAction -Trigger $watchTrigger -Settings $watchSettings -Principal $principal -Force | Out-Null

Write-Host "Registered $watcherName (every $WatchIntervalMinutes minutes)"

# ------------------------------------------------------------------ verify ---

Write-Host ''
Write-Host 'Verifying...'
Get-ScheduledTask -TaskName $nightlyName, $watcherName |
    Get-ScheduledTaskInfo |
    Format-Table TaskName, LastRunTime, LastTaskResult, NextRunTime -AutoSize

Write-Host 'Next: run a dry run, then a real first run:'
Write-Host "  .\Sync-PersonalFiles.ps1 -DryRun"
Write-Host "  Start-ScheduledTask -TaskName $nightlyName"
