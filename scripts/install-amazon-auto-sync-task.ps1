param(
  [string]$Time = "09:00",
  [string]$TimeZone = "Asia/Kolkata"
)

$ErrorActionPreference = 'Stop'
if ($Time -notmatch '^(?:[01]\d|2[0-3]):[0-5]\d$') { throw 'Time must use HH:MM 24-hour format.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot 'amazon-daily-sync.mjs'
$taskName = 'CDC Amazon Daily Sync'
$arguments = ('"{0}" --time {1} --timezone "{2}"' -f $script, $Time, $TimeZone)
$trigger = New-ScheduledTaskTrigger -Daily -At ([DateTime]::ParseExact($Time, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture))
$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $projectRoot
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description 'Daily CDC Amazon SP-API catalog, listings, and Account Health sync.' -Force | Out-Null

& $node $script --configure --time $Time --timezone $TimeZone
if ($LASTEXITCODE -ne 0) { throw 'Task was created, but the dashboard automation status could not be saved.' }

Write-Output "Created '$taskName' to run daily at $Time $TimeZone."
