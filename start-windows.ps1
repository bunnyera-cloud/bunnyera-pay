$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ".env")) { node scripts/setup.js }
Write-Host "YuanPay: http://localhost:8080" -ForegroundColor Green
Write-Host "Admin:   http://localhost:8080/admin.html" -ForegroundColor Green
Start-Process "http://localhost:8080"
node src/server.js
