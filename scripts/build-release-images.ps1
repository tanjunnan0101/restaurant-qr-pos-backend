param(
    [Parameter(Mandatory = $true)]
    [string]$Tag,
    [Parameter(Mandatory = $true)]
    [string]$CustomerApiBaseUrl,
    [string]$ApiImageName = 'restaurant-pos-api',
    [string]$MigrateImageName = 'restaurant-pos-migrate',
    [string]$CustomerWebImageName = 'restaurant-pos-customer-web'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
    Write-Host "Building $ApiImageName`:$Tag"
    docker build `
        -f infra/Dockerfile.api `
        -t "${ApiImageName}:$Tag" `
        .

    Write-Host "Building $MigrateImageName`:$Tag"
    docker build `
        -f infra/Dockerfile.migrate `
        -t "${MigrateImageName}:$Tag" `
        .

    Write-Host "Building $CustomerWebImageName`:$Tag with NEXT_PUBLIC_API_BASE_URL=$CustomerApiBaseUrl"
    docker build `
        -f infra/Dockerfile.customer-web `
        --build-arg "NEXT_PUBLIC_API_BASE_URL=$CustomerApiBaseUrl" `
        -t "${CustomerWebImageName}:$Tag" `
        .
} finally {
    Pop-Location
}
