# Downloads a portable Node.js for SKYTHREAD into .tools\node: no admin rights,
# nothing installed system-wide, archive checked against a pinned SHA-256.
# Called by BASLAT-Windows.bat when Node.js is missing or too old.
# Windows PowerShell 5.1 compatible. Messages are ASCII-only so they read the
# same in every console code page.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Version = 'v22.23.3'
$Sha256 = @{
  'x64'   = '2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71'
  'arm64' = '33dad22e4cef5ee8f9fbb1b0d037fdacd0e56d12a4580f0d63f68b894deab535'
}
$Mirrors = @('https://nodejs.org/dist', 'https://cdn.npmmirror.com/binaries/node')

function Fail([string]$Message) {
  Write-Host ''
  Write-Host "HATA: $Message" -ForegroundColor Red
  exit 1
}

function Get-File([string]$Url, [string]$OutFile) {
  # curl.exe ships with Windows 10 1803+ and shows progress; Invoke-WebRequest
  # is the fallback and also honours the system proxy settings.
  $curl = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($curl) {
    # 'Continue' so curl's progress output on stderr never counts as a failure.
    $ErrorActionPreference = 'Continue'
    & $curl.Path -fL --retry 3 --connect-timeout 20 --progress-bar -o $OutFile $Url
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -eq 0) { return $true }
  }
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile
    return $true
  } catch {
    Write-Host "  Indirilemedi: $($_.Exception.Message)"
    return $false
  }
}

try {
  $root = Split-Path -Parent $PSScriptRoot
  $tools = Join-Path $root '.tools'

  $arch = $null
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'arm64' }
  elseif ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'AMD64') { $arch = 'x64' }
  if (-not $arch) { Fail 'Bu oyun 64-bit Windows 10 veya 11 gerektirir (32-bit Windows desteklenmiyor).' }

  # Older Windows PowerShell builds default to TLS 1.0, which nodejs.org refuses.
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch { }

  $name = "node-$Version-win-$arch"
  New-Item -ItemType Directory -Force -Path $tools | Out-Null
  Get-ChildItem -LiteralPath $tools -Directory -Filter 'download-*' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  $tmp = Join-Path $tools "download-$PID"
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $zip = Join-Path $tmp "$name.zip"

  Write-Host "Node.js $Version indiriliyor (bir kereligine, yaklasik 35 MB)..."
  $ok = $false
  foreach ($base in $Mirrors) {
    if (Get-File "$base/$Version/$name.zip" $zip) {
      $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
      if ($hash -eq $Sha256[$arch]) { $ok = $true; break }
      Write-Host "  Uyari: $base adresinden inen dosya dogrulanamadi, baska kaynak deneniyor."
    }
  }
  if (-not $ok) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Fail "Node.js indirilemedi. Internet baglantinizi kontrol edin ya da Node.js'i https://nodejs.org adresinden (LTS) kurun."
  }

  Write-Host 'Arsiv aciliyor...'
  $extracted = $false
  if ($env:SystemRoot) {
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path -LiteralPath $tar) {
      $ErrorActionPreference = 'Continue'
      & $tar -xf $zip -C $tmp
      $extracted = ($LASTEXITCODE -eq 0)
      $ErrorActionPreference = 'Stop'
    }
  }
  if (-not $extracted) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
  }

  # Antivirus scanners can hold the fresh files for a moment, so retry the move.
  $dest = Join-Path $tools 'node'
  for ($attempt = 1; ; $attempt++) {
    try {
      if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
      Move-Item -LiteralPath (Join-Path $tmp $name) -Destination $dest
      break
    } catch {
      if ($attempt -ge 10) { throw }
      Start-Sleep -Seconds 1
    }
  }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue

  if ($env:OS -eq 'Windows_NT') {
    $nodeExe = Join-Path $dest 'node.exe'
    $ErrorActionPreference = 'Continue'
    $v = & $nodeExe -v
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { Fail 'Indirilen Node.js calistirilamadi.' }
    Write-Host "Node.js $v hazir (.tools\node)."
  }
  exit 0
} catch {
  Fail "Node.js kurulamadi: $($_.Exception.Message)"
}
