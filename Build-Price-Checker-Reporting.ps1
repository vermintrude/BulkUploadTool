param([string]$SourceFile,[string]$OutputFolder)
$ErrorActionPreference='Stop'
try {
  if(!$SourceFile){Add-Type -AssemblyName System.Windows.Forms;$dialog=New-Object System.Windows.Forms.OpenFileDialog;$dialog.Title='Choose the original V3.0 price-checker Worker text file';$dialog.Filter='Worker files (*.txt;*.js)|*.txt;*.js';if($dialog.ShowDialog() -ne 'OK'){exit};$SourceFile=$dialog.FileName}
  $source=[IO.File]::ReadAllText($SourceFile).Replace("`r`n","`n").Trim()
  $bytes=[Text.Encoding]::UTF8.GetBytes($source)
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  if($hash -ne '7d9ad55132a9b8fdf6bcec595c00c5c54c93fae256cdb88d9f94f7456460b1bf'){throw 'This is not the reviewed V3.0 Worker. Nothing was changed. Send the current source for review before rebuilding.'}
  if(!$OutputFolder){$OutputFolder=Join-Path ([Environment]::GetFolderPath('Desktop')) ('ComicRox-Price-Checker-Reporting-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))}
  if(Test-Path -LiteralPath $OutputFolder){throw 'Output folder already exists. Choose a new folder; existing files will not be overwritten.'}
  New-Item -ItemType Directory -Path $OutputFolder|Out-Null
  $patched=$source.Replace('export default {','const comicRoxChecker = {').Replace('await fetch(', 'await pcTrackedFetch(env, ')
  $module=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ComicRox-Price-Checker-Reporting.js'))
  $encoding=New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText((Join-Path $OutputFolder 'worker-original.js'),$source,$encoding)
  [IO.File]::WriteAllText((Join-Path $OutputFolder 'worker-with-reporting.js'),($patched+"`n`n"+$module),$encoding)
  $random=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($random)}finally{$rng.Dispose()}
  [IO.File]::WriteAllText((Join-Path $OutputFolder 'REPORTING-KEY-PRIVATE.txt'),([BitConverter]::ToString($random)).Replace('-','').ToLowerInvariant(),$encoding)
  Write-Host "Created $OutputFolder. No deployment or website changes were made." -ForegroundColor Green
  Write-Host 'Keep REPORTING-KEY-PRIVATE.txt private. Follow READ-ME-PRICE-CHECKER-REPORTING.txt.'
} catch {Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
