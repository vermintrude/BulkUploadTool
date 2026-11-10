$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
foreach($file in @('ComicRox-Series-Run.ps1','ComicRox-Server.ps1')){
 $tokens=$null;$errors=$null
 [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file),[ref]$tokens,[ref]$errors)|Out-Null
 if($errors.Count){throw ($errors.Message -join '; ')}
}
. (Join-Path $root 'ComicRox-Series-Run.ps1')
function Assert($test,$message){if(!$test){throw $message}}
$env:EBAY_CLIENT_ID='fixture-client';$env:EBAY_CLIENT_SECRET='fixture-secret'
$script:calls=@()
function Invoke-RestMethod {
 param($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec)
 $script:calls+=@{method=$Method;uri=$Uri}
 if($Uri -match '/oauth2/token$'){return @{access_token='fixture-token';expires_in=7200}}
 return @{itemSummaries=@(
  @{title='Spawn #2 1992 Image Comics';image=@{imageUrl='https://i.ebayimg.com/images/g/a/s-l225.jpg'};itemWebUrl='https://www.ebay.co.uk/itm/123'},
  @{title='Spawn #12 1992';image=@{imageUrl='https://i.ebayimg.com/images/g/b/s-l225.jpg'}},
  @{title='Spawn #2 comic lot';image=@{imageUrl='https://i.ebayimg.com/images/g/c/s-l225.jpg'}},
  @{title='Spawn #2 reprint';image=@{imageUrl='https://evil.example/a.jpg'}},
  @{title='Spawn #2 variant';image=@{imageUrl='https://i.ebayimg.com/images/g/a/s-l225.jpg'}}
 )}
}
$r=Find-ComicRoxSeriesCovers 'Spawn' '2'
Assert ($r.ok -and $r.readOnly) 'Read-only response required'
Assert (@($r.candidates).Count -eq 1) 'Wrong issue, lots, unsafe images and duplicates must be excluded'
Assert ($r.candidates[0].imageUrl -eq 'https://i.ebayimg.com/images/g/a/s-l1600.jpg') 'Full-size cover suggestion required'
Assert ($script:calls[0].uri -eq 'https://api.ebay.com/identity/v1/oauth2/token') 'Only fixed OAuth endpoint may be called'
Assert ($script:calls[1].uri -match '^https://api.ebay.com/buy/browse/v1/item_summary/search\?') 'Only fixed search endpoint may be called'
Assert ($script:calls[1].uri -match '%232') 'Issue query must be URL encoded'
Find-ComicRoxSeriesCovers 'Spawn' '2'|Out-Null
Assert (@($script:calls|Where-Object {$_.uri -match '/oauth2/token$'}).Count -eq 1) 'Token cache should avoid repeated OAuth calls'
$before=$script:calls.Count
try{Find-ComicRoxSeriesCovers 'Spawn' '2; malicious'|Out-Null;throw 'Invalid issue was accepted'}catch{Assert ($_.Exception.Message -match 'valid issue') 'Invalid issue must fail validation'}
Assert ($script:calls.Count -eq $before) 'Invalid input must not make a network request'
'PowerShell parsing, read-only search, filters, image URL upgrades and token cache passed.'
