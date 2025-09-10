param(
  [string]$AppUrl = $env:APP_URL,
  [string]$Secret = $env:CONVOSO_WEBHOOK_SECRET
)
if (-not $AppUrl) { Write-Host "Set APP_URL env var or pass -AppUrl"; exit 1 }
if (-not $Secret) { Write-Host "Set CONVOSO_WEBHOOK_SECRET env var or pass -Secret"; exit 1 }

$uri = "$AppUrl/api/hooks/convoso"
$headers = @{ "x-webhook-secret" = $Secret; "Content-Type"="application/json" }
$body = @{
  lead_id = "L-POWERSHELL"
  customer_phone = "+15551234567"
  started_at = (Get-Date).AddMinutes(-2).ToUniversalTime().ToString("o")
  ended_at   = (Get-Date).ToUniversalTime().ToString("o")
  recording_url = "https://example-files.online-convert.com/audio/mp3/example.mp3"
  disposition = "Cancelled"
  campaign = "ACA-Q4"
  direction = "outbound"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body