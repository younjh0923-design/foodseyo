$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectId = "lucky-shadow-32441683"
$parentBranchId = "br-dark-cherry-awci0faj"
$cliVersion = "2.34.0"
$branchName =
  "c2-3-validation-$([DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmss'))"
$expiresAt = [DateTimeOffset]::UtcNow.AddHours(1).ToString("o")
$branchId = $null
$previousDatabaseUrl = $env:DATABASE_URL
$previousMigrationUrl = $env:DATABASE_MIGRATION_URL
$previousValidationFlag =
  $env:FOODSEYO_C2_3_EPHEMERAL_VALIDATION

function Resolve-Connection {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BranchId,
    [Parameter(Mandatory = $true)]
    [string]$RoleName,
    [Parameter(Mandatory = $true)]
    [bool]$Pooled
  )

  $arguments = @(
    "-y",
    "neonctl@$cliVersion",
    "connection-string",
    $BranchId,
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
    throw "The scoped C2.3 connection could not be resolved."
  }
  $connection = ($connectionOutput -join [Environment]::NewLine).Trim()
  if (-not $connection) {
    throw "The scoped C2.3 connection was empty."
  }
  return $connection
}

function Assert-BranchDeleted {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DeletedBranchId
  )

  $listOutput = & npx.cmd -y "neonctl@$cliVersion" branches list `
    --project-id $projectId `
    --output json `
    --no-analytics `
    --no-color
  if ($LASTEXITCODE -ne 0) {
    throw "The post-cleanup branch list could not be read."
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
  if (
    @($branches | Where-Object { $_.id -eq $DeletedBranchId }).Count -ne 0
  ) {
    throw "The exact C2.3 validation branch still exists."
  }
}

try {
  $createOutput = & npx.cmd -y "neonctl@$cliVersion" branches create `
    --project-id $projectId `
    --parent $parentBranchId `
    --name $branchName `
    --expires-at $expiresAt `
    --output json `
    --no-analytics `
    --no-color
  if ($LASTEXITCODE -ne 0) {
    throw "The isolated C2.3 Development branch could not be created."
  }
  $created = ($createOutput -join [Environment]::NewLine) |
    ConvertFrom-Json
  $branchId = $created.branch.id
  if ($branchId -notmatch "^br-[a-z0-9-]+$") {
    throw "The C2.3 validation branch returned an invalid branch ID."
  }

  $env:DATABASE_MIGRATION_URL = Resolve-Connection `
    -BranchId $branchId `
    -RoleName "foodseyo_migrator" `
    -Pooled $false
  & node --no-warnings `
    --disable-warning=MODULE_TYPELESS_PACKAGE_JSON `
    scripts/migrate-analysis-cache.mts
  if ($LASTEXITCODE -ne 0) {
    throw "The reviewed C2.3 migration rehearsal failed."
  }

  $env:DATABASE_URL = Resolve-Connection `
    -BranchId $branchId `
    -RoleName "foodseyo_runtime" `
    -Pooled $true
  $env:FOODSEYO_C2_3_EPHEMERAL_VALIDATION = "1"
  & node --no-warnings --conditions=react-server `
    --disable-warning=MODULE_TYPELESS_PACKAGE_JSON `
    scripts/verify-structured-menu-postgres.mts
  if ($LASTEXITCODE -ne 0) {
    throw "The controlled C2.3 PostgreSQL validation failed."
  }
  Write-Output "ephemeralBranchId=$branchId"
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  $env:DATABASE_MIGRATION_URL = $previousMigrationUrl
  $env:FOODSEYO_C2_3_EPHEMERAL_VALIDATION =
    $previousValidationFlag

  if ($branchId) {
    $null = & npx.cmd -y "neonctl@$cliVersion" branches delete `
      $branchId `
      --project-id $projectId `
      --output json `
      --no-analytics `
      --no-color
    if ($LASTEXITCODE -ne 0) {
      throw "The exact C2.3 validation branch could not be deleted."
    }
    Assert-BranchDeleted -DeletedBranchId $branchId
    Write-Output "ephemeralBranchCleanup=deleted-and-absent"
  }
}
