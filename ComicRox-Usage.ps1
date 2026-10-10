# Additive local telemetry. No API keys, prompts, photographs or comic descriptions are saved.
$ComicRoxUsageFile = Join-Path $Root 'ComicRox-API-Usage.ndjson'
function Get-ComicRoxUsage {
  $events=@();$ignored=0
  if(Test-Path -LiteralPath $ComicRoxUsageFile){
    foreach($line in [IO.File]::ReadAllLines($ComicRoxUsageFile)){
      if(!$line.Trim()){continue}
      try{$events+=($line | ConvertFrom-Json)}catch{$ignored++}
    }
  }
  return @{ok=$true;events=$events;ignoredLines=$ignored;scope='This local listing tool only; starts when this build is installed.'}
}
function Invoke-ComicRoxAI {
  param([string]$Body,[string]$Key,[string]$Stage,[string]$RunId,[int]$PhotoCount)
  if($RunId -notmatch '^[A-Za-z0-9-]{1,100}$'){$RunId=[guid]::NewGuid().ToString()}
  $event=[ordered]@{id=[guid]::NewGuid().ToString();at=[DateTime]::UtcNow.ToString('o');runId=$RunId;app='Bulk Listing Tool';stage=$Stage;photos=$PhotoCount;model='';status='failed';usageKnown=$false;inputTokens=0;cachedTokens=0;outputTokens=0;totalTokens=0}
  try{
    $request=$Body | ConvertFrom-Json;$event.model=[string]$request.model
    $response=Invoke-RestMethod -Method Post -Uri 'https://api.openai.com/v1/chat/completions' -Headers @{Authorization="Bearer $Key"} -ContentType 'application/json' -Body $Body -TimeoutSec 90
    $event.status='returned'
    if($response.model){$event.model=[string]$response.model}
    if($null -ne $response.usage -and $null -ne $response.usage.prompt_tokens -and $null -ne $response.usage.completion_tokens){
      $event.usageKnown=$true
      $event.inputTokens=[long]$response.usage.prompt_tokens
      $event.outputTokens=[long]$response.usage.completion_tokens
      $event.totalTokens=$event.inputTokens+$event.outputTokens
      if($response.usage.prompt_tokens_details -and $null -ne $response.usage.prompt_tokens_details.cached_tokens){$event.cachedTokens=[long]$response.usage.prompt_tokens_details.cached_tokens}
    }
    return $response
  }finally{
    # Telemetry failure must never interrupt identification or change its response/error.
    try{
      $line=($event | ConvertTo-Json -Depth 4 -Compress)+[Environment]::NewLine
      [IO.File]::AppendAllText($ComicRoxUsageFile,$line,(New-Object Text.UTF8Encoding($false)))
    }catch{Log 'API usage recording unavailable; identification continues unchanged.'}
  }
}
