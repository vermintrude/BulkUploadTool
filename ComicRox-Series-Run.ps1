# Read-only online cover suggestions. Reuses existing eBay application credentials.
# No supplied URL is fetched, no product is created and no price/condition is inferred.
function Find-ComicRoxSeriesCovers([string]$series,[string]$issue) {
  $series=$series.Trim();$issue=$issue.Trim()
  if(!$series -or $series.Length -gt 100 -or $series -match '[\x00-\x1f]' -or $issue -notmatch '^\d{1,5}(?:\.\d{1,2})?$'){throw 'Enter a series title and one valid issue number.'}
  $clientId=$env:EBAY_CLIENT_ID;$clientSecret=$env:EBAY_CLIENT_SECRET
  if(!$clientId){$clientId=[Environment]::GetEnvironmentVariable('EBAY_CLIENT_ID','User')}
  if(!$clientSecret){$clientSecret=[Environment]::GetEnvironmentVariable('EBAY_CLIENT_SECRET','User')}
  if(!$clientId -or !$clientSecret){throw 'Online cover search needs the existing eBay API settings. You can still paste a cover image URL or use your own photos.'}
  try {
    if(!$script:ComicRoxSeriesToken -or $script:ComicRoxSeriesToken.expires -lt [DateTime]::UtcNow){
      $basic=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$clientId`:$clientSecret"))
      $token=Invoke-RestMethod -Method Post -Uri 'https://api.ebay.com/identity/v1/oauth2/token' -Headers @{Authorization="Basic $basic"} -ContentType 'application/x-www-form-urlencoded' -Body 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope' -TimeoutSec 25
      if(!$token.access_token){throw 'No token'}
      $script:ComicRoxSeriesToken=@{value=$token.access_token;expires=[DateTime]::UtcNow.AddSeconds([Math]::Max(1,[Math]::Min(3600,[int]$token.expires_in-60)))}
    }
    $query=$series+' #'+$issue+' comic'
    $uri='https://api.ebay.com/buy/browse/v1/item_summary/search?limit=50&q='+[Uri]::EscapeDataString($query)
    $response=Invoke-RestMethod -Method Get -Uri $uri -Headers @{Authorization=('Bearer '+$script:ComicRoxSeriesToken.value);'X-EBAY-C-MARKETPLACE-ID'='EBAY_GB'} -TimeoutSec 30
  } catch {throw 'Online cover search could not be completed. Retry, paste an approved cover URL or use your own photos.'}
  $candidates=@();$seen=@{}
  $normalSeries=(($series.ToLowerInvariant() -replace '[^a-z0-9]+',' ') -replace '\s+',' ').Trim()
  $seriesPattern=([regex]::Escape($normalSeries) -replace '\ ','\s+')
  $issuePattern='(?<!\d)'+[regex]::Escape($issue)+'(?![\d.])'
  foreach($item in @($response.itemSummaries)){
    $title=[string]$item.title;$normalTitle=(($title.ToLowerInvariant() -replace '[^a-z0-9]+',' ') -replace '\s+',' ').Trim()
    if($normalTitle -notmatch ('(?:^|\s)'+$seriesPattern+'(?:\s|$)') -or $title -notmatch $issuePattern){continue}
    $explicitIssue=[regex]::Match($title,'#\s*(\d+(?:\.\d+)?)');if($explicitIssue.Success -and $explicitIssue.Groups[1].Value -ne $issue){continue}
    if($title -match '(?i)\b(?:lot|bundle|set of|poster|art print|digital)\b'){continue}
    $image=[string]$item.image.imageUrl
    try{$imageUri=[Uri]$image}catch{continue}
    if(!$imageUri.IsAbsoluteUri -or $imageUri.Scheme -ne 'https' -or $imageUri.Host -notmatch '(^|\.)ebayimg\.com$'){continue}
    $image=$image -replace '/s-l\d+(\.(?:jpg|jpeg|png|webp))(?:\?.*)?$','/s-l1600$1'
    if($seen.ContainsKey($image)){continue};$seen[$image]=$true
    $link=[string]$item.itemWebUrl
    try{$linkUri=[Uri]$link;if(!$linkUri.IsAbsoluteUri -or $linkUri.Scheme -ne 'https' -or $linkUri.Host -notmatch '(^|\.)ebay\.(co\.uk|com)$'){$link=''}}catch{$link=''}
    $candidates+=@{title=$title;imageUrl=$image;sourceUrl=$link;source='eBay listing — check issue, volume, printing and variant'}
    if($candidates.Count -ge 12){break}
  }
  return @{ok=$true;candidates=@($candidates);query=$query;readOnly=$true}
}

# Copy a browser-selected photo into the configured photo root. Never accepts a
# destination path and never uploads to Shopify. Originals on the laptop stay intact.
function Import-ComicRoxLocalPhoto([string]$name,[string]$base64) {
  $name=($name -split '[\\/]')[-1]
  if(!$name -or $name.Length -gt 255 -or $name -match '[\x00-\x1f]'){throw 'Choose an image with a valid filename.'}
  $ext=[IO.Path]::GetExtension($name).ToLowerInvariant()
  if($ext -notin @('.jpg','.jpeg','.png','.webp')){throw 'Choose JPG, PNG or WebP photos.'}
  if(!$base64 -or $base64.Length -gt 20971520){throw 'Each selected photo must be 15 MB or smaller.'}
  try{$bytes=[Convert]::FromBase64String($base64)}catch{throw 'The selected photo could not be read.'}
  if(!$bytes.Length -or $bytes.Length -gt 15728640){throw 'Each selected photo must be 15 MB or smaller.'}
  $valid=$false
  if($ext -in @('.jpg','.jpeg')){$valid=$bytes.Length -ge 3 -and $bytes[0] -eq 255 -and $bytes[1] -eq 216 -and $bytes[2] -eq 255;$ext='.jpg'}
  elseif($ext -eq '.png'){$valid=$bytes.Length -ge 8 -and [BitConverter]::ToString($bytes,0,8) -eq '89-50-4E-47-0D-0A-1A-0A'}
  elseif($ext -eq '.webp'){$valid=$bytes.Length -ge 12 -and [Text.Encoding]::ASCII.GetString($bytes,0,4) -eq 'RIFF' -and [Text.Encoding]::ASCII.GetString($bytes,8,4) -eq 'WEBP'}
  if(!$valid){throw 'The selected file does not match its JPG, PNG or WebP extension.'}
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  $folder=Join-Path $PhotoRoot 'Selected_Imports'
  [IO.Directory]::CreateDirectory($folder)|Out-Null
  $storedName='CR-photo-'+$hash+$ext;$target=Join-Path $folder $storedName
  if(!(Test-Path -LiteralPath $target)){[IO.File]::WriteAllBytes($target,$bytes)}
  $file=Get-Item -LiteralPath $target
  return @{ok=$true;photo=@{name=$storedName;displayName=$name;path=$file.FullName;modified=$file.LastWriteTime.ToString('o');size=$file.Length;browserSelected=$true}}
}
