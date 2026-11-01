<#
  Compresse les vidéos de démonstration du site et crée leurs affiches WebP.
  Usage (depuis la racine du dépôt) :  powershell -ExecutionPolicy Bypass -File scripts\compress-media.ps1

  Pour chaque web\public\demos\*.mp4 :
    1. l'original est déplacé dans ..\YAMBOKA-medias\brut\ (hors dépôt, jamais écrasé) ;
    2. une version 720x900 (4:5), 24 i/s, muette, 7 s max, <= 1,5 Mo est recréée au même nom ;
    3. l'affiche <nom>.webp (720x900, <= 90 Ko) est créée à côté (nette même agrandie dans la galerie).
  Les paires avant/après gardent la même durée et les mêmes dimensions. Relançable : il repart toujours de l'original.
  Prérequis : ffmpeg (winget install Gyan.FFmpeg), puis rouvrir le terminal.
#>
param(
  [string]$Demos = (Join-Path $PSScriptRoot '..\web\public\demos'),
  [string]$Brut = (Join-Path $PSScriptRoot '..\..\YAMBOKA-medias\brut'),
  [int]$Seconds = 7
)
$ErrorActionPreference = 'Stop'

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg est introuvable. Installez-le (winget install Gyan.FFmpeg) puis rouvrez le terminal."
}
New-Item -ItemType Directory -Force $Brut | Out-Null

function Invoke-Ffmpeg([string[]]$Arguments) {
  & ffmpeg -hide_banner -loglevel error -y @Arguments
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg a échoué : $($Arguments -join ' ')" }
}

foreach ($file in Get-ChildItem -Path $Demos -Filter *.mp4) {
  $name = $file.BaseName
  $source = Join-Path $Brut $file.Name
  if (-not (Test-Path $source)) { Move-Item -LiteralPath $file.FullName -Destination $source }

  $video = Join-Path $Demos "$name.mp4"
  $maxBytes = 1.5MB
  foreach ($crf in 28, 31, 34) {
    Invoke-Ffmpeg @('-i', $source, '-t', $Seconds, '-an',
      '-vf', 'scale=720:900:force_original_aspect_ratio=increase,crop=720:900,fps=24',
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', $crf,
      '-movflags', '+faststart', $video)
    if ((Get-Item $video).Length -le $maxBytes) { break }
  }

  $poster = Join-Path $Demos "$name.webp"
  foreach ($quality in 70, 55, 45) {
    Invoke-Ffmpeg @('-i', $video, '-ss', '1', '-frames:v', '1', '-vf', 'scale=720:900', '-c:v', 'libwebp', '-quality', $quality, $poster)
    if ((Get-Item $poster).Length -le 90KB) { break }
  }

  $v = [math]::Round((Get-Item $video).Length / 1MB, 2)
  $p = [math]::Round((Get-Item $poster).Length / 1KB)
  $flag = if ((Get-Item $video).Length -gt $maxBytes -or (Get-Item $poster).Length -gt 90KB) { '  <-- TROP LOURD' } else { '' }
  "{0,-24} vidéo {1} Mo, affiche {2} Ko{3}" -f $name, $v, $p, $flag
}
