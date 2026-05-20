$ErrorActionPreference = 'Stop'

# Reads version from package.json so this script never goes stale.
$pkgPath = Join-Path $PSScriptRoot 'package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$Image = 'hmip-hcu-homeconnect'
$Tag = $pkg.version
$Platform = 'linux/arm64'

$DistDir = Join-Path $PSScriptRoot 'dist'
if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }

$OutTar = Join-Path $DistDir "$Image-$Tag.tar"
$OutGz = "$OutTar.gz"

Write-Host '>> Ensuring buildx builder exists'
docker buildx inspect hcubuild *> $null
if ($LASTEXITCODE -ne 0) {
    docker buildx create --name hcubuild --use | Out-Null
} else {
    docker buildx use hcubuild | Out-Null
}

Write-Host ">> Building ${Image}:${Tag} for $Platform"
docker buildx build --platform $Platform --tag "${Image}:${Tag}" --load .
if ($LASTEXITCODE -ne 0) { throw 'docker buildx build failed' }

Write-Host ">> Saving image to $OutTar"
docker save "${Image}:${Tag}" -o $OutTar

Write-Host ">> Compressing to $OutGz"
if (Test-Path $OutGz) { Remove-Item $OutGz -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$in = [System.IO.File]::OpenRead($OutTar)
$outFs = [System.IO.File]::Create($OutGz)
$gz = New-Object System.IO.Compression.GZipStream($outFs, [System.IO.Compression.CompressionLevel]::Optimal)
try { $in.CopyTo($gz) } finally { $gz.Dispose(); $outFs.Dispose(); $in.Dispose() }
Remove-Item $OutTar -Force

# Mirror the latest tarball into the repo root and remove older ones.
Get-ChildItem -Path $PSScriptRoot -Filter "$Image-*.tar.gz" -File | ForEach-Object {
    if ($_.Name -ne (Split-Path $OutGz -Leaf)) {
        Remove-Item $_.FullName -Force
    }
}
Copy-Item -Path $OutGz -Destination (Join-Path $PSScriptRoot (Split-Path $OutGz -Leaf)) -Force

$RootCopy = Join-Path $PSScriptRoot (Split-Path $OutGz -Leaf)
Write-Host ">> Done:"
Write-Host "   $OutGz"
Write-Host "   $RootCopy"
Write-Host '   Upload this file in HCUweb -> Plugins -> Install from file.'
