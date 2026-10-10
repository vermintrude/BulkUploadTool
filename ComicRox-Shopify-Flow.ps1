# Separate read-only Shopify report. Existing batch handlers/authentication remain unchanged.
function Get-ComicRoxFlowHeaders {
  if(!(Test-Path -LiteralPath $ShopifyEnvFile)){throw 'Existing ComicRox Shopify settings file not found.'}
  $vars=@{}
  foreach($lineRaw in Get-Content -LiteralPath $ShopifyEnvFile){
    $line=$lineRaw.Trim()
    if(!$line -or $line.StartsWith('#')){continue}
    $line=$line -replace '^export\s+','' -replace '^set\s+','' -replace '^\$env:',''
    if($line -match '^([^=:#\s]+)\s*[=:]\s*(.+?)\s*$'){$vars[$matches[1].Trim()]=$matches[2].Trim().Trim('"').Trim("'")}
  }
  $shop=$vars['SHOPIFY_SHOP'];if(!$shop){$shop=$vars['SHOPIFY_STORE']};if(!$shop){$shop=$vars['SHOP_DOMAIN']};if(!$shop){$shop='ytksb5-wz'}
  $shop=$shop -replace '^https?://','' -replace '/.*$','' -replace '\.myshopify\.com$',''
  if($shop -ieq 'comicrox.co.uk'){$shop='ytksb5-wz'}
  if($shop -notmatch '^[a-zA-Z0-9][a-zA-Z0-9-]*$'){throw 'Shopify store hostname in existing settings is invalid.'}
  if(!$vars['SHOPIFY_CLIENT_ID'] -or !$vars['SHOPIFY_CLIENT_SECRET']){throw 'Existing Shopify client ID or client secret is missing.'}
  try{
    $token=Invoke-RestMethod -Method Post -Uri "https://$shop.myshopify.com/admin/oauth/access_token" -ContentType 'application/x-www-form-urlencoded' -Body @{grant_type='client_credentials';client_id=$vars['SHOPIFY_CLIENT_ID'];client_secret=$vars['SHOPIFY_CLIENT_SECRET']} -TimeoutSec 30
    if(!$token.access_token){throw 'No token returned.'}
  }catch{throw 'Shopify authentication failed. Check the existing local app credentials and installation; no credentials have been exposed.'}
  return @{url="https://$shop.myshopify.com/admin/api/2026-07/graphql.json";headers=@{'X-Shopify-Access-Token'=$token.access_token;'Content-Type'='application/json'}}
}
function Invoke-ComicRoxFlowQuery($connection,[string]$query,$variables){
  # Report code only sends fixed GraphQL queries, never product/metafield mutations.
  $body=@{query=$query;variables=$variables}|ConvertTo-Json -Depth 10 -Compress
  if($script:ComicRoxFlowBudget -and $script:ComicRoxFlowBudget.currentlyAvailable -lt 250 -and $script:ComicRoxFlowBudget.restoreRate -gt 0){
    $wait=[Math]::Min(5000,[Math]::Ceiling((250-$script:ComicRoxFlowBudget.currentlyAvailable)/$script:ComicRoxFlowBudget.restoreRate*1000));if($wait -gt 0){Start-Sleep -Milliseconds ([int]$wait)}
  }
  try{$r=Invoke-RestMethod -Method Post -Uri $connection.url -Headers $connection.headers -ContentType 'application/json' -Body $body -TimeoutSec 45}catch{throw 'Shopify report could not be read. Check connectivity and granted read permissions; existing batch processing is unaffected.'}
  if($r.extensions -and $r.extensions.cost -and $r.extensions.cost.throttleStatus){$script:ComicRoxFlowBudget=$r.extensions.cost.throttleStatus}
  if($r.errors -and @($r.errors|Where-Object{$_.extensions.code -eq 'THROTTLED'}).Count){throw 'Shopify rate limit reached while reading the report. Wait briefly, then refresh; no partial snapshot has replaced saved history.'}
  if($r.errors){throw 'Shopify denied or rejected a report query. Verify granted read_products and access to shop metafields. No store changes were attempted.'}
  if(!$r.data){throw 'Shopify returned no report data.'}
  return $r.data
}
function Get-ComicRoxFlowSetup {
  $connection=Get-ComicRoxFlowHeaders
  $query='query ComicRoxFlowSetup { shop { id name myshopifyDomain } currentAppInstallation { accessScopes { handle } } }'
  $data=Invoke-ComicRoxFlowQuery $connection $query @{}
  return @{ok=$true;shop=$data.shop;scopes=@($data.currentAppInstallation.accessScopes|ForEach-Object{$_.handle});readOnly=$true;reportingNamespace='comicrox_flow';apiVersion='2026-07'}
}
function Convert-ComicRoxFlowSummary($field,[string]$expected){
  if(!$field){return $null}
  try{
    $v=$field.value|ConvertFrom-Json
    $date=[DateTimeOffset]::Parse([string]$v.scheduled_at)
    if($v.schema -ne 1 -or $v.limit -ne 100 -or $v.workflow -ne $expected -or [string]$v.matched -notmatch '^\d+$' -or [int]$v.matched -gt 100){throw 'Invalid summary'}
    return @{scheduledAt=$date.ToUniversalTime().ToString('o');matched=[int]$v.matched;limit=100;observedAt=[string]$field.updatedAt}
  }catch{throw 'A Shopify Flow reporting marker has an unsupported format. Keep existing Flow actions unchanged and check the reporting-only setup.'}
}
function Get-ComicRoxFlowReport {
  $connection=Get-ComicRoxFlowHeaders
  $query='query ComicRoxFlowSummaries { shop { id name myshopifyDomain releaseRun: metafield(namespace:"comicrox_flow",key:"release_query") { value updatedAt } ageingRun: metafield(namespace:"comicrox_flow",key:"ageing_query") { value updatedAt } } }'
  $data=Invoke-ComicRoxFlowQuery $connection $query @{}
  $release=Convert-ComicRoxFlowSummary $data.shop.releaseRun 'release'
  $ageing=Convert-ComicRoxFlowSummary $data.shop.ageingRun 'ageing'
  $query=@'
query ComicRoxFlowProducts($after:String) {
 products(first:100,after:$after,sortKey:ID) {
  nodes {
   id title handle onlineStoreUrl
   variants(first:1) { nodes { sku } pageInfo { hasNextPage } }
   descriptionRun: metafield(namespace:"comicrox_flow",key:"release_description_at") { value }
   tagsRun: metafield(namespace:"comicrox_flow",key:"release_tags_at") { value }
   agedRun: metafield(namespace:"comicrox_flow",key:"aged_at") { value }
  }
  pageInfo { hasNextPage endCursor }
 }
}
'@
  $products=@();$after=$null;$pages=0;$seen=@{};$seenProducts=@{}
  do{
    $page=Invoke-ComicRoxFlowQuery $connection $query @{after=$after};$pages++
    if(!$page.products -or $null -eq $page.products.pageInfo.hasNextPage){throw 'Shopify returned an incomplete product page. Saved history is unchanged.'}
    foreach($p in $page.products.nodes){
      if($seenProducts.ContainsKey([string]$p.id)){throw 'Shopify returned duplicate product IDs across report pages. Saved history is unchanged.'}
      $seenProducts[[string]$p.id]=$true
      $descriptionAt=if($p.descriptionRun){[string]$p.descriptionRun.value}else{''}
      $tagsAt=if($p.tagsRun){[string]$p.tagsRun.value}else{''}
      $agedAt=if($p.agedRun){[string]$p.agedRun.value}else{''}
      if($descriptionAt -or $tagsAt -or $agedAt){$products+=@{id=[string]$p.id;title=[string]$p.title;handle=[string]$p.handle;onlineStoreUrl=[string]$p.onlineStoreUrl;skus=@($p.variants.nodes|ForEach-Object{if($_.sku){[string]$_.sku}});skuListTruncated=[bool]$p.variants.pageInfo.hasNextPage;descriptionAt=$descriptionAt;tagsAt=$tagsAt;agedAt=$agedAt}}
    }
    $more=[bool]$page.products.pageInfo.hasNextPage
    if($more){
      $next=[string]$page.products.pageInfo.endCursor
      if(!$next -or $seen.ContainsKey($next)){throw 'Shopify product pagination stalled. No partial report has replaced saved history.'}
      $seen[$next]=$true;$after=$next
      if($pages -ge 1000){throw 'Shopify report scan reached its safety limit. No partial report has replaced saved history.'}
    }
  }while($more)
  return @{ok=$true;readOnly=$true;fetchedAt=[DateTime]::UtcNow.ToString('o');shop=@{id=$data.shop.id;name=$data.shop.name;myshopifyDomain=$data.shop.myshopifyDomain};releaseRun=$release;ageingRun=$ageing;products=$products;pages=$pages;reportingConfigured=([bool]$release -or [bool]$ageing -or [bool]$products.Count)}
}
