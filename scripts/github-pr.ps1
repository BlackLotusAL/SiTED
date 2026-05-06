param(
  [string]$BaseBranch = "",
  [string]$Title = "",
  [string]$BodyFile = "",
  [switch]$Draft,
  [switch]$RebaseMerge,
  [switch]$DeleteBranch
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "Required command '$Name' was not found on PATH."
  }
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  Write-Host "> $FilePath $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "Command failed: $FilePath $($Arguments -join ' ')"
  }
}

function Format-CommandOutput([AllowEmptyCollection()][object[]]$Output) {
  if ($null -eq $Output -or $Output.Count -eq 0) {
    return ""
  }

  return (($Output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Get-OriginRepoFullName {
  $remoteUrl = Format-CommandOutput @(git remote get-url origin)

  if ($remoteUrl -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(\.git)?$") {
    return "$($Matches.owner)/$($Matches.repo)"
  }

  Fail "Could not parse GitHub repository from origin remote: $remoteUrl"
}

function Get-DefaultBaseBranch {
  $originHead = ""
  try {
    $originHead = Format-CommandOutput @(git symbolic-ref --short refs/remotes/origin/HEAD 2>$null)
  } catch {
    $originHead = ""
  }

  if ($originHead -match "^origin/(?<branch>.+)$") {
    return $Matches.branch
  }

  return "main"
}

function Get-TokenForGh {
  if (-not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)) {
    return $false
  }

  Write-Host "Paste a GitHub token with PR permissions. Input is hidden and will not be stored." -ForegroundColor Yellow
  $secureToken = Read-Host "GH_TOKEN" -AsSecureString
  $token = [System.Net.NetworkCredential]::new("", $secureToken).Password

  if ([string]::IsNullOrWhiteSpace($token)) {
    Fail "GH_TOKEN cannot be empty."
  }

  $env:GH_TOKEN = $token
  return $true
}

function New-DefaultBodyFile([string]$BranchName, [string]$BaseName) {
  $commitSubject = Format-CommandOutput @(git log -1 --pretty=%s)
  $commitSha = Format-CommandOutput @(git rev-parse --short HEAD)
  $bodyPath = Join-Path ([System.IO.Path]::GetTempPath()) "sited-pr-body-$commitSha.md"

  @"
## Summary
- $commitSubject

## Branch
- Head: ``$BranchName``
- Base: ``$BaseName``
- Commit: ``$commitSha``

## Validation
- Run the relevant project checks before merging.
"@ | Set-Content -LiteralPath $bodyPath -Encoding UTF8

  return $bodyPath
}

Require-Command "git"
Require-Command "gh"

$repoRoot = Format-CommandOutput @(git rev-parse --show-toplevel)
Set-Location $repoRoot

$branch = Format-CommandOutput @(git branch --show-current)
if ([string]::IsNullOrWhiteSpace($branch)) {
  Fail "Detached HEAD is not supported. Check out a branch first."
}

if ($branch -eq "main" -or $branch -eq "master") {
  Fail "Refusing to create a PR from '$branch'. Create or check out a feature branch first."
}

$dirty = Format-CommandOutput @(git status --porcelain)
if (-not [string]::IsNullOrWhiteSpace($dirty)) {
  Fail "Working tree is not clean. Commit or stash changes before running this script."
}

$repoFullName = Get-OriginRepoFullName
if ([string]::IsNullOrWhiteSpace($BaseBranch)) {
  $BaseBranch = Get-DefaultBaseBranch
}

if ([string]::IsNullOrWhiteSpace($Title)) {
  $Title = Format-CommandOutput @(git log -1 --pretty=%s)
}

if ([string]::IsNullOrWhiteSpace($BodyFile)) {
  $BodyFile = New-DefaultBodyFile -BranchName $branch -BaseName $BaseBranch
}

if (-not (Test-Path -LiteralPath $BodyFile)) {
  Fail "PR body file does not exist: $BodyFile"
}

$tokenWasPrompted = Get-TokenForGh

try {
  $viewer = Format-CommandOutput @(gh api user --jq ".login")
  Write-Host "Using GitHub token for: $viewer" -ForegroundColor Green

  Invoke-Checked "git" @("push", "-u", "origin", $branch)

  $existingPrNumber = Format-CommandOutput @(gh pr list --repo $repoFullName --head $branch --state open --json number --jq ".[0].number" 2>$null)

  if ([string]::IsNullOrWhiteSpace($existingPrNumber)) {
    $createArgs = @(
      "pr", "create",
      "--repo", $repoFullName,
      "--base", $BaseBranch,
      "--head", $branch,
      "--title", $Title,
      "--body-file", $BodyFile
    )

    if ($Draft) {
      $createArgs += "--draft"
    }

    Invoke-Checked "gh" $createArgs
    $existingPrNumber = Format-CommandOutput @(gh pr list --repo $repoFullName --head $branch --state open --json number --jq ".[0].number")
  } else {
    Write-Host "Open PR already exists: #$existingPrNumber" -ForegroundColor Yellow
  }

  $prUrl = Format-CommandOutput @(gh pr view $existingPrNumber --repo $repoFullName --json url --jq ".url")
  Write-Host "PR: $prUrl" -ForegroundColor Green

  if ($RebaseMerge) {
    $mergeArgs = @("pr", "merge", $existingPrNumber, "--repo", $repoFullName, "--rebase")
    if ($DeleteBranch) {
      $mergeArgs += "--delete-branch"
    }

    Invoke-Checked "gh" $mergeArgs
    Write-Host "Merged with rebase: #$existingPrNumber" -ForegroundColor Green
  }
} finally {
  if ($tokenWasPrompted) {
    Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
  }
}
