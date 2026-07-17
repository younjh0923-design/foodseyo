$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectId = "lucky-shadow-32441683"
$parentBranchId = "br-dark-cherry-awci0faj"
$branchName = "c2-1-e-validation-$([DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmss'))"
$expiresAt = [DateTimeOffset]::UtcNow.AddHours(1).ToString("o")
$branchId = $null
$previousDatabaseUrl = $env:DATABASE_URL
$previousValidationFlag = $env:FOODSEYO_EPHEMERAL_DEVELOPMENT_VALIDATION

try {
  $createOutput = & npx.cmd -y neonctl@2.34.0 branches create `
    --project-id $projectId `
    --parent $parentBranchId `
    --name $branchName `
    --expires-at $expiresAt `
    --output json `
    --no-analytics `
    --no-color
  if ($LASTEXITCODE -ne 0) {
    throw "The isolated Development validation branch could not be created."
  }

  $created = ($createOutput -join [Environment]::NewLine) |
    ConvertFrom-Json
  $branchId = $created.branch.id
  if ($branchId -notmatch "^br-[a-z0-9-]+$") {
    throw "The created validation branch did not return a valid branch ID."
  }

  $connectionOutput = & npx.cmd -y neonctl@2.34.0 connection-string `
    $branchId `
    --project-id $projectId `
    --role-name foodseyo_runtime `
    --pooled `
    --ssl require `
    --no-analytics `
    --no-color
  if ($LASTEXITCODE -ne 0) {
    throw "The isolated runtime connection could not be resolved."
  }
  $databaseUrl = ($connectionOutput -join [Environment]::NewLine).Trim()
  if (-not $databaseUrl) {
    throw "The isolated runtime connection was empty."
  }

  $env:DATABASE_URL = $databaseUrl
  $env:FOODSEYO_EPHEMERAL_DEVELOPMENT_VALIDATION = "1"
  & node --no-warnings --conditions=react-server `
    --disable-warning=MODULE_TYPELESS_PACKAGE_JSON `
    scripts/verify-analysis-cache-integration.mts
  if ($LASTEXITCODE -ne 0) {
    throw "The controlled Development PostgreSQL validation failed."
  }
  Write-Output "ephemeralBranchId=$branchId"
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  $env:FOODSEYO_EPHEMERAL_DEVELOPMENT_VALIDATION =
    $previousValidationFlag

  if ($branchId) {
    $null = & npx.cmd -y neonctl@2.34.0 branches delete `
      $branchId `
      --project-id $projectId `
      --output json `
      --no-analytics `
      --no-color
    if ($LASTEXITCODE -ne 0) {
      throw "The exact ephemeral validation branch could not be deleted."
    }
    Write-Output "ephemeralBranchCleanup=deleted"
  }
}
