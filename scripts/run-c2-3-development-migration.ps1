$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectId = "lucky-shadow-32441683"
$developmentBranchId = "br-dark-cherry-awci0faj"
$cliVersion = "2.34.0"
$previousDatabaseUrl = $env:DATABASE_URL
$previousMigrationUrl = $env:DATABASE_MIGRATION_URL
$previousReadOnlyFlag =
  $env:FOODSEYO_C2_3_PERMANENT_DEVELOPMENT_READ_ONLY

function Resolve-Connection {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RoleName,
    [Parameter(Mandatory = $true)]
    [bool]$Pooled
  )

  $arguments = @(
    "-y",
    "neonctl@$cliVersion",
    "connection-string",
    $developmentBranchId,
    "--project-id",
    $projectId,
    "--role-name",
    $RoleName,
    "--ssl",
    "require",
    "--no-analytics",
    "--no-color"
  )
  if ($Pooled) {
    $arguments += "--pooled"
  }
  $connectionOutput = & npx.cmd @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "The permanent Development connection could not be resolved."
  }
  $connection = ($connectionOutput -join [Environment]::NewLine).Trim()
  if (-not $connection) {
    throw "The permanent Development connection was empty."
  }
  return $connection
}

try {
  $listOutput = & npx.cmd -y "neonctl@$cliVersion" branches list `
    --project-id $projectId `
    --output json `
    --no-analytics `
    --no-color
  if ($LASTEXITCODE -ne 0) {
    throw "The Neon branch inventory could not be read."
  }
  $parsed = ($listOutput -join [Environment]::NewLine) |
    ConvertFrom-Json
  $branches = if (
    $parsed.PSObject.Properties.Name -contains "branches"
  ) {
    @($parsed.branches)
  } else {
    @($parsed)
  }
  $target = @(
    $branches | Where-Object { $_.id -eq $developmentBranchId }
  )
  if ($target.Count -ne 1) {
    throw "The exact permanent Development branch is not unique."
  }

  $env:DATABASE_MIGRATION_URL = Resolve-Connection `
    -RoleName "foodseyo_migrator" `
    -Pooled $false
  & node --no-warnings `
    --disable-warning=MODULE_TYPELESS_PACKAGE_JSON `
    scripts/migrate-analysis-cache.mts
  if ($LASTEXITCODE -ne 0) {
    throw "The reviewed C2.3 permanent Development migration failed."
  }

  $env:DATABASE_URL = Resolve-Connection `
    -RoleName "foodseyo_runtime" `
    -Pooled $true
  $env:FOODSEYO_C2_3_PERMANENT_DEVELOPMENT_READ_ONLY = "1"
  & node --no-warnings --conditions=react-server `
    --disable-warning=MODULE_TYPELESS_PACKAGE_JSON `
    scripts/verify-structured-menu-development-state.mts
  if ($LASTEXITCODE -ne 0) {
    throw "The permanent Development read-only verification failed."
  }
  Write-Output "developmentBranchId=$developmentBranchId"
  Write-Output "previewAndProductionChanges=0"
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  $env:DATABASE_MIGRATION_URL = $previousMigrationUrl
  $env:FOODSEYO_C2_3_PERMANENT_DEVELOPMENT_READ_ONLY =
    $previousReadOnlyFlag
}
