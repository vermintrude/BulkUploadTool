'use strict';
(() => {
 const $ = id => document.getElementById(id), key = 'comicrox_price_checker_settings_v1';
 let report = null, settings = {rates: {}, ebayLimit: null, warningPercent: 80};
 try { const s = JSON.parse(localStorage.getItem(key)); if (s?.rates && typeof s.rates === 'object') settings = {...settings, ...s}; } catch {}
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function notice(message, bad = false) { $('pcStatus').textContent = message; $('pcStatus').className = bad ? 'pcError' : 'good'; }
 function number(value) { const n = Number(value); if (!Number.isFinite(n) || n < 0) throw Error('Invalid report figures. Last valid report retained.'); return n; }
 function validate(data) {
   if (data?.ok !== true || data.version !== 1 || !Array.isArray(data.daily) || !Array.isArray(data.models) || !data.coverage || !Number.isFinite(Date.parse(data.fetchedAt)) || data.timezone !== 'UTC') throw Error('Unsupported report. Check the Worker update.');
   for (const row of data.daily) {
     if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day)) throw Error('Invalid report day.');
     for (const k of ['checks','searches','photos','errors','ebayBrowse','ebayAuth','ebay429','averageMs']) number(row[k]);
   }
   for (const row of data.models) {
     if (typeof row.model !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) throw Error('Invalid model report.');
     for (const k of ['calls','unknown','input','cached','output']) number(row[k]);
     if (row.cached > row.input || row.unknown > row.calls) throw Error('Invalid token counts.');
   }
   return data;
 }
 function cost(rows) {
   let usd = 0, unknown = 0;
   for (const row of rows) {
     const rate = settings.rates[row.model];
     unknown += number(row.unknown);
     if (!rate || !['input','cached','output'].every(k => Number.isFinite(rate[k]) && rate[k] >= 0)) { unknown += number(row.calls) - number(row.unknown); continue; }
     usd += ((row.input - row.cached) * rate.input + row.cached * rate.cached + row.output * rate.output) / 1e6;
   }
   return {usd, unknown};
 }
 const formatCost = c => '$' + c.usd.toFixed(4) + (c.unknown ? ' known + ' + c.unknown + ' unknown-cost calls' : '');
 function chooseModel() {
   const rate = settings.rates[$('pcModel').value] || {};
   for (const k of ['input','cached','output']) $('pcRate'+k).value = rate[k] ?? '';
 }
 function render() {
   if (!report) return;
   const days = report.daily, sum = name => days.reduce((s,r) => s + number(r[name]), 0);
   const today = report.fetchedAt.slice(0,10), daily = days.find(r => r.day === today);
   const allCost = cost(report.models), todayCost = cost(report.models.filter(r => r.day === today));
   const total = sum('checks'), browse = sum('ebayBrowse'), used = daily ? number(daily.ebayBrowse) : 0;
   $('pcSummary').innerHTML = [['Recorded checks',total],['Price searches',sum('searches')],['Photo checks',sum('photos')],['Errors',sum('errors')],['eBay Browse calls',browse],['eBay auth calls',sum('ebayAuth')],['eBay 429 responses',sum('ebay429')],['Estimated AI USD',formatCost(allCost)]].map(([label,value]) => '<div>'+escape(label)+'<strong>'+escape(value)+'</strong></div>').join('');
   $('pcAverage').textContent = total ? 'Estimated known AI cost per recorded check: $'+(allCost.usd/total).toFixed(4)+(allCost.unknown ? ' (incomplete: some costs unknown).' : '.') : 'No recorded checks in this period.';
   const hasLimit = Number.isFinite(settings.ebayLimit) && settings.ebayLimit > 0;
   $('pcQuota').textContent = 'Today ('+today+', UTC): '+used+' recorded Browse calls'+(hasLimit ? ' / '+settings.ebayLimit+' configured daily allowance; '+Math.max(0,settings.ebayLimit-used)+' estimated remaining ('+(used/settings.ebayLimit*100).toFixed(1)+'% used).' : '. Enter your verified eBay Browse daily allowance below to show remaining calls.')+' Today’s estimated AI cost: '+formatCost(todayCost)+'.';
   const warning = [];
   if (hasLimit && used >= settings.ebayLimit*settings.warningPercent/100) warning.push('ACTION: eBay Browse usage has reached '+settings.warningPercent+'% of your configured daily allowance.');
   if (sum('ebay429')) warning.push('ACTION: eBay returned rate-limit responses. Check your eBay developer usage dashboard.');
   if (allCost.unknown) warning.push('ACTION: some AI costs are unknown. Add verified rates for each exact model and check OpenAI billing.');
   if (!hasLimit) warning.push('TO DO: enter your actual daily eBay Browse allowance. No allowance is assumed.');
   $('pcWarning').textContent = warning.join(' ');
   const previous = $('pcModel').value;
   const models = [...new Set([...report.models.map(r => r.model), ...Object.keys(settings.rates), 'gpt-5.4-mini'])];
   $('pcModel').innerHTML = models.map(m => '<option value="'+escape(m)+'">'+escape(m)+'</option>').join('');
   if (models.includes(previous)) $('pcModel').value = previous;
   chooseModel();
   $('pcDaily').innerHTML = days.map(r => '<tr>'+[r.day,r.searches,r.photos,r.errors,r.ebayBrowse,r.ebayAuth,r.ebay429,r.averageMs+' ms',formatCost(cost(report.models.filter(m => m.day===r.day)))].map(v => '<td>'+escape(v)+'</td>').join('')+'</tr>').join('') || '<tr><td colspan="9">No checks recorded yet.</td></tr>';
   $('pcModels').innerHTML = report.models.map(r => '<tr>'+[r.day,r.model,r.calls,r.input,r.cached,r.output,r.unknown,formatCost(cost([r]))].map(v => '<td>'+escape(v)+'</td>').join('')+'</tr>').join('') || '<tr><td colspan="8">No AI requests recorded in this period.</td></tr>';
   $('pcCoverage').textContent = 'Snapshot: '+new Date(report.fetchedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})+' UK time. First recorded check: '+(report.coverage.firstRecordedAt || 'none yet')+'. History before reporting was installed is unavailable. Requests are grouped by UTC day. '+(report.scope || '');
   $('pcDownload').disabled = false;
 }
 $('pcRefresh').onclick = async () => {
   const button = $('pcRefresh'); button.disabled = true;
   notice('Loading price-checker report…');
   const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 40000);
   try {
     const reportKey = $('pcKey').value.trim();
     if (reportKey.length < 32 || reportKey.length > 256 || /\s/.test(reportKey)) throw Error('TO DO: enter your private reporting key. It is not saved in the browser.');
     const response = await fetch('/api/admin/price-checker', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reportKey, days:Number($('pcDays').value)}),signal:controller.signal,cache:'no-store'});
     const data = await response.json();
     if (!response.ok) throw Error(data.error || 'Report could not load. Check the Worker setup.');
     report = validate(data); render(); notice('Report loaded. These are recorded requests, not unique customers.');
   } catch (error) { notice(error.name === 'AbortError' ? 'Report timed out. Last loaded figures are retained; try again.' : error.message, true); }
   finally {clearTimeout(timer);button.disabled = false;}
 };
 $('pcModel').onchange = chooseModel;
 $('pcSave').onclick = () => {
   try {
     const next = {...settings,rates:{...settings.rates}}, rate = {}, values = ['input','cached','output'].map(k => $('pcRate'+k).value.trim());
     if (values.some(Boolean)) {
       if (values.some(v => v==='')) throw Error('Enter all three model rates, including zero where appropriate, or leave all three blank.');
       ['input','cached','output'].forEach((k,i) => rate[k] = number(values[i]));
       next.rates[$('pcModel').value] = rate;
     }
     const limit = $('pcLimit').value.trim(); next.ebayLimit = limit === '' ? null : number(limit);
     if (next.ebayLimit !== null && (!Number.isSafeInteger(next.ebayLimit) || next.ebayLimit < 1)) throw Error('Daily allowance must be a positive whole number, or blank.');
     next.warningPercent = number($('pcPercent').value);
     if (next.warningPercent < 1 || next.warningPercent > 100) throw Error('Warning percentage must be between 1 and 100.');
     localStorage.setItem(key,JSON.stringify(next)); settings = next; render(); notice('Settings saved. Estimates recalculated; customer checks are unchanged.');
   } catch (error) { notice(error.message,true); }
 };
 $('pcLimit').value = settings.ebayLimit ?? ''; $('pcPercent').value = settings.warningPercent;
 $('pcDownload').onclick = () => {
   if (!report) return;
   const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({report,settings},null,2)],{type:'application/json'})); a.download = 'ComicRox-Price-Checker-Usage.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href),1000);
 };
 // Add the independent view without changing existing API/Shopify tab handlers.
 for (const button of document.querySelectorAll('[data-admin-tab]')) button.addEventListener('click', () => {
   const show = button.dataset.adminTab;
   $('pcPanel').hidden = show !== 'price-checker';
   if (show === 'price-checker') {
     document.querySelectorAll('.adminApiPanel').forEach(p => p.hidden = true); $('flowPanel').hidden = true;
     document.querySelectorAll('[data-admin-tab]').forEach(b => b.setAttribute('aria-pressed',String(b===button)));
   }
 });
})();
