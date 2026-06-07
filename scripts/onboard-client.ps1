param(
    [Parameter(Mandatory = $true)]
    [string]$CompanyName,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')]
    [string]$CompanySlug,

    [Parameter(Mandatory = $true)]
    [string]$OwnerName,

    [Parameter(Mandatory = $true)]
    [string]$OwnerEmail,

    [Parameter(Mandatory = $true)]
    [string]$OutletName,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')]
    [string]$OutletSlug,

    [string]$LegalName,
    [string]$RegistrationNumber,
    [string]$Address,
    [string]$Phone,
    [switch]$DisableGst,
    [int]$GstRateBps = 900,
    [switch]$EnableServiceCharge,
    [int]$ServiceChargeBps = 1000,
    [Alias('DisableStripeCard')]
    [switch]$DisableOnlineCard,
    [switch]$EnableManualPayNow,
    [string]$ApiBaseUrl = 'http://localhost:3001/api/v1',
    [string]$PlatformKey = $env:PLATFORM_ADMIN_API_KEY,
    [string]$Operator = $env:USERNAME,
    [string]$IdempotencyKey = ([guid]::NewGuid().ToString())
)

if ([string]::IsNullOrWhiteSpace($PlatformKey)) {
    throw 'Set PLATFORM_ADMIN_API_KEY or pass -PlatformKey.'
}

$payload = @{
    companyName = $CompanyName
    companySlug = $CompanySlug
    ownerFullName = $OwnerName
    ownerEmail = $OwnerEmail
    outletName = $OutletName
    outletSlug = $OutletSlug
    gstEnabled = -not $DisableGst
    gstRateBps = $GstRateBps
    serviceChargeEnabled = [bool]$EnableServiceCharge
    serviceChargeBps = $ServiceChargeBps
    payments = @{
        onlinePaymentsEnabled = $true
        onlineCardEnabled = -not $DisableOnlineCard
        manualPayNowEnabled = [bool]$EnableManualPayNow
    }
}

foreach ($field in @(
    'LegalName',
    'RegistrationNumber',
    'Address',
    'Phone'
)) {
    $value = Get-Variable -Name $field -ValueOnly
    if (-not [string]::IsNullOrWhiteSpace($value)) {
        $jsonName = $field.Substring(0, 1).ToLowerInvariant() + $field.Substring(1)
        $payload[$jsonName] = $value
    }
}

$headers = @{
    'x-platform-key' = $PlatformKey
    'x-platform-operator' = if ($Operator) { $Operator } else { 'platform-admin' }
    'Idempotency-Key' = $IdempotencyKey
}

$response = Invoke-RestMethod `
    -Uri "$($ApiBaseUrl.TrimEnd('/'))/platform/onboarding/clients" `
    -Method Post `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body ($payload | ConvertTo-Json -Depth 5)

Write-Host "Client: $($response.client.company.name)"
Write-Host "Company login code: $($response.client.company.slug)"
Write-Host "Owner: $($response.client.owner.email)"
Write-Host "Outlet: $($response.client.firstOutlet.name)"
Write-Host "Setup: $($response.onboarding.completedSteps)/$($response.onboarding.totalSteps) steps complete"

if ($response.activation.url) {
    Write-Host ""
    Write-Host "Send this one-time activation link to the owner:"
    Write-Host $response.activation.url
} else {
    Write-Host ""
    Write-Host $response.activation.message
}
