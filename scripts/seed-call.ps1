# seed-call.ps1 - Windows PowerShell variant to seed a test call
$ErrorActionPreference = "Stop"

# Load environment variables
$envPath = Join-Path $PSScriptRoot ".env"
$envExamplePath = Join-Path $PSScriptRoot ".env.example"

if (Test-Path $envPath) {
    Get-Content $envPath | Where-Object { $_ -match '^[^#].*=' } | ForEach-Object {
        $name, $value = $_.Split('=', 2)
        Set-Variable -Name $name.Trim() -Value $value.Trim() -Scope Script
    }
} elseif (Test-Path $envExamplePath) {
    Write-Error "Error: .env not found. Copy .env.example to .env and configure it."
    exit 1
}

# Validate required variables
if (-not $APP_URL -or -not $WEBHOOK_SECRET) {
    Write-Error "Error: APP_URL and WEBHOOK_SECRET must be set in .env"
    exit 1
}

# Generate a test call ID
$CALL_ID = [guid]::NewGuid().ToString()

# Create timestamps
$startTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$endTime = (Get-Date).AddMinutes(2).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Create sample Convoso payload
$payload = @{
    id = $CALL_ID
    agent_name = "Test Agent"
    agent_team = "QA Team"
    customer_phone = "+15551234567"
    started_at = $startTime
    ended_at = $endTime
    duration_sec = 120
    disposition = "SALE"
    campaign = "Test Campaign"
    direction = "outbound"
    recording_url = "https://example.com/test-recording.mp3"
} | ConvertTo-Json

Write-Host "Seeding call with ID: $CALL_ID"
Write-Host "Payload: $payload"
Write-Host ""

# Send webhook request
$headers = @{
    "Content-Type" = "application/json"
    "x-webhook-secret" = $WEBHOOK_SECRET
}

try {
    $response = Invoke-RestMethod -Uri "$APP_URL/api/hooks/convoso" `
        -Method Post `
        -Headers $headers `
        -Body $payload
    
    Write-Host "Response: $($response | ConvertTo-Json)"
} catch {
    Write-Host "Error: $_"
}

Write-Host ""
Write-Host "Call ID: $CALL_ID"
Write-Host "Save this ID for subsequent tests"