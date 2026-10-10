param([Parameter(Mandatory=$true)][string]$BulkRoot,[Parameter(Mandatory=$true)][string]$EnvFile,[Parameter(Mandatory=$true)][string[]]$Paths)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Net.Http
$envFile=$EnvFile;$getScript=Join-Path $BulkRoot 'Get-ComicRox-Shopify-Files.ps1'
if(-not(Test-Path -LiteralPath $envFile)){throw "Could not find existing Shopify settings file: $envFile"}
$rawEnv=Get-Content -LiteralPath $envFile -Raw
$vars=@{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  $line=$_.Trim()
  if($line -and -not $line.StartsWith('#')){
    $line=$line -replace '^export\s+','' -replace '^set\s+','' -replace '^\$env:',''
    if($line -match '^([^=:#\s]+)\s*[=:]\s*(.+?)\s*$'){
      $k=$matches[1].Trim();$v=$matches[2].Trim().Trim('"').Trim("'")
      $vars[$k]=$v
    }
  }
}
$clientId=$vars['SHOPIFY_CLIENT_ID']
$clientSecret=$vars['SHOPIFY_CLIENT_SECRET']
$shop=$vars['SHOPIFY_SHOP'];if(!$shop){$shop=$vars['SHOPIFY_STORE']};if(!$shop){$shop=$vars['SHOP_DOMAIN']};if(!$shop){$shop='ytksb5-wz'}
if(!$clientId -or !$clientSecret -or !$shop){throw "The existing Shopify settings file must contain SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET and SHOPIFY_SHOP."}
$shop=$shop -replace '^https?://','' -replace '/.*$','' -replace '\.myshopify\.com$',''
if($shop -ieq 'comicrox.co.uk'){$shop='ytksb5-wz'}
$tokenUri="https://$shop.myshopify.com/admin/oauth/access_token"
try {
  $tokenResponse=Invoke-RestMethod -Method Post -Uri $tokenUri -ContentType 'application/x-www-form-urlencoded' -Body @{grant_type='client_credentials';client_id=$clientId;client_secret=$clientSecret}
} catch {
  throw "Shopify authentication failed while exchanging the existing Client ID and Client Secret for an access token: $($_.Exception.Message)"
}
$token=$tokenResponse.access_token
if(!$token){throw "Shopify authentication succeeded but no access token was returned."}
$shop="$shop.myshopify.com"
$api="https://$shop/admin/api/2026-07/graphql.json";$headers=@{'X-Shopify-Access-Token'=$token;'Content-Type'='application/json'}
function Gql($query,$variables){$body=@{query=$query;variables=$variables}|ConvertTo-Json -Depth 10;$r=Invoke-RestMethod -Method Post -Uri $api -Headers $headers -Body $body;if($r.errors){throw ($r.errors|ConvertTo-Json -Depth 5)};$r.data}
$stageQ='mutation stagedUploadsCreate($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{field message}}}'
$fileQ='mutation fileCreate($files:[FileCreateInput!]!){fileCreate(files:$files){files{id fileStatus} userErrors{field message}}}'
$count=0
foreach($p in $Paths){
 if(-not(Test-Path -LiteralPath $p)){throw "Photo not found: $p"};$name=[IO.Path]::GetFileName($p);$ext=[IO.Path]::GetExtension($p).ToLower();$mime=if($ext -eq '.png'){'image/png'}elseif($ext -in '.jpg','.jpeg'){'image/jpeg'}elseif($ext -eq '.webp'){'image/webp'}else{'application/octet-stream'}
 $d=Gql $stageQ @{input=@(@{filename=$name;mimeType=$mime;resource='IMAGE';httpMethod='POST'})};$errs=@($d.stagedUploadsCreate.userErrors);if($errs.Count){throw ($errs|ConvertTo-Json)};$t=$d.stagedUploadsCreate.stagedTargets[0]
 # Use Windows curl for the staged multipart POST. Shopify requires every returned
 # parameter as a form field, with the binary file field LAST in the multipart body.
 $curl=(Get-Command curl.exe -ErrorAction SilentlyContinue)
 if(-not $curl){throw "Windows curl.exe was not found, so the Shopify staged upload could not be sent."}
 $curlArgs=@('-sS','-o','NUL','-w','%{http_code}','-X','POST')
 foreach($par in $t.parameters){$curlArgs += '--form-string';$curlArgs += (('{0}={1}' -f [string]$par.name,[string]$par.value))}
 # IMPORTANT: keep file as the final form part.
 $curlArgs += '-F';$curlArgs += (('file=@{0};type={1}' -f $p,$mime));$curlArgs += [string]$t.url
 $status=& $curl.Source @curlArgs 2>&1
 if($LASTEXITCODE -ne 0){throw "Staged upload transport failed for $name : $status"}
 $statusText=($status | Out-String).Trim()
 if($statusText -notmatch '^2\d\d$'){throw "Staged upload failed for $name : HTTP $statusText"}
 $c=Gql $fileQ @{files=@(@{originalSource=$t.resourceUrl;contentType='IMAGE';alt=$name})};$e=@($c.fileCreate.userErrors);if($e.Count){throw ($e|ConvertTo-Json)};$count++
}
Write-Output "Uploaded $count photo(s) to Shopify Files."
