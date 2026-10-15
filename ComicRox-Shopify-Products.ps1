# Read-only selected-product lookups using the app's existing Shopify credentials.
# Never fetch a supplied URL and never send a GraphQL mutation.
function Find-ComicRoxShopifyProducts([string]$term) {
  $term=$term.Trim()
  if(!$term -or $term.Length -gt 200 -or $term -match '[\r\n\x00-\x1f]'){throw 'Enter a product title, SKU, Shopify product link or product ID (up to 200 characters).'}
  $search=$term
  if($term -match '^https?://'){
    try{$uri=[Uri]$term}catch{throw 'Invalid product link.'}
    if($uri.AbsolutePath -match '/products/(\d+)/?$'){$search='id:'+$matches[1]}
    elseif($uri.AbsolutePath -match '/products/([a-zA-Z0-9-]+)/?$'){$search='handle:'+$matches[1]}
    else{throw 'Use a Shopify product link containing /products/ followed by the product handle or numeric admin product ID.'}
  }elseif($term -match '^\d{10,}$'){$search='id:'+$term}
  else {
    # Quote the user text as a search value; an asterisk allows supplier SKUs/title prefixes.
    $quoted='"'+($term.Replace('\','\\').Replace('"','\"'))+'"'
    $search='(title:'+$quoted+' OR sku:'+$quoted+')'
  }
  $connection=Get-ComicRoxFlowHeaders
  $query=@'
query ComicRoxProductSearch($query:String!) {
 products(first:25,query:$query,sortKey:UPDATED_AT,reverse:true) {
  nodes { id title handle status onlineStoreUrl featuredImage { url } variants(first:1) { nodes { sku price inventoryQuantity } } }
  pageInfo { hasNextPage }
 }
}
'@
  $data=Invoke-ComicRoxFlowQuery $connection $query @{query=$search}
  if(!$data.products -or $null -eq $data.products.pageInfo.hasNextPage){throw 'Shopify returned incomplete search results. Try again.'}
  return @{ok=$true;readOnly=$true;products=@($data.products.nodes);more=[bool]$data.products.pageInfo.hasNextPage;fetchedAt=[DateTime]::UtcNow.ToString('o')}
}
function Get-ComicRoxShopifySelectedProducts($ids) {
  $ids=@($ids)
  if(!$ids.Count -or $ids.Count -gt 20){throw 'Choose between 1 and 20 Shopify products per batch.'}
  $seen=@{}
  foreach($id in $ids){if([string]$id -notmatch '^gid://shopify/Product/\d+$' -or $seen.ContainsKey([string]$id)){throw 'Invalid or repeated Shopify product ID.'};$seen[[string]$id]=$true}
  $connection=Get-ComicRoxFlowHeaders
  $query=@'
query ComicRoxSelectedProduct($id:ID!) {
 product(id:$id) {
  id title handle onlineStoreUrl status descriptionHtml tags
  category { fullName }
  publisher: metafield(namespace:"custom",key:"publisher") { value }
  releaseDate: metafield(namespace:"custom",key:"release_date") { value }
  images(first:10) { nodes { url } }
  variants(first:100) {
   nodes { id title sku price inventoryQuantity selectedOptions { name value } image { url }
    inventoryItem { measurement { weight { value unit } } }
   }
   pageInfo { hasNextPage }
  }
 }
}
'@
  $out=@()
  foreach($id in $ids){
    $data=Invoke-ComicRoxFlowQuery $connection $query @{id=[string]$id}
    if(!$data.product -or $data.product.id -ne $id){throw 'A selected Shopify product was deleted or could not be read. Search again; no partial batch has replaced your selection.'}
    if($null -eq $data.product.variants.pageInfo.hasNextPage -or $data.product.variants.pageInfo.hasNextPage){throw 'A selected product has an incomplete or oversized variant list. Use the full comparison or an appropriate variation template.'}
    $out+=,$data.product
  }
  return @{ok=$true;readOnly=$true;products=@($out);fetchedAt=[DateTime]::UtcNow.ToString('o')}
}
