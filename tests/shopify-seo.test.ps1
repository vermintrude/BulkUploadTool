$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../Apply-ComicRox-SEO.ps1')
function Assert($value,$message){if(!$value){throw $message}}
$script:requests=@();$script:live=@{id='gid://shopify/Product/123';handle='batman';title='Batman #1';seo=@{title='';description='Owner custom description'};releaseDate=@{value='2026-12-09'}}
function Start-Sleep {}
function Invoke-ComicRoxSEORequest($connection,[string]$query,$variables){
 $script:requests+=@{query=$query;variables=$variables}
 if($query.StartsWith('query')){return @{products=@{nodes=@($script:live)}}}
 Assert ($query.Contains('productUpdate(product:$product)')) 'Use supported productUpdate input'
 $keys=@($variables.product.Keys|Sort-Object);Assert (($keys -join ',') -eq 'id,seo') 'Mutation must not contain title, description, inventory, variants or price'
 foreach($field in $variables.product.seo.Keys){$script:live.seo[$field]=$variables.product.seo[$field]}
 return @{productUpdate=@{product=@{id=$script:live.id;seo=$script:live.seo};userErrors=@()}}
}
$plan=@{schema='comicrox-shopify-seo-v1';createdAt=[DateTime]::UtcNow.ToString('o');changes=@(@{handle='batman';productTitle='Batman #1';releaseDate='2026-12-09';expected=@{title=''};seo=@{title='Batman #1 - Jim Lee | ComicRox'}})}
$r=@(Invoke-ComicRoxSEOPlan @{} $plan);Assert ($r[0].status -eq 'Ready') 'Preview should show ready';Assert (@($script:requests|Where-Object {$_.query.StartsWith('mutation')}).Count -eq 0) 'Preview must not mutate'
$r=@(Invoke-ComicRoxSEOPlan @{} $plan -DoApply);Assert ($r[0].status -eq 'Updated') 'Apply should report confirmed update';Assert ($script:live.seo.description -eq 'Owner custom description') 'Omitted manual SEO must remain unchanged'
$before=@($script:requests|Where-Object {$_.query.StartsWith('mutation')}).Count
$r=@(Invoke-ComicRoxSEOPlan @{} $plan -DoApply);Assert ($r[0].status -eq 'Already matches') 'Retry must be idempotent';Assert (@($script:requests|Where-Object {$_.query.StartsWith('mutation')}).Count -eq $before) 'Retry must not mutate again'
$script:live.seo.title='New owner wording';$r=@(Invoke-ComicRoxSEOPlan @{} $plan -DoApply);Assert ($r[0].status -eq 'Skipped / check') 'Live manual edits must be preserved';Assert ($script:live.seo.title -eq 'New owner wording') 'Manual title must remain unchanged'
$script:live.title='Revised product title';$r=@(Invoke-ComicRoxSEOPlan @{} $plan -DoApply);Assert ($r[0].message -match 'Product title changed') 'Stale source details must be held'
$bad=$plan|ConvertTo-Json -Depth 10|ConvertFrom-Json;$bad.changes[0].seo|Add-Member NoteProperty price '9';try{Test-ComicRoxSEOPlan $bad;throw 'Unsafe field accepted'}catch{Assert ($_.Exception.Message -match 'Only SEO|fields') 'Reject arbitrary mutation fields'}
$bad.createdAt=[DateTime]::UtcNow.AddDays(-2).ToString('o');try{Test-ComicRoxSEOPlan $bad;throw 'Stale plan accepted'}catch{Assert ($_.Exception.Message -match 'stale') 'Require fresh plan'}
Write-Host 'SEO helper checks passed: preview, SEO-only input, manual override, stale-source, idempotence and invalid plans.'
