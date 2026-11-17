$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputDir = Join-Path $projectRoot 'outputs'
[IO.Directory]::CreateDirectory($outputDir) | Out-Null
$zipPath = Join-Path $outputDir ("cdc-transfer-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
# These folders can be regenerated, or contain local credentials/runtime state.
$excludedDirs = @('node_modules', '.git', '.next', '.vinext', '.npm-cache', '.wrangler', '.auth', '.openai', '.codex', '.agents', '.aws', 'dist', 'build', 'out', 'outputs', 'work', 'coverage', 'data-store', '.vercel')
$script:fileCount = 0
$script:sourceBytes = 0L

function Add-ProjectDirectory([string]$directory, $archive) {
    foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
        if ($item.PSIsContainer) {
            if ($item.Name -notin $excludedDirs) { Add-ProjectDirectory $item.FullName $archive }
            continue
        }
        if ($item.Name -like '.env*' -or $item.Extension -in @('.zip', '.7z', '.log', '.pem', '.key', '.tsbuildinfo')) { continue }
        $entryName = $item.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $script:fileCount++
        $script:sourceBytes += $item.Length
    }
}

$archive = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
try { Add-ProjectDirectory $projectRoot $archive }
finally { $archive.Dispose() }
$zipBytes = (Get-Item -LiteralPath $zipPath).Length
Write-Host ("Created: {0}" -f $zipPath)
Write-Host ("Files: {0} | Original: {1:N2} MB | ZIP: {2:N2} MB" -f $script:fileCount, ($script:sourceBytes / 1MB), ($zipBytes / 1MB))
Write-Host 'On the receiving computer: extract, configure .env, then run npm ci.'
