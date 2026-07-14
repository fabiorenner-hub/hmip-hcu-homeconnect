$ErrorActionPreference = 'Stop'

# Publishes an EXPERIMENTAL OTA payload as the rolling `experimental` prerelease.
# Does NOT bump the version number and does NOT push git — per release rules.

$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    Write-Host '>> Building app bundle'
    node scripts/build-bundle.mjs
    if ($LASTEXITCODE -ne 0) { throw 'build-bundle failed' }

    Write-Host '>> Building experimental OTA payload'
    node scripts/build-ota.mjs experimental
    if ($LASTEXITCODE -ne 0) { throw 'build-ota (experimental) failed' }

    $bundle = Join-Path $root 'dist/ota/homeconnect-ota-exp.json'
    $manifest = Join-Path $root 'dist/ota/ota-manifest-exp.json'
    if (-not (Test-Path $bundle) -or -not (Test-Path $manifest)) { throw 'OTA assets missing' }

    # Ensure the rolling prerelease exists.
    gh release view experimental *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host '>> Creating rolling prerelease "experimental"'
        gh release create experimental --prerelease --title 'Experimental (rolling)' `
            --notes 'Rolling experimental OTA channel. Not for production. Install the stable .tar.gz for normal use.'
        if ($LASTEXITCODE -ne 0) { throw 'gh release create failed' }
    }

    Write-Host '>> Uploading experimental OTA assets (clobber)'
    gh release upload experimental $bundle $manifest --clobber
    if ($LASTEXITCODE -ne 0) { throw 'gh release upload failed' }

    Write-Host '>> Done. Experimental OTA published (no version bump, no git push).'
}
finally {
    Pop-Location
}
