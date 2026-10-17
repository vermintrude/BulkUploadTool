/* Append to the supplied V3.0 Worker using Build-Price-Checker-Reporting.ps1.
 * Metadata only: no photos, prompts, customer IDs, IPs, titles or secrets stored.
 * Search/classification/identification behavior is preserved.
 */
// Per-Worker-instance token reuse only. No customer responses or images cached.
// Credentials are included in a hash so secret rotation cannot reuse an old token.
// Cache plain JSON text and numeric expiry ONLY. Workers response streams are
// request-owned and MUST NEVER be cached or shared across request contexts.
const pcTokenCache = new Map();
const pcTokenPending = new Map();
const pcTokenResponse = snapshot => new Response(snapshot.text, {
  status: snapshot.status, headers: snapshot.headers
});
async function pcTrackedFetch(env, input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const tokenRequest = (init?.method || 'GET').toUpperCase() === 'POST' && (
    url.hostname === 'api.ebay.com' && url.pathname === '/identity/v1/oauth2/token' ||
    url.hostname === env.SHOPIFY_STORE_DOMAIN && url.pathname === '/admin/oauth/access_token');
  if (!tokenRequest) return pcRecordedFetch(env, input, init);
  const auth = new Headers(init?.headers).get('Authorization') || '';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url.href+'\n'+auth+'\n'+String(init?.body || '')));
  const key = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
  const cached = pcTokenCache.get(key);
  if (cached && cached.expires > Date.now()) return pcTokenResponse(cached);
  pcTokenCache.delete(key);
  if (pcTokenPending.has(key)) return pcTokenResponse(await pcTokenPending.get(key));
  const pending = (async () => {
    const issuedAt = Date.now();
    const response = await pcRecordedFetch(env, input, init);
    // Consume inside the originating request; downstream gets a NEW Response.
    const snapshot = {text: await response.text(), status: response.status,
      headers: Array.from(response.headers.entries()), expires: 0};
    if (response.ok) {
      try {
        const data = JSON.parse(snapshot.text), seconds = Number(data.expires_in);
        if (typeof data.access_token === 'string' && data.access_token && Number.isFinite(seconds) && seconds > 120) {
          snapshot.expires = issuedAt + Math.min(seconds-60,3600)*1000;
          if (pcTokenCache.size >= 8) pcTokenCache.delete(pcTokenCache.keys().next().value);
          pcTokenCache.set(key,snapshot);
        }
      } catch { /* Failed/malformed/missing-expiry responses are never retained. */ }
    }
    return snapshot;
  })();
  pcTokenPending.set(key,pending);
  try {return pcTokenResponse(await pending);} finally {pcTokenPending.delete(key);}
}

async function pcRecordedFetch(env, input, init) {
  const event = env.__comicRoxUsage;
  if (!event) return fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  const browse = url.hostname === 'api.ebay.com' && url.pathname.startsWith('/buy/browse/');
  const auth = url.hostname === 'api.ebay.com' && url.pathname === '/identity/v1/oauth2/token';
  const ai = url.hostname === 'api.openai.com' && url.pathname === '/v1/responses';
  if (browse) event.ebayBrowse++;
  if (auth) event.ebayAuth++;
  let usage;
  if (ai) {
    let model = 'unknown';
    try { model = JSON.parse(init?.body || '{}').model || model; } catch {}
    usage = {model, known: false, input: 0, cached: 0, output: 0};
    event.ai.push(usage);
  }
  const response = await fetch(input, init);
  if (response.status === 401 && (browse || url.hostname === env.SHOPIFY_STORE_DOMAIN)) pcTokenCache.clear();
  if ((browse || auth) && response.status === 429) event.ebay429++;
  if (usage) {
    try {
      const data = await response.clone().json(), u = data.usage;
      const i = u?.input_tokens, o = u?.output_tokens;
      const c = u?.input_tokens_details?.cached_tokens ?? 0;
      if ([i, c, o].every(n => Number.isSafeInteger(n) && n >= 0) && c <= i) {
        Object.assign(usage, {known: true, input: i, cached: c, output: o});
      }
      if (typeof data.model === 'string' && data.model.length < 120) usage.model = data.model;
    } catch { /* Missing usage remains unknown, including billed failed responses. */ }
  }
  return response;
}
function pcReportJson(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-ComicRox-Monitoring': '3.0.1'
  }});
}
async function pcAuthorized(request, env) {
  const secret = env.COMICROX_REPORT_KEY;
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const supplied = request.headers.get('Authorization') || '';
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(supplied), digest('Bearer ' + secret)]);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function pcReport(request, env) {
  if (!await pcAuthorized(request, env)) return pcReportJson({ok: false, error: 'Reporting key required.'}, 401);
  if (request.method !== 'GET') return pcReportJson({ok: false, error: 'Use GET.'}, 405);
  if (!env.COMICROX_USAGE) return pcReportJson({ok: false, error: 'Create the reporting database and bind it as COMICROX_USAGE.'}, 503);
  const days = Number(new URL(request.url).searchParams.get('days') || 7);
  if (![1, 7, 31].includes(days)) return pcReportJson({ok: false, error: 'Choose 1, 7 or 31 days.'}, 400);
  const now = new Date(), start = new Date(now); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - days + 1);
  try {
    const db = env.COMICROX_USAGE;
    const results = await db.batch([
      db.prepare(`SELECT substr(at,1,10) day, count(*) checks,
        sum(kind='search') searches, sum(kind='photo') photos,
        sum(status>=400) errors, sum(ebay_browse) ebayBrowse,
        sum(ebay_auth) ebayAuth, sum(ebay_429) ebay429,
        round(avg(duration_ms)) averageMs
        FROM pc_usage WHERE at>=? GROUP BY day ORDER BY day DESC`).bind(start.toISOString()),
      db.prepare(`SELECT substr(e.at,1,10) day, json_extract(j.value,'$.model') model,
        count(*) calls, sum(json_extract(j.value,'$.known')=0) unknown,
        sum(json_extract(j.value,'$.input')) input,
        sum(json_extract(j.value,'$.cached')) cached,
        sum(json_extract(j.value,'$.output')) output
        FROM pc_usage e, json_each(e.ai) j WHERE e.at>=?
        GROUP BY day, model ORDER BY day DESC, model`).bind(start.toISOString()),
      db.prepare('SELECT min(at) firstRecordedAt, max(at) lastRecordedAt, count(*) recordedChecks FROM pc_usage')
    ]);
    if (results.some(r => r.success === false)) throw Error('database');
    return pcReportJson({ok: true, version: 1, days, timezone: 'UTC', fetchedAt: now.toISOString(),
      start: start.toISOString(), daily: results[0].results, models: results[1].results,
      coverage: results[2].results[0], scope: 'Recorded requests to this Worker only; other applications and unrecorded traffic are excluded.'});
  } catch {
    return pcReportJson({ok: false, error: 'Reporting database is unavailable or its setup SQL has not been run. Customer checks remain available.'}, 503);
  }
}
async function pcSaveEvent(env, event) {
  if (!env.COMICROX_USAGE) return;
  const result = await env.COMICROX_USAGE.prepare(`INSERT OR IGNORE INTO pc_usage
    (id,at,kind,status,duration_ms,ebay_browse,ebay_auth,ebay_429,ai)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(event.id, event.at, event.kind, event.status,
      event.durationMs, event.ebayBrowse, event.ebayAuth, event.ebay429, JSON.stringify(event.ai)).run();
  if (result?.success === false) throw Error('report-write-failed');
}
function pcVersionResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('X-ComicRox-Monitoring', '3.0.1');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/admin/usage') return pcReport(request, env);
    const kind = url.searchParams.get('shopifytest') === '1' ? null :
      url.pathname === '/identify' && request.method === 'POST' ? 'photo' :
      url.pathname !== '/identify' && request.method === 'GET' && url.searchParams.get('title') ? 'search' : null;
    if (!kind) return pcVersionResponse(await comicRoxChecker.fetch(request, env));
    const event = {id: crypto.randomUUID(), at: new Date().toISOString(), kind,
      status: 500, durationMs: 0, ebayBrowse: 0, ebayAuth: 0, ebay429: 0, ai: []};
    const started = Date.now();
    try {
      const response = await comicRoxChecker.fetch(request, {...env, __comicRoxUsage: event});
      event.status = response.status;
      return pcVersionResponse(response);
    } finally {
      event.durationMs = Date.now() - started;
      // Fail open: a reporting outage must not break customer checks.
      const save = pcSaveEvent(env, event).catch(() => console.warn('COMICROX_REPORT_WRITE_FAILED'));
      if (ctx?.waitUntil) ctx.waitUntil(save); else await save;
    }
  }
};
