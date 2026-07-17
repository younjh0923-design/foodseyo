$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectId = "lucky-shadow-32441683"
$parentBranchId = "br-dark-cherry-awci0faj"
$cliVersion = "2.34.0"
$validationRuns = 2

function Resolve-RuntimeConnection {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BranchId
  )

  $connectionOutput = & npx.cmd -y "neonctl@$cliVersion" connection-string `
    $BranchId `
    --project-id $projectId `
    --role-name foodseyo_runtime `
    --pooled `
    --ssl require `
    --no-analytics `
    --no-color
  if ($LASTEXITCODE -ne 0) {
    throw "The scoped runtime connection could not be resolved."
  }
  $connection = ($connectionOutput -join [Environment]::NewLine).Trim()
  if (-not $connection) {
    throw "The scoped runtime connection was empty."
  }
  return $connection
}

function Invoke-PermanentDevelopmentEmptyCheck {
  $previousDatabaseUrl = $env:DATABASE_URL
  $previousReadOnlyFlag =
    $env:FOODSEYO_C2_1_F_PERMANENT_DEVELOPMENT_READ_ONLY
  try {
    $env:DATABASE_URL = Resolve-RuntimeConnection -BranchId $parentBranchId
    $env:FOODSEYO_C2_1_F_PERMANENT_DEVELOPMENT_READ_ONLY = "1"
    & node --no-warnings --conditions=react-server `
      --disable-warning=MODULE_TYPELESS_PACKAGE_JSON `
      scripts/verify-analysis-cache-empty.mts
    if ($LASTEXITCODE -ne 0) {
      throw "The permanent Development read-only check failed."
    }
  } finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    $env:FOODSEYO_C2_1_F_PERMANENT_DEVELOPMENT_READ_ONLY =
      $previousReadOnlyFlag
  }
}

function Assert-BranchDeleted {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BranchId
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
  if (@($branches | Where-Object { $_.id -eq $BranchId }).Count -ne 0) {
    throw "The exact ephemeral validation branch still exists."
  }
}

function Invoke-EphemeralValidation {
  param(
    [Parameter(Mandatory = $true)]
    [int]$RunNumber
  )

  $branchName =
    "c2-1-f-validation-$([DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmss'))-$RunNumber"
  $expiresAt = [DateTimeOffset]::UtcNow.AddHours(1).ToString("o")
  $branchId = $null
  $previousDatabaseUrl = $env:DATABASE_URL
  $previousValidationFlag =
    $env:FOODSEYO_C2_1_F_EPHEMERAL_VALIDATION

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
      throw "The isolated Development validation branch could not be created."
    }

    $created = ($createOutput -join [Environment]::NewLine) |
      ConvertFrom-Json
    $branchId = $created.branch.id
    if ($branchId -notmatch "^br-[a-z0-9-]+$") {
      throw "The created validation branch did not return a valid branch ID."
    }

    $env:DATABASE_URL = Resolve-RuntimeConnection -BranchId $branchId
    $env:FOODSEYO_C2_1_F_EPHEMERAL_VALIDATION = "1"
    & node --no-warnings --conditions=react-server `
      --disable-warning=MODULE_TYPELESS_PACKAGE_JSON `
      scripts/verify-analysis-cache-postgres-concurrency.mts
    if ($LASTEXITCODE -ne 0) {
      throw "The controlled C2.1-F PostgreSQL validation failed."
    }
    Write-Output "ephemeralBranchId=$branchId"
  } finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    $env:FOODSEYO_C2_1_F_EPHEMERAL_VALIDATION =
      $previousValidationFlag

    if ($branchId) {
      $null = & npx.cmd -y "neonctl@$cliVersion" branches delete `
        $branchId `
        --project-id $projectId `
        --output json `
        --no-analytics `
        --no-color
      if ($LASTEXITCODE -ne 0) {
        throw "The exact ephemeral validation branch could not be deleted."
      }
      Assert-BranchDeleted -BranchId $branchId
      Write-Output "ephemeralBranchCleanup=deleted-and-absent"
    }
  }
}

Invoke-PermanentDevelopmentEmptyCheck
try {
  for ($run = 1; $run -le $validationRuns; $run += 1) {
    Invoke-EphemeralValidation -RunNumber $run
  }
} finally {
  Invoke-PermanentDevelopmentEmptyCheck
}
Write-Output "permanentDevelopmentApplicationRows=0"
Write-Output "ephemeralValidationBranchesRemaining=0"
