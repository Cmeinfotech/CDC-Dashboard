param(
  [int]$IntervalMinutes = 30,
  [string]$TimeZone = "Asia/Kolkata"
)

$ErrorActionPreference = 'Stop'
if ($IntervalMinutes -lt 5 -or $IntervalMinutes -gt 1440) { throw 'IntervalMinutes must be between 5 and 1440.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot 'amazon-daily-sync.mjs'
$hiddenRunner = Join-Path $PSScriptRoot 'run-amazon-daily-sync-hidden.vbs'
$taskName = 'CDC Amazon Daily Sync'
$arguments = ('"{0}" "{1}" "{2}" --interval-minutes {3} --timezone "{4}"' -f $hiddenRunner, $node, $script, $IntervalMinutes, $TimeZone)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($IntervalMinutes) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument $arguments -WorkingDirectory $projectRoot
$settings = New-ScheduledTaskSettingsSet -Priority 4 -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 0 -ExecutionTimeLimit (New-TimeSpan -Minutes ($IntervalMinutes - 1))
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'CDC Amazon SP-API catalog, listings, Account Health, and recent orders sync.' -Force -ErrorAction Stop | Out-Null

& $node $script --configure --interval-minutes $IntervalMinutes --timezone $TimeZone
if ($LASTEXITCODE -ne 0) { throw 'Task was created, but the dashboard automation status could not be saved.' }

Write-Output "Created '$taskName' to run every $IntervalMinutes minutes ($TimeZone). First scheduled run starts in $IntervalMinutes minutes; an on-demand run can be started immediately."
