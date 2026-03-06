$ErrorActionPreference = "SilentlyContinue"

$targets = Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object {
  $cmd = [string]$_.CommandLine
  if (-not $cmd) { return $false }
  if ($cmd -notmatch "\\.openclaw\\claw-empire") { return $false }

  return (
    $cmd -match 'concurrently\\dist\\bin\\concurrently\.js' -or
    $cmd -match 'nodemon\\bin\\nodemon\.js' -or
    $cmd -match 'vite\\bin\\vite\.js' -or
    $cmd -match 'cross-env\\src\\bin\\cross-env\.js' -or
    $cmd -match 'tsx\\dist\\cli\.mjs"\s+server/index\.ts' -or
    $cmd -match 'corepack\\dist\\corepack\.js"\s+pnpm\s+dev:local'
  )
}

foreach ($p in $targets) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
