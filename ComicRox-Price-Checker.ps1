# Fixed-destination, read-only reporting proxy. The key is never saved or logged.
function Get-ComicRoxPriceCheckerReport([string]$reportKey, [int]$days) {
  if($reportKey.Length -lt 32 -or $reportKey.Length -gt 256 -or $reportKey -match '[\r\n\x00-\x20]'){throw 'Enter your reporting key (32-256 characters, with no spaces).'}
  if($days -notin @(1,7,31)){throw 'Choose 1, 7 or 31 days.'}
  $uri='https://comicrox-price-checker.steve-9b8.workers.dev/admin/usage?days='+$days
  try {
    $data=Invoke-RestMethod -Uri $uri -Method Get -Headers @{Authorization=('Bearer '+$reportKey)} -TimeoutSec 30 -MaximumRedirection 0 -ErrorAction Stop
  } catch {
    # Do not return raw exceptions: these may contain provider responses/headers.
    throw 'Cannot load price-checker reporting. Check the reporting key, Worker deployment and database setup, then try again. Last loaded figures are retained.'
  }
  if($data.ok -ne $true -or $data.version -ne 1 -or $data.timezone -ne 'UTC' -or $null -eq $data.daily -or $null -eq $data.models -or !$data.coverage){throw 'Worker reporting is not ready. Deploy the reporting update and finish database setup first.'}
  return $data
}
