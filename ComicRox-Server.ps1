$ErrorActionPreference = 'Stop'
$Port = 18789
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PhotoRoot = 'C:\Users\steve\OneDrive\Documents\Businesses\ComicRox\Comic_Photos'
$BulkRoot = 'C:\Users\steve\OneDrive\Documents\Businesses\ComicRox\BulkUploadTool'
$GetScript = Join-Path $BulkRoot 'Get-ComicRox-Shopify-Files.ps1'
$FilesCsv = Join-Path $BulkRoot 'ComicRox-Shopify-Files.csv'
$UploadScript = Join-Path $Root 'Upload-ComicRox-Shopify-Files.ps1'
$LogFile = Join-Path $Root 'ComicRox-Server.log'
$ShopifyEnvFile = 'C:\Users\steve\OneDrive\Documents\Businesses\ComicRox\BulkUploadTool\Shopify-env-dont-delete\comicrox-shopify.env'

function Log($m){ Add-Content -LiteralPath $LogFile -Value ("{0}  {1}" -f (Get-Date -Format s),$m) -ErrorAction SilentlyContinue }
function Send-Bytes($ctx,[byte[]]$bytes,$type='application/octet-stream',$status=200){
  $ctx.Response.StatusCode=$status; $ctx.Response.ContentType=$type; $ctx.Response.ContentLength64=$bytes.Length
  $ctx.Response.KeepAlive=$false
  $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length); $ctx.Response.OutputStream.Flush(); $ctx.Response.Close()
}
function Send-Text($ctx,$text,$type='text/plain; charset=utf-8',$status=200){ Send-Bytes $ctx ([Text.Encoding]::UTF8.GetBytes([string]$text)) $type $status }
function Send-Json($ctx,$obj,$status=200){ Send-Text $ctx ($obj | ConvertTo-Json -Depth 10 -Compress) 'application/json; charset=utf-8' $status }
function Safe-PhotoPath($p){
  if([string]::IsNullOrWhiteSpace($p)){throw 'No photo path supplied.'}
  $full=[IO.Path]::GetFullPath($p); $base=[IO.Path]::GetFullPath($PhotoRoot)
  if(-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Photo path is outside the ComicRox photo folder.'}
  return $full
}
function Read-Body($req){$sr=New-Object IO.StreamReader($req.InputStream,$req.ContentEncoding);try{return $sr.ReadToEnd()}finally{$sr.Dispose()}}

. (Join-Path $Root 'ComicRox-Usage.ps1')

Remove-Item -LiteralPath $LogFile -ErrorAction SilentlyContinue
Log "Starting. Root=$Root PhotoRoot=$PhotoRoot"
if(-not (Test-Path -LiteralPath $PhotoRoot)){ Write-Host "ERROR: Photo folder not found: $PhotoRoot" -ForegroundColor Red; Log 'Photo folder missing'; Read-Host 'Press Enter to close'; exit 1 }

$listener=New-Object System.Net.HttpListener
$listener.IgnoreWriteExceptions=$true
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "Could not start local server: $($_.Exception.Message)" -ForegroundColor Red; Log $_.Exception.ToString(); Read-Host 'Press Enter to close'; exit 1 }
Write-Host "ComicRox Listing Tool V2.5.23 running at http://localhost:$Port/" -ForegroundColor Green
Write-Host "Photo folder: $PhotoRoot"
Write-Host 'KEEP THIS WINDOW OPEN while using the tool.' -ForegroundColor Yellow
Start-Process "http://localhost:$Port/"

while($listener.IsListening){
  try { $ctx=$listener.GetContext() } catch { Log ("GetContext error: "+$_.Exception.Message); continue }
  try {
    $path=$ctx.Request.Url.AbsolutePath; Log ($ctx.Request.HttpMethod+' '+$path)
    if($path -eq '/') { Send-Bytes $ctx ([IO.File]::ReadAllBytes((Join-Path $Root 'ComicRox-Listing-Tool.html'))) 'text/html; charset=utf-8'; continue }
    if($path -eq '/admin' -and $ctx.Request.HttpMethod -eq 'GET'){ Send-Bytes $ctx ([IO.File]::ReadAllBytes((Join-Path $Root 'ComicRox-Admin.html'))) 'text/html; charset=utf-8'; continue }
    if($path -eq '/ComicRox-Resume.js' -and $ctx.Request.HttpMethod -eq 'GET'){ Send-Bytes $ctx ([IO.File]::ReadAllBytes((Join-Path $Root 'ComicRox-Resume.js'))) 'application/javascript; charset=utf-8'; continue }
    if($path -eq '/ComicRox-Admin.js' -and $ctx.Request.HttpMethod -eq 'GET'){ Send-Bytes $ctx ([IO.File]::ReadAllBytes((Join-Path $Root 'ComicRox-Admin.js'))) 'application/javascript; charset=utf-8'; continue }
    if($path -eq '/ComicRox-Usage.js' -and $ctx.Request.HttpMethod -eq 'GET'){ Send-Bytes $ctx ([IO.File]::ReadAllBytes((Join-Path $Root 'ComicRox-Usage.js'))) 'application/javascript; charset=utf-8'; continue }
    if($path -eq '/api/admin/usage' -and $ctx.Request.HttpMethod -eq 'GET'){ Send-Json $ctx (Get-ComicRoxUsage); continue }
    if($path -eq '/favicon.ico'){ Send-Bytes $ctx ([byte[]]@()) 'image/x-icon' 204; continue }
    if($path -eq '/api/health'){ Send-Json $ctx @{ok=$true;photoFolder=$PhotoRoot;photoFolderExists=(Test-Path -LiteralPath $PhotoRoot)}; continue }
    if($path -eq '/api/latest'){
      $raw=$ctx.Request.QueryString['count']; $n=35; if($raw){$tmp=0;if([int]::TryParse($raw,[ref]$tmp)){$n=$tmp}}
      if($n -lt 1){$n=10}; if($n -gt 200){$n=200}
      $all = Get-ChildItem -LiteralPath $PhotoRoot -File -ErrorAction Stop | Where-Object { $_.Extension -match '^\.(png|jpg|jpeg|webp)$' }
      $selected = @($all | Sort-Object LastWriteTime,Name -Descending | Select-Object -First $n)
      $items = @($selected | ForEach-Object { [pscustomobject]@{name=$_.Name;path=$_.FullName;modified=$_.LastWriteTime.ToString('o');size=$_.Length} })
      # Force JSON array even for 0/1 result.
      $json = ConvertTo-Json -InputObject $items -Depth 5 -Compress
      Send-Text $ctx $json 'application/json; charset=utf-8'; continue
    }
    if($path -eq '/api/photo'){
      $p=Safe-PhotoPath ([uri]::UnescapeDataString($ctx.Request.QueryString['path'])); if(-not(Test-Path -LiteralPath $p)){throw 'Photo not found.'}
      $ext=[IO.Path]::GetExtension($p).ToLower(); $type=@{'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.webp'='image/webp'}[$ext]; if(!$type){$type='application/octet-stream'}
      Send-Bytes $ctx ([IO.File]::ReadAllBytes($p)) $type; continue
    }
    if($path -eq '/api/upload-shopify' -and $ctx.Request.HttpMethod -eq 'POST'){
      $body=Read-Body $ctx.Request | ConvertFrom-Json; $paths=@($body.paths | ForEach-Object { Safe-PhotoPath $_ })
      if(!$paths.Count){throw 'No photos selected.'}; if(-not(Test-Path -LiteralPath $UploadScript)){throw "Missing uploader: $UploadScript"}
      $output=& $UploadScript -BulkRoot $BulkRoot -EnvFile $ShopifyEnvFile -Paths $paths 2>&1 | Out-String
      Send-Json $ctx @{ok=$true;message=$output.Trim()}; continue
    }
    if($path -eq '/api/refresh-shopify' -and $ctx.Request.HttpMethod -eq 'POST'){
      # V2.4.10: refresh directly through Shopify GraphQL instead of launching the old helper script,
      # which can wait indefinitely. This uses the same local client credentials as the uploader.
      $envFile=$ShopifyEnvFile
      if(-not(Test-Path -LiteralPath $envFile)){throw "Missing Shopify settings file: $envFile"}
      $vars=@{}
      Get-Content -LiteralPath $envFile | ForEach-Object {
        $line=$_.Trim()
        if($line -and -not $line.StartsWith('#')){
          $line=$line -replace '^export\s+','' -replace '^set\s+','' -replace '^\$env:',''
          if($line -match '^([^=:#\s]+)\s*[=:]\s*(.+?)\s*$'){ $vars[$matches[1].Trim()]=$matches[2].Trim().Trim('"').Trim("'") }
        }
      }
      $clientId=$vars['SHOPIFY_CLIENT_ID']; $clientSecret=$vars['SHOPIFY_CLIENT_SECRET']; $shop=$vars['SHOPIFY_SHOP']
      if(!$shop){$shop=$vars['SHOPIFY_STORE']}; if(!$shop){$shop=$vars['SHOP_DOMAIN']}; if(!$shop){$shop='ytksb5-wz'}
      if(!$clientId -or !$clientSecret){throw 'Shopify Client ID / Client Secret are missing from the existing settings file.'}
      $shop=$shop -replace '^https?://','' -replace '/.*$','' -replace '\.myshopify\.com$',''
      if($shop -ieq 'comicrox.co.uk'){$shop='ytksb5-wz'}
      $tokenResponse=Invoke-RestMethod -Method Post -Uri "https://$shop.myshopify.com/admin/oauth/access_token" -ContentType 'application/x-www-form-urlencoded' -Body @{grant_type='client_credentials';client_id=$clientId;client_secret=$clientSecret} -TimeoutSec 20
      if(!$tokenResponse.access_token){throw 'Shopify did not return an access token while refreshing image links.'}
      $api="https://$shop.myshopify.com/admin/api/2026-07/graphql.json"
      $q='query { files(first:250, sortKey:CREATED_AT, reverse:true) { nodes { __typename id fileStatus createdAt ... on MediaImage { alt image { url } } ... on GenericFile { url } } } }'
      $body=@{query=$q}|ConvertTo-Json -Compress
      $r=Invoke-RestMethod -Method Post -Uri $api -Headers @{'X-Shopify-Access-Token'=$tokenResponse.access_token;'Content-Type'='application/json'} -Body $body -TimeoutSec 30
      if($r.errors){throw ($r.errors|ConvertTo-Json -Depth 5 -Compress)}
      $rows=@($r.data.files.nodes | ForEach-Object {
        $url=$null; if($_.__typename -eq 'MediaImage' -and $_.image){$url=$_.image.url} elseif($_.__typename -eq 'GenericFile'){$url=$_.url}
        if($url){
          $cdnName=([uri]$url).Segments[-1].Split('?')[0]
          $altName=if($_.__typename -eq 'MediaImage' -and $_.alt){[string]$_.alt}else{''}
          [pscustomobject]@{Filename=$(if($altName){$altName}else{$cdnName});Alt=$altName;CdnFilename=$cdnName;Created=$_.createdAt;URL=$url}
        }
      })
      $json=ConvertTo-Json -InputObject $rows -Depth 5 -Compress; Send-Text $ctx $json 'application/json; charset=utf-8'; continue
    }
    if($path -eq '/api/ebay-active-prices' -and $ctx.Request.HttpMethod -eq 'POST'){
      try{
        $reader=New-Object IO.StreamReader($ctx.Request.InputStream,$ctx.Request.ContentEncoding)
        $body=$reader.ReadToEnd() | ConvertFrom-Json
        $q=[string]$body.q
        if([string]::IsNullOrWhiteSpace($q)){Send-Json $ctx @{ok=$false;error='No search title.'};continue}

        # Read the process environment first, then the saved Windows User environment.
        # This lets the tool work even when Windows Explorer has not yet refreshed its environment.
        $clientId=$env:EBAY_CLIENT_ID
        $clientSecret=$env:EBAY_CLIENT_SECRET
        if([string]::IsNullOrWhiteSpace($clientId)){$clientId=[Environment]::GetEnvironmentVariable('EBAY_CLIENT_ID','User')}
        if([string]::IsNullOrWhiteSpace($clientSecret)){$clientSecret=[Environment]::GetEnvironmentVariable('EBAY_CLIENT_SECRET','User')}
        if([string]::IsNullOrWhiteSpace($clientId) -or [string]::IsNullOrWhiteSpace($clientSecret)){
          Send-Json $ctx @{ok=$false;needsCredentials=$true;error='eBay API keys not configured — opening eBay search instead.'};continue
        }

        $basic=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$clientId`:$clientSecret"))
        $tok=Invoke-RestMethod -Method Post -Uri 'https://api.ebay.com/identity/v1/oauth2/token' -Headers @{Authorization="Basic $basic";'Content-Type'='application/x-www-form-urlencoded'} -Body 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
        $headers=@{Authorization="Bearer $($tok.access_token)";'X-EBAY-C-MARKETPLACE-ID'='EBAY_GB'}

        function Invoke-EbaySearch([string]$query,[string]$gtin,[bool]$ukOnly=$false){
          $filter=if($ukOnly){'deliveryCountry:GB,itemLocationCountry:GB'}else{'deliveryCountry:GB'}
          $base='https://api.ebay.com/buy/browse/v1/item_summary/search?limit=50&filter='+[Uri]::EscapeDataString($filter)
          if(-not [string]::IsNullOrWhiteSpace($gtin)){
            $uri="$base&gtin=$([Uri]::EscapeDataString($gtin))"
          }else{
            $uri="$base&q=$([Uri]::EscapeDataString($query))"
          }
          Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
        }
        function Norm([string]$x){
          if($null -eq $x){return ''}
          return (($x.ToLowerInvariant() -replace '[^a-z0-9]+',' ') -replace '\s+',' ').Trim()
        }
        function HasTerm([string]$hay,[string]$term){
          $n=Norm $term;if(-not $n){return $false};return (' '+(Norm $hay)+' ').Contains(' '+$n+' ')
        }

        $upc=([string]$body.upc).Trim()
        $gtinOk=$upc -match '^\d{8,14}$'
        $source='title'
        $res=$null
        if($gtinOk){
          try{$res=Invoke-EbaySearch '' $upc $true;if(@($res.itemSummaries).Count){$source='GTIN'}}catch{$res=$null}
        }
        if($null -eq $res -or -not @($res.itemSummaries).Count){$res=Invoke-EbaySearch $q '' $true; $source='title'}

        $issue=([string]$body.issueNumber).Trim()
        $cover=([string]$body.coverArtist).Trim()
        $variant=((([string]$body.variantType)+' '+([string]$body.variantDescription)).Trim())
        $ratio='';if($q -match '\b1\s*[:/]\s*\d+\b'){$ratio=($matches[0] -replace '\s','')}
        $qNorm=Norm $q
        $stop=@('the','and','for','with','cover','variant','edition','comic','comics','new','inc','of','a','an','dc','marvel')
        $core=@((Norm $q).Split(' ') | Where-Object {$_.Length -ge 3 -and $stop -notcontains $_} | Select-Object -First 8)

        $candidates=@()
        foreach($it in @($res.itemSummaries)){
          if(-not $it.price -or $it.price.currency -ne 'GBP'){continue}
          $v=[double]$it.price.value;if($v -le 0 -or $v -ge 500){continue}
          $title=[string]$it.title;$titleNorm=Norm $title;$score=0

          # For normal raw comics, reject fundamentally different products before scoring.
          # If the ComicRox/Lunar title itself says it is graded/signed/a set, those terms are allowed.
          $qRaw=Norm $q
          $wantsGraded=($qRaw -match '\b(cgc|cbcs|pgx|graded|slab|slabbed)\b')
          $wantsSigned=($qRaw -match '\b(signed|signature|autograph)\b')
          $wantsSet=($qRaw -match '\b(set|lot|bundle|collection|run)\b')
          if(-not $wantsGraded -and $titleNorm -match '\b(cgc|cbcs|pgx|graded|slab|slabbed)\b'){continue}
          if(-not $wantsSigned -and $titleNorm -match '\b(signed|signature|autograph|coa)\b'){continue}
          if(-not $wantsSet -and $titleNorm -match '\b(set|lot|bundle|collection|run)\b'){continue}
          # Reject common multi-copy listings for a single-comic product.
          if(-not $wantsSet -and $titleNorm -match '\b[2-9]\s*(copy|copies|pack|books|comics)\b'){continue}

          if($source -eq 'GTIN'){$score=20}
          else{
            foreach($term in $core){if(HasTerm $title $term){$score++}}
            if($issue){
              $escIssue=[regex]::Escape($issue)
              if($title -match "(?i)(?:#|no\.?\s*)?$escIssue(?![0-9])"){$score+=5}else{$score-=5}
            }
            if($ratio){$r=[regex]::Escape($ratio).Replace(':','\s*[:/]\s*');if($title -match "(?i)$r"){$score+=5}else{$score-=2}}
            if($cover){foreach($n in (Norm $cover).Split(' ')|Where-Object{$_.Length -ge 4}){if(HasTerm $title $n){$score+=2}}}
            foreach($n in (Norm $variant).Split(' ')|Where-Object{$_.Length -ge 4 -and $stop -notcontains $_}){if(HasTerm $title $n){$score++}}
          }
          $ship=0.0
          if($it.shippingOptions){
            $shipVals=@($it.shippingOptions | ForEach-Object { if($_.shippingCost -and $_.shippingCost.currency -eq 'GBP'){[double]$_.shippingCost.value} } | Where-Object {$_ -ge 0})
            if($shipVals.Count){$ship=($shipVals|Measure-Object -Minimum).Minimum}
          }
          $country=if($it.itemLocation){[string]$it.itemLocation.country}else{''}
          $candidates += [pscustomobject]@{price=$v;delivered=($v+$ship);shipping=$ship;country=$country;score=$score;title=$title}
        }
        if(-not $candidates.Count){Send-Json $ctx @{ok=$false;error='No GBP active listings found.'};continue}

        if($source -eq 'GTIN'){$matched=@($candidates)}
        else{
          $best=($candidates|Measure-Object score -Maximum).Maximum
          $threshold=[math]::Max(4,$best-3)
          $matched=@($candidates|Where-Object {$_.score -ge $threshold})
          if(-not $matched.Count){$matched=@($candidates|Sort-Object score -Descending|Select-Object -First 10)}
        }
        $vals=@($matched|ForEach-Object {$_.price}|Sort-Object)

        # Robust outlier removal. Active eBay searches can contain collector-priced mistakes,
        # slabs or special listings even after title filtering. Use Tukey's IQR fences when
        # there are enough comps, then use the MEDIAN as the main market benchmark.
        $used=$vals
        if($vals.Count -ge 5){
          function Percentile([object[]]$a,[double]$p){
            if($a.Count -eq 1){return [double]$a[0]}
            $pos=($a.Count-1)*$p;$lo=[math]::Floor($pos);$hi=[math]::Ceiling($pos)
            if($lo -eq $hi){return [double]$a[$lo]}
            return ([double]$a[$lo] + (([double]$a[$hi]-[double]$a[$lo])*($pos-$lo)))
          }
          $q1=Percentile $vals 0.25;$q3=Percentile $vals 0.75;$iqr=$q3-$q1
          if($iqr -gt 0){
            $lower=[math]::Max(0.01,$q1-(1.5*$iqr));$upper=$q3+(1.5*$iqr)
            $filtered=@($vals|Where-Object {$_ -ge $lower -and $_ -le $upper})
            if($filtered.Count -ge 3){$used=$filtered}
          }
        }
        $avg=($used|Measure-Object -Average).Average
        $median=Percentile $used 0.5
        Send-Json $ctx @{ok=$true;marketBasis='UK located';ukOnly=$true;median=[math]::Round($median,2);avg=[math]::Round($avg,2);min=[math]::Round(($used|Measure-Object -Minimum).Minimum,2);max=[math]::Round(($used|Measure-Object -Maximum).Maximum,2);count=$used.Count;matchedCount=$matched.Count;rawCount=$candidates.Count;excluded=($vals.Count-$used.Count);query=$q;source=$source};continue
      }catch{
        Send-Json $ctx @{ok=$false;error=$_.Exception.Message};continue
      }
    }

    # Planner-only route. Existing batch handlers below remain unchanged.
    if($path -eq '/api/lunar-public-dates' -and $ctx.Request.HttpMethod -eq 'POST'){
      try{
        $body=Read-Body $ctx.Request | ConvertFrom-Json
        $codes=@($body.codes | ForEach-Object {([string]$_).Trim().ToUpperInvariant()} | Select-Object -Unique)
        if(-not $codes.Count -or $codes.Count -gt 500){ Send-Json $ctx @{ok=$false;error='Supply between 1 and 500 Lunar product codes.'}; continue }
        if(@($codes | Where-Object {$_ -notmatch '^\d{4}[A-Z]{2}\d+$'}).Count){ Send-Json $ctx @{ok=$false;error='Invalid Lunar product code.'}; continue }
        $dates=@{}; $sources=@{}; $unresolved=@(); $errors=@{}
        foreach($code in $codes){
          try{
            $url='https://www.lunardistribution.com/home/search?term='+[uri]::EscapeDataString($code)
            $response=Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 20
            $found=@(); $invalid=$false
            # Only read dates from the exact product's attributes, never neighbouring results or dialog labels.
            foreach($tag in [regex]::Matches([string]$response.Content,'(?is)<div\b[^>]*>')){
              $cm=[regex]::Match($tag.Value,'(?is)\bdata-code\s*=\s*["'']([^"'']*)["'']')
              if(-not $cm.Success -or [Net.WebUtility]::HtmlDecode($cm.Groups[1].Value).Trim().ToUpperInvariant() -ne $code){continue}
              $dm=[regex]::Match($tag.Value,'(?is)\bdata-instore\s*=\s*["'']([^"'']*)["'']')
              $date=[datetime]::MinValue
              if(-not $dm.Success -or -not [datetime]::TryParseExact([Net.WebUtility]::HtmlDecode($dm.Groups[1].Value),[string[]]@('M/d/yyyy','MM/dd/yyyy'),[Globalization.CultureInfo]::GetCultureInfo('en-US'),[Globalization.DateTimeStyles]::None,[ref]$date)){$invalid=$true;continue}
              $found+=@{iso=$date.ToString('yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture);raw=$dm.Groups[1].Value}
            }
            $distinct=@($found | ForEach-Object {$_.iso} | Select-Object -Unique)
            if(-not $invalid -and $distinct.Count -eq 1){
              $dates[$code]=[string]$distinct[0]
              $sources[$code]=@{url=$url;retrievedAt=[datetime]::UtcNow.ToString('o');format='Lunar data-instore M/d/yyyy';raw=$found[0].raw}
            }else{
              $unresolved+=$code
              $errors[$code]=if($invalid){'Missing or invalid exact-product date.'}elseif($distinct.Count -gt 1){'Conflicting exact-product dates.'}else{'No exact-product date found.'}
            }
          }catch{
            $unresolved+=$code; $errors[$code]=$_.Exception.Message
          }
        }
        Send-Json $ctx @{ok=$true;dates=$dates;sources=$sources;requested=$codes.Count;matched=$dates.Count;unresolved=$unresolved;errors=$errors};continue
      }catch{
        Send-Json $ctx @{ok=$false;error=$_.Exception.Message};continue
      }
    }

    if($path -eq '/api/lunar-product-data-direct' -and $ctx.Request.HttpMethod -eq 'POST'){
      try{
        $reader=New-Object IO.StreamReader($ctx.Request.InputStream,$ctx.Request.ContentEncoding)
        $body=$reader.ReadToEnd() | ConvertFrom-Json
        $codes=@($body.codes | ForEach-Object {[string]$_} | Where-Object {$_})
        if(-not $codes.Count){ Send-Json $ctx @{ok=$false;error='No Lunar codes supplied.'}; continue }

        $session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
        $res=Invoke-WebRequest -Uri 'https://www.lunardistribution.com/resources' -WebSession $session -UseBasicParsing -MaximumRedirection 5
        $page=[string]$res.Content
        if($page -match '(?i)login|sign in' -and $page -notmatch '(?i)Search by Lunar Codes or ISBNs/UPCs'){
          Send-Json $ctx @{ok=$false;loginRequired=$true;error='Lunar login required.'}; continue
        }

        # Discover the form containing the Lunar code/ISBN search rather than hard-coding Lunar's private endpoint.
        $formMatch=[regex]::Match($page,'(?is)<form\b[^>]*action=["'']?([^"'' >]*)[^>]*>(?:(?!</form>).)*Search by Lunar Codes or ISBNs/UPCs(?:(?!</form>).)*</form>')
        if(-not $formMatch.Success){
          Send-Json $ctx @{ok=$false;error='Could not safely discover Lunar product-data form.'}; continue
        }
        $formHtml=$formMatch.Value
        $action=$formMatch.Groups[1].Value
        if([string]::IsNullOrWhiteSpace($action)){$action='/resources'}
        if($action -notmatch '^https?://'){$action=([Uri]::new([Uri]'https://www.lunardistribution.com/resources',$action)).AbsoluteUri}

        $ta=[regex]::Match($formHtml,'(?is)<textarea\b[^>]*name=["'']([^"'']+)["''][^>]*>')
        if(-not $ta.Success){Send-Json $ctx @{ok=$false;error='Could not discover Lunar code field.'};continue}
        $field=$ta.Groups[1].Value
        $payload=@{}
        foreach($m in [regex]::Matches($formHtml,'(?is)<input\b[^>]*name=["'']([^"'']+)["''][^>]*value=["'']([^"'']*)["''][^>]*>')){$payload[$m.Groups[1].Value]=$m.Groups[2].Value}
        $payload[$field]=($codes -join "`r`n")

        # Identify the Lunar-format Products submit control if it has a named value.
        $submit=[regex]::Match($formHtml,'(?is)<(?:input|button)\b[^>]*name=["'']([^"'']+)["''][^>]*value=["'']([^"'']*Products[^"'']*)["''][^>]*>')
        if($submit.Success){$payload[$submit.Groups[1].Value]=$submit.Groups[2].Value}

        $dl=Invoke-WebRequest -Uri $action -Method Post -Body $payload -WebSession $session -UseBasicParsing -MaximumRedirection 5
        $ct=[string]$dl.Headers['Content-Type']
        $content=[string]$dl.Content
        if($content -match '(^|,|")Code("|,)' -and $content -match 'ImageUrl'){
          Send-Json $ctx @{ok=$true;name='Lunar_Product_Data_Auto.csv';text=$content};continue
        }
        Send-Json $ctx @{ok=$false;error='Lunar returned a web page rather than Product Data CSV.'};continue
      }catch{
        Send-Json $ctx @{ok=$false;error=$_.Exception.Message};continue
      }
    }

    if($path -eq '/api/lunar-latest-product-data'){
      $sinceMs = 0
      try { $sinceMs = [double]$ctx.Request.QueryString['since'] } catch {}
      $downloads = Join-Path $env:USERPROFILE 'Downloads'
      $candidate = Get-ChildItem -LiteralPath $downloads -File -Filter '*.csv' -ErrorAction SilentlyContinue |
        Where-Object {
          $_.Name -match '(?i)lunar.*product|product.*data|Lunar_Product_Data' -and
          ([DateTimeOffset]$_.LastWriteTime).ToUnixTimeMilliseconds() -ge ($sinceMs - 3000)
        } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
      if(-not $candidate){ Send-Json $ctx @{ok=$true;found=$false}; continue }
      try{
        $txt=[IO.File]::ReadAllText($candidate.FullName)
        if($txt -notmatch '(^|,|\")Code(\"|,)' -or $txt -notmatch 'ImageUrl'){
          Send-Json $ctx @{ok=$true;found=$false}; continue
        }
        Send-Json $ctx @{ok=$true;found=$true;name=$candidate.Name;text=$txt}; continue
      }catch{
        Send-Json $ctx @{ok=$true;found=$false}; continue
      }
    }

    if($path -eq '/api/identify' -and $ctx.Request.HttpMethod -eq 'POST'){
      # V2.4.16.9: AI identifies one comic from one or more photographs, then verifies issue number.
      # User-entered notes remain authoritative and are applied in the browser.
      $body=Read-Body $ctx.Request | ConvertFrom-Json
      $rawPaths=@($body.paths)
      if(-not $rawPaths.Count -and $body.path){$rawPaths=@($body.path)}
      $photos=@($rawPaths | ForEach-Object { Safe-PhotoPath ([string]$_) })
      if(-not $photos.Count){throw 'No photos supplied for identification.'}
      foreach($photo in $photos){if(-not(Test-Path -LiteralPath $photo)){throw "Photo not found: $photo"}}
      $envFile=$ShopifyEnvFile
      if(-not(Test-Path -LiteralPath $envFile)){throw "Missing settings file: $envFile"}
      $openAIKey=$null
      Get-Content -LiteralPath $envFile | ForEach-Object {
        $line=$_.Trim()
        if($line -and -not $line.StartsWith('#')){
          $line=$line -replace '^export\s+','' -replace '^set\s+','' -replace '^\$env:',''
          if($line -match '^OPENAI_API_KEY\s*=\s*(.+?)\s*$'){ $openAIKey=$matches[1].Trim().Trim('"').Trim("'") }
        }
      }
      if(!$openAIKey){throw 'OPENAI_API_KEY is missing from comicrox-shopify.env.'}
      $imageParts=@()
      foreach($photo in $photos){
        $ext=[IO.Path]::GetExtension($photo).ToLower(); $mime=@{'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.webp'='image/webp'}[$ext]
        if(!$mime){throw 'Unsupported photo type for identification.'}
        $b64=[Convert]::ToBase64String([IO.File]::ReadAllBytes($photo))
        $imageParts += @{type='image_url';image_url=@{url=("data:$mime;base64,$b64");detail='high'}}
      }
      $prompt=@'
You are identifying a single physical comic book from one or more photographs of the same physical copy for ComicRox, a UK comic retailer. Use all supplied photographs together; later images may show the back cover, barcode, indicia, signatures, interior pages, or close-up details.
Read the visible cover carefully. Return ONLY one valid JSON object with exactly these string fields:
title, description, publisher, year, variant, confidence.
Rules:
- title: concise retailer title, maximum 80 characters. Prefer this format when supported: Series #Issue (Year) Publisher. Do NOT include grade, price, quantity, or routine Direct Edition wording in the title. Add an edition/variant only when it materially distinguishes the comic.
- description: 1-3 clean, factual sentences suitable for a UK comic retailer. Identify the series/issue and publisher/year when supported, plus only genuinely useful edition/variant/key information that is supported. Do not narrate the cover artwork just to fill space. Do NOT invent creators, first appearances, key status, printing, variant name, cover artist, barcode facts, story details, or release dates. Use plain English and normal ASCII punctuation only; avoid smart quotes, em dashes, symbols, and unusual encoded characters.
- publisher: publisher/imprint only when identifiable; otherwise empty string.
- year: four-digit cover/publication year only when reasonably confident; otherwise empty string.
- variant: useful variant, printing, newsstand/direct, key detail, or cover detail ONLY when clearly visible or confidently identifiable; otherwise empty string.
- confidence: high, medium, or low.
FACSIMILE / REPRINT YEAR RULE:
- If this physical comic is a facsimile, reprint, replica, anniversary reprint, or later printing of an older issue, the year field MUST be the publication year of THIS physical edition, NOT the original issue's year.
- Do not copy the original issue's historic year into year for a facsimile/reprint.
- If the actual facsimile/reprint publication year cannot be established confidently from the photographed edition, return year as an empty string.
- Make clear in variant when the photographed comic is a Facsimile or Reprint.

CRITICAL ISSUE-NUMBER CHECK:
- Read the printed issue number from the cover itself, especially small text near the barcode, price box, masthead or corner.
- Distinguish multi-digit numbers carefully (for example #12 must not become #2).
- Do not infer an issue number from cover art, series sequence, memory, or visual similarity.
- Before returning JSON, re-check the visible issue number a second time.
Never estimate grade, condition, price or quantity. If uncertain, leave fields blank rather than guessing.
'@
      $payload=@{
        model='gpt-6-astra'
        messages=@(@{role='user';content=@(@{type='text';text=$prompt}) + $imageParts})
        response_format=@{type='json_object'}
        max_completion_tokens=900
      } | ConvertTo-Json -Depth 12 -Compress
      try {
        $ai=Invoke-ComicRoxAI -Body $payload -Key $openAIKey -Stage 'identification' -RunId ([string]$ctx.Request.Headers['X-ComicRox-Run']) -PhotoCount $photos.Count
      } catch {
        $detail=$_.Exception.Message
        try { if($_.ErrorDetails.Message){$detail=$_.ErrorDetails.Message} } catch {}
        throw "OpenAI identification failed: $detail"
      }
      $text=[string]$ai.choices[0].message.content
      if([string]::IsNullOrWhiteSpace($text)){throw 'OpenAI returned no identification text.'}
      try {$result=$text | ConvertFrom-Json} catch {throw 'OpenAI returned an unreadable identification result.'}

      # Independent second pass dedicated to the tiny printed issue number.
      $candidate=''
      if(([string]$result.title) -match '#\s*([0-9]+(?:\.[0-9]+)?)'){$candidate=$matches[1]}
      $verifyPrompt=@"
Independently verify ONLY the printed comic issue number using all supplied photographs of this same comic.
Do not trust a previous answer merely because it was suggested.
First-pass candidate: $candidate
Inspect tiny cover text carefully, including barcode, price box, masthead and corner areas.
Multi-digit accuracy is critical: distinguish 12 from 2, 11 from 1, and similar cases.
The first-pass candidate is NOT evidence. Confirm it only if you can independently read every printed digit.
Return ONLY JSON with string fields issue_number and confidence.
issue_number must contain digits only (or a genuine decimal), with no # symbol.
confidence must be high, medium, or low.
Use high confidence ONLY when every digit is visibly readable. If any leading or trailing digit is ambiguous, return an empty issue_number and low confidence rather than guessing.
"@
      $verifyPayload=@{
        model='gpt-6-astra'
        messages=@(@{role='user';content=@(@{type='text';text=$verifyPrompt}) + $imageParts})
        response_format=@{type='json_object'}
        max_completion_tokens=250
      } | ConvertTo-Json -Depth 12 -Compress
      try {
        $v=Invoke-ComicRoxAI -Body $verifyPayload -Key $openAIKey -Stage 'issue verification' -RunId ([string]$ctx.Request.Headers['X-ComicRox-Run']) -PhotoCount $photos.Count
        $vr=([string]$v.choices[0].message.content) | ConvertFrom-Json
        $verified=[string]$vr.issue_number
        if($verified -match '^\d+(?:\.\d+)?$' -and ([string]$vr.confidence) -eq 'high'){
          $result.title=[regex]::Replace([string]$result.title,'#\s*\d+(?:\.\d+)?',('#'+$verified),1)
          $result.description=[regex]::Replace([string]$result.description,'#\s*\d+(?:\.\d+)?',('#'+$verified),1)
          $result | Add-Member -NotePropertyName issue_number_verified -NotePropertyValue $verified -Force
          $result | Add-Member -NotePropertyName issue_number_confidence -NotePropertyValue ([string]$vr.confidence) -Force
          if(([string]$vr.confidence) -ne 'high'){$result.confidence='medium'}
        }
      } catch {
        $result | Add-Member -NotePropertyName issue_number_verified -NotePropertyValue '' -Force
        $result | Add-Member -NotePropertyName issue_number_confidence -NotePropertyValue 'unverified' -Force
      }
      Send-Json $ctx @{ok=$true;result=$result}; continue
    }
    Send-Text $ctx 'Not found' 'text/plain' 404
  } catch {
    $msg=$_.Exception.Message; Log ("REQUEST ERROR: "+$msg+"`n"+$_.Exception.ToString())
    try { Send-Json $ctx @{ok=$false;error=$msg} 500 } catch { Log ('Could not send error response: '+$_.Exception.Message) }
  }
}
