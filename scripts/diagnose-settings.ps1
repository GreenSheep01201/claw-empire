[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$RepoRoot = "",
  [string]$TargetHost = "127.0.0.1",
  [int]$Port = 8790,
  [int]$StartupTimeoutSec = 45,
  [switch]$UseExistingBackend,
  [switch]$SkipPut,
  [switch]$SkipHttp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $scriptPath = $MyInvocation.MyCommand.Path
  $scriptDir = Split-Path -Parent $scriptPath
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
}

$baseUri = "http://{0}:{1}" -f $TargetHost, $Port
$results = New-Object System.Collections.Generic.List[object]
$backendProcess = $null
$backendStartedByScript = $false
$stderrLogPath = $null

function Get-BodySnippet {
  param(
    [AllowNull()]
    [AllowEmptyString()]
    [string]$Body,
    [int]$MaxLength = 160
  )

  if ([string]::IsNullOrWhiteSpace($Body)) {
    return "-"
  }

  $normalized = ($Body -replace "\s+", " ").Trim()
  if ($normalized.Length -le $MaxLength) {
    return $normalized
  }

  return $normalized.Substring(0, $MaxLength) + "..."
}

function Add-DiagnosticResult {
  param(
    [string]$Method,
    [string]$Path,
    [string]$Status,
    [string]$Snippet
  )

  $results.Add(
    [pscustomobject]@{
      Method  = $Method
      Path    = $Path
      Status  = $Status
      Snippet = (Get-BodySnippet -Body $Snippet -MaxLength 180)
    }
  ) | Out-Null
}

function Get-HttpErrorDetails {
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.ErrorRecord]$ErrorRecord
  )

  $status = "ERR"
  $body = $ErrorRecord.Exception.Message
  $response = $ErrorRecord.Exception.Response

  if ($null -ne $response) {
    try {
      $status = [string][int]$response.StatusCode
    } catch {
      try {
        $status = [string]$response.StatusCode.value__
      } catch {
        $status = "ERR"
      }
    }

    try {
      $stream = $response.GetResponseStream()
      if ($null -ne $stream) {
        $reader = $null
        try {
          $reader = New-Object System.IO.StreamReader($stream)
          $body = $reader.ReadToEnd()
        } finally {
          if ($null -ne $reader) {
            $reader.Dispose()
          }
          $stream.Dispose()
        }
      }
    } catch {
      # Keep exception message fallback.
    }
  }

  return [pscustomobject]@{
    Status = $status
    Body   = $body
  }
}

function Wait-PortReady {
  param(
    [string]$TargetHost,
    [int]$TargetPort,
    [int]$TimeoutSec,
    [System.Diagnostics.Process]$Process
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if ($null -ne $Process) {
      try {
        if ($Process.HasExited) {
          return $false
        }
      } catch {
        # Ignore process inspection race.
      }
    }

    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $iar = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(300)) {
        $client.EndConnect($iar)
        $client.Close()
        return $true
      }
    } catch {
      # Retry until timeout.
    } finally {
      try {
        $client.Close()
      } catch {
        # No-op.
      }
    }

    Start-Sleep -Milliseconds 300
  }

  return $false
}

function Invoke-DiagnosticRequest {
  param(
    [ValidateSet("GET", "PUT")]
    [string]$Method,
    [string]$Path,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [hashtable]$Headers = @{},
    [AllowNull()]
    [string]$BodyJson = $null
  )

  $uri = "{0}{1}" -f $baseUri, $Path

  try {
    $requestParams = @{
      Uri         = $uri
      Method      = $Method
      TimeoutSec  = 20
      ErrorAction = "Stop"
    }

    if ($null -ne $Session) {
      $requestParams.WebSession = $Session
    }
    if ($null -ne $Headers -and $Headers.Count -gt 0) {
      $requestParams.Headers = $Headers
    }
    if ($null -ne $BodyJson) {
      $requestParams.Body = $BodyJson
      $requestParams.ContentType = "application/json"
    }

    $response = Invoke-WebRequest @requestParams
    $statusCode = [string][int]$response.StatusCode
    $snippet = Get-BodySnippet -Body ([string]$response.Content)
    Add-DiagnosticResult -Method $Method -Path $Path -Status $statusCode -Snippet $snippet
    return $response
  } catch {
    $details = Get-HttpErrorDetails -ErrorRecord $_
    Add-DiagnosticResult -Method $Method -Path $Path -Status $details.Status -Snippet $details.Body
    return $null
  }
}

try {
  if ($SkipHttp) {
    Write-Host "SkipHttp enabled; no backend start and no HTTP requests executed."
    return
  }

  if (-not $UseExistingBackend) {
    if ($PSCmdlet.ShouldProcess($RepoRoot, "Start backend: pnpm.cmd exec tsx .\\server\\index.ts")) {
      $suffix = [Guid]::NewGuid().ToString("N")
      $stdoutLogPath = Join-Path $env:TEMP ("diagnose-settings-{0}.stdout.log" -f $suffix)
      $stderrLogPath = Join-Path $env:TEMP ("diagnose-settings-{0}.stderr.log" -f $suffix)
      $backendProcess = Start-Process `
        -FilePath "pnpm.cmd" `
        -ArgumentList @("exec", "tsx", ".\\server\\index.ts") `
        -WorkingDirectory $RepoRoot `
        -PassThru `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLogPath `
        -RedirectStandardError $stderrLogPath
      $backendStartedByScript = $true
      Write-Host ("Started backend process pid={0}" -f $backendProcess.Id)
    }
  } else {
    Write-Host "Using existing backend; startup/shutdown is disabled."
  }

  if (-not (Wait-PortReady -TargetHost $TargetHost -TargetPort $Port -TimeoutSec $StartupTimeoutSec -Process $backendProcess)) {
    $message = "Backend readiness timeout: {0}:{1} did not become reachable within {2}s." -f $TargetHost, $Port, $StartupTimeoutSec
    if ($backendStartedByScript -and $null -ne $backendProcess) {
      try {
        if ($backendProcess.HasExited) {
          $message += " Backend process exited early."
        }
      } catch {
        # Ignore.
      }
      if ($stderrLogPath -and (Test-Path $stderrLogPath)) {
        $stderrTail = (Get-Content $stderrLogPath -Tail 15 -ErrorAction SilentlyContinue | Out-String).Trim()
        if ($stderrTail) {
          $message += "`n--- stderr tail ---`n$stderrTail"
        }
      }
    }
    throw $message
  }

  $session = $null
  $csrfToken = ""

  try {
    $authResponse = Invoke-WebRequest -Uri ("{0}/api/auth/session" -f $baseUri) -Method Get -SessionVariable session -TimeoutSec 20 -ErrorAction Stop
    $authBody = [string]$authResponse.Content
    $authStatus = [string][int]$authResponse.StatusCode

    $cookieLabel = "none"
    if ($null -ne $session -and $null -ne $session.Cookies) {
      $cookieNames = @()
      $cookieCollection = $session.Cookies.GetCookies($baseUri)
      foreach ($cookie in $cookieCollection) {
        $cookieNames += [string]$cookie.Name
      }
      if ($cookieNames.Count -gt 0) {
        $cookieLabel = ($cookieNames -join ",")
      }
    }

    try {
      $authJson = $authBody | ConvertFrom-Json -ErrorAction Stop
      if ($null -ne $authJson -and $authJson.PSObject.Properties.Name -contains "csrf_token" -and $authJson.csrf_token) {
        $csrfToken = [string]$authJson.csrf_token
      }
    } catch {
      # Keep empty csrf token if body is not JSON.
    }

    $csrfLabel = "none"
    if ($csrfToken) {
      if ($csrfToken.Length -gt 12) {
        $csrfLabel = $csrfToken.Substring(0, 12) + "..."
      } else {
        $csrfLabel = $csrfToken
      }
    }

    $authSnippet = "cookie={0} csrf={1} body={2}" -f $cookieLabel, $csrfLabel, (Get-BodySnippet -Body $authBody -MaxLength 120)
    Add-DiagnosticResult -Method "GET" -Path "/api/auth/session" -Status $authStatus -Snippet $authSnippet
  } catch {
    $details = Get-HttpErrorDetails -ErrorRecord $_
    Add-DiagnosticResult -Method "GET" -Path "/api/auth/session" -Status $details.Status -Snippet $details.Body
  }

  $headers = @{}
  if ($csrfToken) {
    $headers["x-csrf-token"] = $csrfToken
  }

  Invoke-DiagnosticRequest -Method "GET" -Path "/api/settings" -Session $session -Headers $headers | Out-Null
  Invoke-DiagnosticRequest -Method "GET" -Path "/api/cli-status" -Session $session -Headers $headers | Out-Null
  Invoke-DiagnosticRequest -Method "GET" -Path "/api/oauth/status" -Session $session -Headers $headers | Out-Null
  Invoke-DiagnosticRequest -Method "GET" -Path "/api/oauth/models" -Session $session -Headers $headers | Out-Null

  if ($SkipPut) {
    Add-DiagnosticResult -Method "PUT" -Path "/api/settings" -Status "SKIP" -Snippet "Skipped by -SkipPut"
  } else {
    $samplePayload = @{
      diagnostics_runtime_probe = @{
        source = "scripts/diagnose-settings.ps1"
        utc    = (Get-Date).ToUniversalTime().ToString("o")
      }
    }
    $sampleJson = $samplePayload | ConvertTo-Json -Depth 6 -Compress

    if ($PSCmdlet.ShouldProcess("/api/settings", "PUT sample diagnostics payload")) {
      Invoke-DiagnosticRequest -Method "PUT" -Path "/api/settings" -Session $session -Headers $headers -BodyJson $sampleJson | Out-Null
    } else {
      Add-DiagnosticResult -Method "PUT" -Path "/api/settings" -Status "SKIP" -Snippet "Skipped by -WhatIf"
    }
  }

  Write-Host ""
  Write-Host ("Diagnostics summary for {0}" -f $baseUri)
  $results |
    Format-Table -AutoSize `
      @{ Label = "Method"; Expression = { $_.Method } }, `
      @{ Label = "Endpoint"; Expression = { $_.Path } }, `
      @{ Label = "Status"; Expression = { $_.Status } }, `
      @{ Label = "Snippet"; Expression = { $_.Snippet } } |
    Out-String |
    Write-Host
} finally {
  if ($backendStartedByScript -and $null -ne $backendProcess) {
    try {
      if (-not $backendProcess.HasExited) {
        & taskkill /PID $backendProcess.Id /T /F *> $null
      }
    } catch {
      Write-Warning ("Failed to stop backend process tree for pid={0}: {1}" -f $backendProcess.Id, $_.Exception.Message)
    }
  }
}
