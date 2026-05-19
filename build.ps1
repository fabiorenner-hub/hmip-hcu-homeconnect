$ErrorActionPreference = 'Stop'

$Image = 'hmip-hcu-homeconnect'
$Tag = '0.5.0'
$Platform = 'linux/arm64'
$Out = "$Image-$Tag.tar"
$OutGz = "$Out.gz"

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

Write-Host ">> Saving image to $Out"
docker save "${Image}:${Tag}" -o $Out

Write-Host ">> Compressing to $OutGz"
[System.IO.Directory]::SetCurrentDirectory((Get-Location).Path)
if (Test-Path $OutGz) { Remove-Item $OutGz -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$in = [System.IO.File]::OpenRead((Resolve-Path $Out))
$outFs = [System.IO.File]::Create((Join-Path (Get-Location) $OutGz))
$gz = New-Object System.IO.Compression.GZipStream($outFs, [System.IO.Compression.CompressionLevel]::Optimal)
try { $in.CopyTo($gz) } finally { $gz.Dispose(); $outFs.Dispose(); $in.Dispose() }
Remove-Item $Out -Force

Write-Host ">> Done: $(Resolve-Path $OutGz)"
Write-Host '   Upload this file in HCUweb -> Plugins -> Install from file.'
