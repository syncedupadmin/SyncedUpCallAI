# Convoso Integration Test Probe for PowerShell

# Set webhook secret (change as needed)
$env:WEBHOOK_SECRET = if ($env:WEBHOOK_SECRET) { $env:WEBHOOK_SECRET } else { "test-secret" }
$BASE_URL = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:3003" }

Write-Host "🔍 Convoso Integration Test Probe" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "Base URL: $BASE_URL"
Write-Host ""

# Test 1: Lead webhook (no call fields)
Write-Host "📧 Test 1: Lead webhook..." -ForegroundColor Yellow
$leadBody = @{
    lead_id = "L123"
    first_name = "Cesar"
    last_name = "Tiscareno"
    phone_number = "+19545551234"
    email = "c@x.com"
    address = "123 A St"
    city = "Miami"
    state = "FL"
    list_id = "99"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/webhooks/convoso" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "X-Webhook-Secret" = $env:WEBHOOK_SECRET
        } `
        -Body $leadBody
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Call webhook (has call fields)
Write-Host "📞 Test 2: Call webhook..." -ForegroundColor Yellow
$callBody = @{
    call_id = "C777"
    lead_id = "L123"
    agent_name = "Morgan Tate"
    disposition = "SALE"
    duration = 487
    campaign = "U65-Q4"
    recording_url = ""
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/webhooks/convoso-calls" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "X-Webhook-Secret" = $env:WEBHOOK_SECRET
        } `
        -Body $callBody
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 3: Cron fetcher
Write-Host "⏰ Test 3: Cron fetcher..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/cron/process-recordings-v2"
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 4: Status check
Write-Host "📊 Test 4: Status check..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/webhooks/status"
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Tests complete!" -ForegroundColor Green