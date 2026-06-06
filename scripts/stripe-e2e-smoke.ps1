param(
    [string]$ApiBaseUrl = 'http://127.0.0.1:3001/api/v1',
    [string]$CompanySlug = 'onboarding-smoke-restaurant',
    [string]$OwnerEmail = 'smoke.owner@example.com',
    [string]$OwnerPassword = 'StrongPass123!',
    [int]$FakeStripePort = 18181,
    [string]$WebhookSecret = 'whsec_local_test_secret'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'
$apiProcess = $null
$stripeProcess = $null

function Start-HiddenProcess {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.Arguments = ($Arguments | ForEach-Object {
        '"' + ($_ -replace '"', '\"') + '"'
    }) -join ' '
    return [System.Diagnostics.Process]::Start($startInfo)
}

function Wait-ForHttp {
    param([string]$Url, [int]$Seconds = 30)

    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return
        } catch {
            Start-Sleep -Milliseconds 300
        }
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for $Url"
}

function New-StripeSignature {
    param([string]$Payload)

    $previousPayload = $env:STRIPE_TEST_PAYLOAD
    $previousSecret = $env:STRIPE_TEST_SECRET
    try {
        $env:STRIPE_TEST_PAYLOAD = $Payload
        $env:STRIPE_TEST_SECRET = $WebhookSecret
        return & $node -e "const Stripe=require('stripe');process.stdout.write(Stripe.webhooks.generateTestHeaderString({payload:process.env.STRIPE_TEST_PAYLOAD,secret:process.env.STRIPE_TEST_SECRET}));"
    } finally {
        $env:STRIPE_TEST_PAYLOAD = $previousPayload
        $env:STRIPE_TEST_SECRET = $previousSecret
    }
}

function Send-StripeEvent {
    param(
        [string]$EventId,
        [string]$EventType,
        [object]$Order,
        [object]$Checkout,
        [string]$PaymentStatus,
        [int]$AmountOverride = -1
    )

    $eventAmount = if ($AmountOverride -ge 0) {
        $AmountOverride
    } else {
        $Checkout.amountCents
    }
    $event = @{
        id = $EventId
        object = 'event'
        type = $EventType
        created = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        livemode = $false
        data = @{
            object = @{
                id = $Checkout.checkoutSessionId
                object = 'checkout.session'
                amount_total = $eventAmount
                client_reference_id = $Order.orderId
                currency = $Checkout.currency.ToLowerInvariant()
                metadata = @{
                    amount_cents = [string]$Checkout.amountCents
                    company_id = $script:login.user.companyId
                    order_id = $Order.orderId
                    order_number = $Order.orderNumber
                    outlet_id = $script:outletId
                    payment_attempt_id = $Checkout.paymentId
                    source = 'qr'
                }
                payment_intent = "pi_smoke_$EventId"
                payment_status = $PaymentStatus
                status = 'complete'
            }
        }
    }
    $payload = $event | ConvertTo-Json -Depth 10 -Compress
    $signature = New-StripeSignature -Payload $payload
    return Invoke-RestMethod `
        -Uri "$ApiBaseUrl/webhooks/stripe" `
        -Method Post `
        -Headers @{ 'Stripe-Signature' = $signature } `
        -ContentType 'application/json' `
        -Body $payload
}

try {
    $env:FAKE_STRIPE_PORT = [string]$FakeStripePort
    $stripeProcess = Start-HiddenProcess `
        -FilePath $node `
        -Arguments @((Join-Path $PSScriptRoot 'fake-stripe-server.mjs')) `
        -WorkingDirectory $repoRoot

    $env:STRIPE_SECRET_KEY = 'sk_test_local'
    $env:STRIPE_WEBHOOK_SECRET = $WebhookSecret
    $env:STRIPE_API_HOST = '127.0.0.1'
    $env:STRIPE_API_PORT = [string]$FakeStripePort
    $env:STRIPE_API_PROTOCOL = 'http'
    $apiProcess = Start-HiddenProcess `
        -FilePath $node `
        -Arguments @('dist/main.js') `
        -WorkingDirectory (Join-Path $repoRoot 'apps/api')

    Wait-ForHttp -Url "$ApiBaseUrl/health"

    $script:login = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/auth/login" `
        -Method Post `
        -ContentType 'application/json' `
        -Body (@{
            companySlug = $CompanySlug
            email = $OwnerEmail
            password = $OwnerPassword
        } | ConvertTo-Json)
    $script:outletId = $login.user.outlets[0].id
    $auth = @{ Authorization = "Bearer $($login.accessToken)" }

    $invalidSignatureRejected = $false
    try {
        Invoke-RestMethod `
            -Uri "$ApiBaseUrl/webhooks/stripe" `
            -Method Post `
            -Headers @{ 'Stripe-Signature' = 'invalid' } `
            -ContentType 'application/json' `
            -Body '{"id":"evt_invalid","object":"event"}' | Out-Null
    } catch {
        $statusCode = [int]$_.Exception.Response.StatusCode
        if ($statusCode -ne 400) {
            throw
        }
        $invalidSignatureRejected = $true
    }
    if (-not $invalidSignatureRejected) {
        throw 'An invalid Stripe webhook signature was accepted.'
    }

    $zones = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/admin/outlets/$outletId/tables" `
        -Headers $auth
    $tableId = $zones[0].tables[0].id
    $rotated = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/admin/outlets/$outletId/tables/$tableId/qr/rotate" `
        -Method Post `
        -Headers $auth `
        -ContentType 'application/json' `
        -Body (@{ reason = 'Automated Stripe webhook smoke test.' } | ConvertTo-Json)
    $qrUri = [Uri]$rotated.qrUrl
    $qrParts = $qrUri.AbsolutePath.Trim('/').Split('/')
    $publicCode = $qrParts[-2]
    $token = $qrParts[-1]

    $qr = Invoke-RestMethod -Uri "$ApiBaseUrl/public/qr/$publicCode/$token"
    $menuItem = $qr.menu.version.categories[0].items[0]
    $requiredModifierOptionIds = @(
        $menuItem.itemModifierGroups |
            Where-Object { $_.modifierGroup.minSelect -gt 0 } |
            ForEach-Object { $_.modifierGroup.options[0].id }
    )
    $script:order = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/public/qr/$publicCode/$token/orders" `
        -Method Post `
        -Headers @{ 'Idempotency-Key' = [guid]::NewGuid().ToString() } `
        -ContentType 'application/json' `
        -Body (@{
            paymentMethod = 'STRIPE_CARD'
            items = @(@{
                menuItemId = $menuItem.id
                quantity = 1
                modifierOptionIds = $requiredModifierOptionIds
            })
        } | ConvertTo-Json -Depth 5)

    $checkoutHeaders = @{ 'Idempotency-Key' = [guid]::NewGuid().ToString() }
    $checkoutBody = @{
        paymentMethod = 'STRIPE_CARD'
        successUrl = 'http://localhost:3000/payment/success'
        cancelUrl = 'http://localhost:3000/payment/cancel'
    } | ConvertTo-Json
    $checkout = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/public/qr/$publicCode/$token/orders/$($order.orderId)/payment" `
        -Method Post `
        -Headers $checkoutHeaders `
        -ContentType 'application/json' `
        -Body $checkoutBody
    $checkoutReplay = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/public/qr/$publicCode/$token/orders/$($order.orderId)/payment" `
        -Method Post `
        -Headers $checkoutHeaders `
        -ContentType 'application/json' `
        -Body $checkoutBody
    if ($checkout.checkoutSessionId -ne $checkoutReplay.checkoutSessionId) {
        throw 'Checkout creation was not idempotent.'
    }

    $eventId = "evt_smoke_$([guid]::NewGuid().ToString('N'))"
    $first = Send-StripeEvent `
        -EventId $eventId `
        -EventType 'checkout.session.completed' `
        -Order $order `
        -Checkout $checkout `
        -PaymentStatus 'paid'
    if (-not $first.released) {
        throw 'The first paid webhook did not release the order.'
    }

    $duplicate = Send-StripeEvent `
        -EventId $eventId `
        -EventType 'checkout.session.completed' `
        -Order $order `
        -Checkout $checkout `
        -PaymentStatus 'paid'
    if (-not $duplicate.duplicate -or $duplicate.released) {
        throw 'Duplicate webhook handling failed.'
    }

    $secondEvent = Send-StripeEvent `
        -EventId "evt_smoke_$([guid]::NewGuid().ToString('N'))" `
        -EventType 'checkout.session.async_payment_succeeded' `
        -Order $order `
        -Checkout $checkout `
        -PaymentStatus 'paid'
    if ($secondEvent.released) {
        throw 'A second successful event released the kitchen twice.'
    }

    $finalOrder = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/admin/outlets/$outletId/orders/$($order.orderId)" `
        -Headers $auth
    if ($finalOrder.paymentStatus -ne 'PAID') {
        throw "Expected PAID order, got $($finalOrder.paymentStatus)."
    }
    if ($finalOrder.kitchenTickets.Count -ne 1) {
        throw "Expected one kitchen ticket, got $($finalOrder.kitchenTickets.Count)."
    }
    if ($finalOrder.printJobs.Count -ne 1) {
        throw "Expected one print job, got $($finalOrder.printJobs.Count)."
    }

    if (-not $qr.paymentAvailability.STRIPE_PAYNOW) {
        throw 'Stripe PayNow must be enabled for the PayNow smoke scenario.'
    }
    $payNowOrder = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/public/qr/$publicCode/$token/orders" `
        -Method Post `
        -Headers @{ 'Idempotency-Key' = [guid]::NewGuid().ToString() } `
        -ContentType 'application/json' `
        -Body (@{
            paymentMethod = 'STRIPE_PAYNOW'
            items = @(@{
                menuItemId = $menuItem.id
                quantity = 1
                modifierOptionIds = $requiredModifierOptionIds
            })
        } | ConvertTo-Json -Depth 5)
    $payNowCheckout = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/public/qr/$publicCode/$token/orders/$($payNowOrder.orderId)/payment" `
        -Method Post `
        -Headers @{ 'Idempotency-Key' = [guid]::NewGuid().ToString() } `
        -ContentType 'application/json' `
        -Body (@{
            paymentMethod = 'STRIPE_PAYNOW'
            successUrl = 'http://localhost:3000/payment/success'
            cancelUrl = 'http://localhost:3000/payment/cancel'
        } | ConvertTo-Json)
    $payNowProcessing = Send-StripeEvent `
        -EventId "evt_smoke_$([guid]::NewGuid().ToString('N'))" `
        -EventType 'checkout.session.completed' `
        -Order $payNowOrder `
        -Checkout $payNowCheckout `
        -PaymentStatus 'unpaid'
    if ($payNowProcessing.released) {
        throw 'An unpaid PayNow Checkout session released the kitchen.'
    }
    $processingOrder = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/admin/outlets/$outletId/orders/$($payNowOrder.orderId)" `
        -Headers $auth
    if ($processingOrder.paymentStatus -ne 'PROCESSING') {
        throw "Expected processing PayNow order, got $($processingOrder.paymentStatus)."
    }
    if ($processingOrder.kitchenTickets.Count -ne 0) {
        throw 'An unpaid PayNow order created a kitchen ticket.'
    }

    $payNowSuccess = Send-StripeEvent `
        -EventId "evt_smoke_$([guid]::NewGuid().ToString('N'))" `
        -EventType 'checkout.session.async_payment_succeeded' `
        -Order $payNowOrder `
        -Checkout $payNowCheckout `
        -PaymentStatus 'paid'
    if (-not $payNowSuccess.released) {
        throw 'The successful asynchronous PayNow event did not release the order.'
    }
    $paidPayNowOrder = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/admin/outlets/$outletId/orders/$($payNowOrder.orderId)" `
        -Headers $auth
    if (
        $paidPayNowOrder.paymentStatus -ne 'PAID' -or
        $paidPayNowOrder.kitchenTickets.Count -ne 1 -or
        $paidPayNowOrder.printJobs.Count -ne 1
    ) {
        throw 'The paid PayNow order did not produce exactly one kitchen release.'
    }

    $mismatchOrder = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/public/qr/$publicCode/$token/orders" `
        -Method Post `
        -Headers @{ 'Idempotency-Key' = [guid]::NewGuid().ToString() } `
        -ContentType 'application/json' `
        -Body (@{
            paymentMethod = 'STRIPE_CARD'
            items = @(@{
                menuItemId = $menuItem.id
                quantity = 1
                modifierOptionIds = $requiredModifierOptionIds
            })
        } | ConvertTo-Json -Depth 5)
    $mismatchCheckout = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/public/qr/$publicCode/$token/orders/$($mismatchOrder.orderId)/payment" `
        -Method Post `
        -Headers @{ 'Idempotency-Key' = [guid]::NewGuid().ToString() } `
        -ContentType 'application/json' `
        -Body $checkoutBody
    $mismatchEvent = Send-StripeEvent `
        -EventId "evt_smoke_$([guid]::NewGuid().ToString('N'))" `
        -EventType 'checkout.session.completed' `
        -Order $mismatchOrder `
        -Checkout $mismatchCheckout `
        -PaymentStatus 'paid' `
        -AmountOverride ($mismatchCheckout.amountCents + 1)
    $rejectedOrder = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/admin/outlets/$outletId/orders/$($mismatchOrder.orderId)" `
        -Headers $auth
    if (
        $mismatchEvent.released -or
        $rejectedOrder.paymentStatus -eq 'PAID' -or
        $rejectedOrder.kitchenTickets.Count -ne 0
    ) {
        throw 'An amount-mismatched Stripe event reached the kitchen.'
    }

    [pscustomobject]@{
        invalidSignatureRejected = $invalidSignatureRejected
        cardOrderId = $order.orderId
        cardPaymentStatus = $finalOrder.paymentStatus
        cardKitchenTickets = $finalOrder.kitchenTickets.Count
        duplicateEventIgnored = [bool]$duplicate.duplicate
        secondSuccessReleased = [bool]$secondEvent.released
        payNowOrderId = $payNowOrder.orderId
        payNowCompletedStatus = $processingOrder.paymentStatus
        payNowFinalStatus = $paidPayNowOrder.paymentStatus
        payNowKitchenTickets = $paidPayNowOrder.kitchenTickets.Count
        amountMismatchReleased = [bool]$mismatchEvent.released
        amountMismatchTickets = $rejectedOrder.kitchenTickets.Count
    }
} finally {
    foreach ($process in @($apiProcess, $stripeProcess)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }
    }
}
