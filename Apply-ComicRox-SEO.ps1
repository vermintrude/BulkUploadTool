# Apply a reviewed SEO plan. Product mutations contain only id and seo.
param([string]$PlanPath,[switch]$PreviewOnly,[switch]$Apply)
$ErrorActionPreference='Stop'
function Get-ComicRoxSEOValue($object,[string]$key){if($object -is [Collections.IDictionary]){return $object[$key]};return $object.$key}
function Get-ComicRoxSEOKeys($object){if($object -is [Collections.IDictionary]){return @($object.Keys)};return @($object.PSObject.Properties.Name)}
function Test-ComicRoxSEOPlan($plan){
 if($plan.schema -ne 'comicrox-shopify-seo-v1' -or !$plan.createdAt){throw 'Not a ComicRox SEO update plan.'}
 $created=[DateTimeOffset]::Parse([string]$plan.createdAt)
 if($created -lt [DateTimeOffset]::UtcNow.AddHours(-24) -or $created -gt [DateTimeOffset]::UtcNow.AddMinutes(10)){throw 'This SEO plan is stale. Preview a fresh Shopify export and download a new plan.'}
 $changes=@($plan.changes);if(!$changes.Count -or $changes.Count -gt 10000){throw 'Plan must contain between 1 and 10000 products.'}
 $seen=@{}
 foreach($change in $changes){
  if([string]$change.handle -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,254}$' -or $seen.ContainsKey([string]$change.handle)){throw 'Invalid or duplicate product handle.'};$seen[[string]$change.handle]=$true
  $keys=@(Get-ComicRoxSEOKeys $change.seo);if(!$keys.Count -or $keys.Count -gt 2){throw 'SEO fields are missing.'}
  if(@(Get-ComicRoxSEOKeys $change.expected).Count -ne $keys.Count){throw 'Expected SEO values do not match update fields.'}
  foreach($field in $keys){if($field -notin @('title','description')){throw 'Only SEO title and description can be changed.'};$value=Get-ComicRoxSEOValue $change.seo $field;if($value -isnot [string] -or !$value.Trim() -or ($field -eq 'title' -and $value.Length -gt 70) -or $value.Length -gt 320){throw 'SEO text is empty or exceeds Shopify limits.'};if($field -notin @(Get-ComicRoxSEOKeys $change.expected) -or (Get-ComicRoxSEOValue $change.expected $field) -isnot [string]){throw 'Expected SEO value is missing.'}}
 }
}
function Invoke-ComicRoxSEORequest($connection,[string]$query,$variables){
 $body=@{query=$query;variables=$variables}|ConvertTo-Json -Depth 12 -Compress
 try{$r=Invoke-RestMethod -Method Post -Uri $connection.url -Headers $connection.headers -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 45}catch{throw 'Shopify SEO request failed. Check connectivity and app read_products/write_products permissions. No other product fields were submitted.'}
 if($r.errors){throw ('Shopify rejected the SEO request: '+(($r.errors|ForEach-Object {$_.message}) -join '; '))};return $r.data
}
function Get-ComicRoxSEOLive($connection,[string]$handle){
 $query='query ComicRoxSEOPreview($query:String!){products(first:2,query:$query){nodes{id title handle descriptionHtml seo{title description} releaseDate:metafield(namespace:"custom",key:"release_date"){value}}}}'
 $data=Invoke-ComicRoxSEORequest $connection $query @{query=('handle:"'+$handle+'"')}
 $matches=@($data.products.nodes|Where-Object {$_.handle -ceq $handle});if($matches.Count -ne 1){throw 'Product handle is missing or ambiguous in Shopify.'};return $matches[0]
}
function Get-ComicRoxSEOEligible($change,$live){
 if([string]$live.title -cne [string]$change.productTitle){throw 'Product title changed since export. Generate a fresh plan.'}
 if([string]$live.descriptionHtml -cne [string]$change.sourceDescription){throw 'Product description changed since export. Generate a fresh plan.'}
 if([string]$live.releaseDate.value -cne [string]$change.releaseDate){throw 'Product release date changed since export. Generate a fresh plan.'}
 $seo=@{}
 foreach($field in @(Get-ComicRoxSEOKeys $change.seo)){
  $now=[string](Get-ComicRoxSEOValue $live.seo $field);$target=[string](Get-ComicRoxSEOValue $change.seo $field);$expected=[string](Get-ComicRoxSEOValue $change.expected $field)
  if($now -ceq $target){continue};if($now -cne $expected){throw ('SEO '+$field+' changed since preview; preserved without changes.')};$seo[$field]=$target
 };return $seo
}
function Invoke-ComicRoxSEOPlan($connection,$plan,[switch]$DoApply){
 Test-ComicRoxSEOPlan $plan;$results=@();$index=0;$total=@($plan.changes).Count
 foreach($change in @($plan.changes)){
  if($index -gt 0){Start-Sleep -Milliseconds 150};$index++
  Write-Progress -Activity 'ComicRox Shopify SEO' -Status ($index.ToString()+' / '+$total+' - '+$change.handle) -PercentComplete ([int]($index*100/$total))
  try{
   $live=Get-ComicRoxSEOLive $connection $change.handle;$seo=Get-ComicRoxSEOEligible $change $live
   if(!$seo.Count){$results+=@{handle=$change.handle;status='Already matches';message='No update needed'};continue}
   if(!$DoApply){$results+=@{handle=$change.handle;status='Ready';message=($seo|ConvertTo-Json -Compress)};continue}
   # Re-read immediately before writing. Only selected SEO fields are submitted.
   $live=Get-ComicRoxSEOLive $connection $change.handle;$seo=Get-ComicRoxSEOEligible $change $live
   if(!$seo.Count){$results+=@{handle=$change.handle;status='Already matches';message='No update needed'};continue}
   $query='mutation ComicRoxSEOOnly($product:ProductUpdateInput!){productUpdate(product:$product){product{id seo{title description}} userErrors{field message}}}'
   $data=Invoke-ComicRoxSEORequest $connection $query @{product=@{id=[string]$live.id;seo=$seo}}
   if($data.productUpdate.userErrors){throw (($data.productUpdate.userErrors|ForEach-Object {$_.message}) -join '; ')}
   if($data.productUpdate.product.id -ne $live.id){throw 'Shopify did not confirm the updated product.'}
   foreach($field in $seo.Keys){if([string](Get-ComicRoxSEOValue $data.productUpdate.product.seo $field) -cne $seo[$field]){throw 'Shopify response did not confirm the requested SEO. Check Shopify before retrying.'}}
   $results+=@{handle=$change.handle;status='Updated';message='Only SEO fields submitted'}
  }catch{$results+=@{handle=$change.handle;status='Skipped / check';message=$_.Exception.Message}}
 };Write-Progress -Activity 'ComicRox Shopify SEO' -Completed;return $results
}
if($MyInvocation.InvocationName -ne '.'){
 try{
  $root=Split-Path -Parent $MyInvocation.MyCommand.Path
  if(!$PlanPath){Add-Type -AssemblyName System.Windows.Forms;$picker=New-Object Windows.Forms.OpenFileDialog;$picker.Filter='ComicRox SEO plan (*.json)|*.json';if($picker.ShowDialog() -ne 'OK'){exit};$PlanPath=$picker.FileName}
  $plan=Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8|ConvertFrom-Json;Test-ComicRoxSEOPlan $plan
  $ShopifyEnvFile=Join-Path $root 'Shopify-env-dont-delete/comicrox-shopify.env'
  $serverFile=Join-Path $root 'ComicRox-Server.ps1'
  if(Test-Path -LiteralPath $serverFile){$server=Get-Content -LiteralPath $serverFile -Raw;if($server -match '(?m)^\$ShopifyEnvFile\s*=\s*''([^'']+)'''){$ShopifyEnvFile=$matches[1]}}
  . (Join-Path $root 'ComicRox-Shopify-Flow.ps1')
  $connection=Get-ComicRoxFlowHeaders
  $preview=@(Invoke-ComicRoxSEOPlan $connection $plan);$preview|ForEach-Object {[PSCustomObject]$_}|Format-Table handle,status,message -Wrap
  $report=[IO.Path]::ChangeExtension($PlanPath,'.results.csv');$preview|ForEach-Object {[PSCustomObject]$_}|Export-Csv -LiteralPath $report -NoTypeInformation -Encoding UTF8
  if($PreviewOnly){exit}
  if(@($preview|Where-Object {$_.status -eq 'Ready'}).Count -eq 0){Write-Host 'No updates ready.';exit}
  if(!$Apply -and (Read-Host 'Type APPLY to update only the ready SEO fields, or press Enter to cancel') -cne 'APPLY'){Write-Host 'Cancelled. No products updated.';exit}
  $results=@(Invoke-ComicRoxSEOPlan $connection $plan -DoApply);$results|ForEach-Object {[PSCustomObject]$_}|Export-Csv -LiteralPath $report -NoTypeInformation -Encoding UTF8
  $results|ForEach-Object {[PSCustomObject]$_}|Format-Table handle,status,message -Wrap
  Write-Host ('Finished. Results saved to '+$report)
 }catch{Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
}
