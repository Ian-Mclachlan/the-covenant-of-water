#Requires -Version 5.1
<#
.SYNOPSIS
    Copies personal files from the HP laptop into the personal OneDrive staging
    folder, then writes a receipt so the run can be verified from a phone or Mac.

.DESCRIPTION
    One-way, additive copy. Nothing is ever deleted at the destination:
    robocopy runs without /MIR and without /PURGE by design. A file deleted or
    renamed on the laptop stays in OneDrive (and therefore on the MacBook).

    After copying, the script writes two receipts into the staging folder:
      _status\LAST-RUN.txt   human-readable, meant to be opened in the OneDrive
                             mobile app
      _status\last-run.json  machine-readable, for Claude / Zapier / scripts

.PARAMETER ConfigPath
    Path to sync-config.json. Defaults to the copy next to this script.

.PARAMETER Reason
    Why this run happened. Recorded in the receipt.
      scheduled  - fired by the nightly Task Scheduler job
      on-demand  - fired by Watch-RunNow.ps1 (phone-initiated)
      manual     - you ran it yourself

.PARAMETER DryRun
    Adds robocopy /L. Lists what would be copied and copies nothing.

.EXAMPLE
    .\Sync-PersonalFiles.ps1 -DryRun
    .\Sync-PersonalFiles.ps1 -Reason manual
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'sync-config.json'),

    [ValidateSet('scheduled', 'on-demand', 'manual')]
    [string]$Reason = 'manual',

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$script:StartedAt = Get-Date

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

function Write-Line {
    param([string]$Message, [string]$Level = 'INFO')
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "[$stamp] [$Level] $Message"
    Write-Host $line
    if ($script:LogFile) { Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8 }
}

function Resolve-PersonalOneDrive {
    <#
        The registry is authoritative. HKCU\...\OneDrive\Accounts\Personal only
        exists when a consumer (personal) account is signed in; the work/school
        account lives under Business1, Business2, ... so this cannot pick the
        wrong one.
    #>
    $reg = 'HKCU:\Software\Microsoft\OneDrive\Accounts\Personal'
    if (Test-Path -LiteralPath $reg) {
        $folder = (Get-ItemProperty -LiteralPath $reg -ErrorAction SilentlyContinue).UserFolder
        if ($folder -and (Test-Path -LiteralPath $folder)) { return $folder }
    }

    # Fallbacks, in confidence order. A commercial root is always named
    # "OneDrive - <Tenant>", so anything containing " - " is rejected here.
    foreach ($candidate in @($env:OneDriveConsumer, $env:OneDrive, (Join-Path $env:USERPROFILE 'OneDrive'))) {
        if ($candidate -and (Test-Path -LiteralPath $candidate) -and ($candidate -notmatch ' - ')) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Ensure-OneDriveRunning {
    if (Get-Process -Name 'OneDrive' -ErrorAction SilentlyContinue) { return $true }

    $exe = Join-Path $env:LOCALAPPDATA 'Microsoft\OneDrive\OneDrive.exe'
    if (Test-Path -LiteralPath $exe) {
        Write-Line 'OneDrive was not running. Starting it.' 'WARN'
        Start-Process -FilePath $exe -ArgumentList '/background' -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 10
        return [bool](Get-Process -Name 'OneDrive' -ErrorAction SilentlyContinue)
    }
    Write-Line "OneDrive.exe not found at $exe" 'ERROR'
    return $false
}

function Get-RoboStatus {
    param([int]$Code)
    # 0  nothing to copy      1  files copied      2  extra files at dest
    # 4  mismatches           8+ at least one copy failed
    if ($Code -ge 8) { return 'FAILED' }
    if ($Code -ge 4) { return 'WARN' }
    return 'OK'
}

function Format-Size {
    param([double]$Bytes)
    if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N0} KB' -f ($Bytes / 1KB)) }
    return "$([int]$Bytes) B"
}

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Config not found: $ConfigPath  (copy sync-config.example.json to sync-config.json and edit it)"
}
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json

$oneDrive = Resolve-PersonalOneDrive
if (-not $oneDrive) {
    throw 'Could not locate the PERSONAL OneDrive folder. Sign in to the personal OneDrive account on this machine, then re-run. (A work/school "OneDrive - Company" folder will not be used.)'
}

$stageRoot = if ($config.stageFolderName) { Join-Path $oneDrive $config.stageFolderName } else { Join-Path $oneDrive 'PersonalSync' }
$statusDir = Join-Path $stageRoot '_status'
$logDir    = Join-Path $env:LOCALAPPDATA 'PersonalSync\logs'

foreach ($dir in @($stageRoot, $statusDir, $logDir, (Join-Path $statusDir 'inbox'))) {
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

$script:LogFile = Join-Path $logDir ('sync-{0}.log' -f (Get-Date -Format 'yyyy-MM'))

Write-Line "=== Personal file sync starting (reason: $Reason, dry-run: $DryRun) ==="
Write-Line "Personal OneDrive : $oneDrive"
Write-Line "Staging folder    : $stageRoot"

[void](Ensure-OneDriveRunning)

# --------------------------------------------------------------------------
# Copy each configured source
# --------------------------------------------------------------------------

$excludeDirs  = @($config.excludeDirs)  | Where-Object { $_ }
$excludeFiles = @($config.excludeFiles) | Where-Object { $_ }

$results = @()

foreach ($source in $config.sources) {
    $srcPath = [Environment]::ExpandEnvironmentVariables($source.path)
    $dstPath = Join-Path $stageRoot $source.name

    if (-not (Test-Path -LiteralPath $srcPath)) {
        Write-Line "SKIP '$($source.name)': source path does not exist ($srcPath)" 'WARN'
        $results += [pscustomobject]@{
            Name = $source.name; Status = 'MISSING'; ExitCode = -1
            FilesCopied = 0; BytesCopied = 0; Source = $srcPath
        }
        continue
    }

    Write-Line "Copying '$($source.name)': $srcPath  ->  $dstPath"

    $roboArgs = @(
        $srcPath, $dstPath, '*.*',
        '/E',        # include subdirectories, including empty ones
        '/XO',       # skip destination files that are already newer or identical
        '/FFT',      # 2-second timestamp granularity (cloud/FAT friendly)
        '/XJ',       # do not follow junctions - avoids infinite recursion
        '/DCOPY:DAT',
        '/R:2', '/W:5',
        '/NP', '/NDL',
        '/BYTES',    # raw byte counts in the summary, so it parses cleanly
        '/MT:8'
    )
    if ($config.maxFileMB -and $config.maxFileMB -gt 0) {
        $roboArgs += "/MAX:$([int64]$config.maxFileMB * 1MB)"
    }
    if ($excludeDirs.Count)  { $roboArgs += '/XD'; $roboArgs += $excludeDirs }
    if ($excludeFiles.Count) { $roboArgs += '/XF'; $roboArgs += $excludeFiles }
    if ($DryRun) { $roboArgs += '/L' }

    $output = & robocopy.exe @roboArgs 2>&1
    $code = $LASTEXITCODE

    Add-Content -LiteralPath $script:LogFile -Value ($output -join [Environment]::NewLine) -Encoding UTF8

    $filesCopied = 0
    $bytesCopied = 0
    foreach ($line in $output) {
        if ($line -match '^\s*Files\s*:\s+(\d+)\s+(\d+)') { $filesCopied = [int]$Matches[2] }
        if ($line -match '^\s*Bytes\s*:\s+(\d+)\s+(\d+)') { $bytesCopied = [int64]$Matches[2] }
    }

    $status = Get-RoboStatus -Code $code
    Write-Line "  '$($source.name)' -> $status (robocopy $code): $filesCopied file(s), $(Format-Size $bytesCopied)"

    $results += [pscustomobject]@{
        Name = $source.name; Status = $status; ExitCode = $code
        FilesCopied = $filesCopied; BytesCopied = $bytesCopied; Source = $srcPath
    }
}

# --------------------------------------------------------------------------
# Overall verdict
# --------------------------------------------------------------------------

$totalFiles = ($results | Measure-Object -Property FilesCopied -Sum).Sum
$totalBytes = ($results | Measure-Object -Property BytesCopied -Sum).Sum
if (-not $totalFiles) { $totalFiles = 0 }
if (-not $totalBytes) { $totalBytes = 0 }

$overall = 'OK'
if ($results | Where-Object { $_.Status -eq 'WARN' -or $_.Status -eq 'MISSING' }) { $overall = 'WARN' }
if ($results | Where-Object { $_.Status -eq 'FAILED' }) { $overall = 'FAILED' }

$finishedAt = Get-Date
$duration = [int]($finishedAt - $script:StartedAt).TotalSeconds

# What did the Mac last report back? (written by pull-from-onedrive.sh)
$macReceiptPath = Join-Path $statusDir 'mac-last-pull.json'
$macSummary = 'never reported'
if (Test-Path -LiteralPath $macReceiptPath) {
    try {
        $mac = Get-Content -LiteralPath $macReceiptPath -Raw | ConvertFrom-Json
        $macSummary = "$($mac.finishedAt) - $($mac.filesPulled) file(s), $($mac.result)"
    } catch {
        $macSummary = 'receipt present but unreadable'
    }
}

$nextRun = 'unknown'
try {
    $task = Get-ScheduledTask -TaskName 'PersonalSync-Nightly' -ErrorAction SilentlyContinue
    if ($task) {
        $info = $task | Get-ScheduledTaskInfo
        if ($info.NextRunTime) { $nextRun = $info.NextRunTime.ToString('yyyy-MM-dd HH:mm') }
    }
} catch { }

# --------------------------------------------------------------------------
# Receipts
# --------------------------------------------------------------------------

if (-not $DryRun) {

    $perSource = ($results | ForEach-Object { "  {0,-18} {1,-8} {2} file(s)" -f $_.Name, $_.Status, $_.FilesCopied }) -join [Environment]::NewLine

    $txt = @"
PERSONAL FILE SYNC - LAST RUN RECEIPT
=====================================

RESULT      : $overall
FINISHED    : $($finishedAt.ToString('yyyy-MM-dd HH:mm:ss')) ($([System.TimeZoneInfo]::Local.Id))
TRIGGER     : $Reason
COPIED      : $totalFiles new/updated file(s), $(Format-Size $totalBytes)
DURATION    : $duration second(s)
LAPTOP      : $env:COMPUTERNAME
NEXT RUN    : $nextRun

PER FOLDER
$perSource

MACBOOK LAST PULLED
  $macSummary

If RESULT is not OK, or FINISHED is more than ~26 hours old, the nightly job
did not run. See the troubleshooting table in HANDOFF.md.

To force a run from your phone: put any file into
  $($config.stageFolderName)\_status\inbox\
The laptop checks that folder every 15 minutes while it is awake.
"@

    Set-Content -LiteralPath (Join-Path $statusDir 'LAST-RUN.txt') -Value $txt -Encoding UTF8

    $json = [pscustomobject]@{
        result       = $overall
        trigger      = $Reason
        startedAt    = $script:StartedAt.ToString('o')
        finishedAt   = $finishedAt.ToString('o')
        durationSec  = $duration
        filesCopied  = $totalFiles
        bytesCopied  = $totalBytes
        laptop       = $env:COMPUTERNAME
        nextRun      = $nextRun
        stageRoot    = $stageRoot
        sources      = $results
        schemaVersion = 1
    }
    $json | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $statusDir 'last-run.json') -Encoding UTF8

    Write-Line "Receipts written to $statusDir"
}

Write-Line "=== Finished: $overall - $totalFiles file(s), $(Format-Size $totalBytes), ${duration}s ==="

# Non-zero exit only on real failure, so Task Scheduler's "Last Run Result"
# column stays meaningful.
if ($overall -eq 'FAILED') { exit 1 }
exit 0
