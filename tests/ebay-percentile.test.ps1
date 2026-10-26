# Run locally with: powershell -NoProfile -File tests\ebay-percentile.test.ps1
$ErrorActionPreference = 'Stop'
$server = Join-Path (Split-Path -Parent $PSScriptRoot) 'ComicRox-Server.ps1'
$source = [IO.File]::ReadAllText($server)
$tokens = $null; $errors = $null
[void][Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors | Out-String)}
$start = $source.IndexOf('        function Percentile(')
$end = $source.IndexOf('        Send-Json $ctx @{ok=$true;marketBasis=', $start)
if($start -lt 0 -or $end -le $start){throw 'Pricing calculation block not found'}
$calculation = [scriptblock]::Create($source.Substring($start,$end-$start))
$cases = @(
  @{prices=@(5.25);median=5.25;count=1},
  @{prices=@(4,6);median=5;count=2},
  @{prices=@(4,5,9);median=5;count=3},
  @{prices=@(4,5,6,9);median=5.5;count=4},
  @{prices=@(4,5,6,7,8);median=6;count=5},
  @{prices=@(5,5,6,6,100);median=5.5;count=4}
)
foreach($case in $cases){
  # Fresh child scope for every result: no function left behind by a prior search.
  $result = & {
    param($values,$pricing)
    $vals = @($values)
    . $pricing
    [pscustomobject]@{median=$median;count=$used.Count}
  } $case.prices $calculation
  if([math]::Abs($result.median-$case.median) -gt .000001 -or $result.count -ne $case.count){throw ('Incorrect result: '+($result|ConvertTo-Json -Compress))}
}
Write-Output 'PASS: server syntax and six fresh-scope pricing cases, including 1-4 comparables and IQR outlier filtering.'
