'use strict';
const el=id=>document.getElementById(id),settingsKey='comicrox_admin_usage_settings_v1';
let events=[],settings={rates:{},threshold:null},selectedModel='',pricingDirty=false;
try{const stored=JSON.parse(localStorage.getItem(settingsKey)||'null');if(stored?.rates)settings=stored;}catch{}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>x===null?'Unknown':'$'+x.toFixed(4);
function eventCost(e){
 const r=settings.rates[e.model];if(!e.usageKnown||!r||![r.input,r.cached,r.output].every(v=>Number.isFinite(v)&&v>=0))return null;
 const i=Number(e.inputTokens),c=Number(e.cachedTokens),o=Number(e.outputTokens);
 if(![i,c,o].every(v=>Number.isFinite(v)&&v>=0)||c>i)return null;
 return ((i-c)*r.input+c*r.cached+o*r.output)/1e6;
}
function total(items){let cost=0,unknown=0,tokens=0;for(const e of items){const v=eventCost(e);if(v===null)unknown++;else cost+=v;if(e.usageKnown)tokens+=Number(e.totalTokens)||0;}return{cost,unknown,tokens};}
function summaryCost(t){return t.unknown?money(t.cost)+' known + '+t.unknown+' unknown':money(t.cost);}
function readModel(){selectedModel=el('model').value;const r=settings.rates[selectedModel]||{};for(const k of ['input','cached','output'])el(k).value=r[k]??'';el('threshold').value=settings.threshold??'';}
function render(){
 const models=[...new Set(['gpt-6-astra',...events.map(e=>e.model).filter(Boolean),...Object.keys(settings.rates)])];const keep=el('model').value||selectedModel;
 el('model').innerHTML=models.map(m=>'<option>'+esc(m)+'</option>').join('');if(models.includes(keep))el('model').value=keep;if(!pricingDirty)readModel();
 const all=total(events),now=new Date(),daily=events.filter(e=>{const d=new Date(e.at);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate();}),today=total(daily);
 el('requests').textContent=events.length;el('tokens').textContent=all.tokens.toLocaleString();el('cost').textContent=summaryCost(all);el('today').textContent=summaryCost(today);
 el('warning').textContent=settings.threshold!==null&&today.cost>=settings.threshold?'Daily spending warning: known estimated usage has reached your $'+settings.threshold+' threshold.':today.unknown?'Some costs are unknown. Check pricing and OpenAI billing; the daily warning cannot cover unknown usage.':'';
 const groups=new Map();for(const e of events){const key=e.runId||e.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 el('runs').innerHTML=[...groups].reverse().slice(0,30).map(([id,list])=>{const t=total(list);return '<tr><td>'+esc(new Date(list[0].at).toLocaleString())+'</td><td>'+esc(id.slice(0,12))+'</td><td>'+list.length+'</td><td>'+t.tokens+'</td><td>'+esc(summaryCost(t))+'</td><td>'+t.unknown+'</td></tr>';}).join('')||'<tr><td colspan="6">No runs recorded yet.</td></tr>';
 el('events').innerHTML=events.slice(-100).reverse().map(e=>'<tr><td>'+esc(new Date(e.at).toLocaleString())+'</td><td>'+esc(e.stage)+'<br>'+esc(e.model)+'</td><td>'+esc(e.status)+(e.usageKnown?'':' — usage unknown')+'</td><td>'+esc(e.inputTokens)+' / '+esc(e.cachedTokens)+' / '+esc(e.outputTokens)+'</td><td>'+money(eventCost(e))+'</td></tr>').join('')||'<tr><td colspan="5">No requests recorded yet.</td></tr>';
 updateEstimate();
}
function updateEstimate(){
 const pairs=[];for(let i=1;i<events.length;i++){const a=events[i-1],b=events[i];if(a.stage==='identification'&&b.stage==='issue verification'&&a.runId===b.runId&&a.status==='returned'&&b.status==='returned'&&a.photos===b.photos&&eventCost(a)!==null&&eventCost(b)!==null)pairs.push(eventCost(a)+eventCost(b));}
 const n=Number(el('comics').value),sample=pairs.slice(-20);el('estimate').textContent=sample.length&&Number.isInteger(n)&&n>0&&n<=1000?'Estimated '+money(sample.reduce((s,x)=>s+x,0)/sample.length*n)+' for '+n+' comics, based on '+sample.length+' recent complete two-request comics.':'Not enough complete usage/pricing information for a batch estimate yet.';
}
async function refresh(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{const r=await fetch('/api/admin/usage',{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error('Usage request failed');const data=await r.json();if(!Array.isArray(data.events))throw Error('Invalid usage response');events=data.events;render();el('status').textContent='Updated '+new Date().toLocaleTimeString()+'. '+data.scope+(data.ignoredLines?' '+data.ignoredLines+' unreadable log lines omitted.':'');}
 catch{el('status').textContent='Usage could not refresh; server may be processing a comic. Last loaded data is retained. Try Refresh after the request finishes.';}
 finally{clearTimeout(timer);}
}
el('model').onchange=()=>{pricingDirty=false;readModel();};for(const k of ['input','cached','output','threshold'])el(k).addEventListener('input',()=>{pricingDirty=true;});el('comics').oninput=updateEstimate;
el('save').onclick=()=>{try{const rate={};for(const k of ['input','cached','output']){if(el(k).value.trim()==='')throw Error('Enter all three rates; zero is allowed.');rate[k]=Number(el(k).value);if(!Number.isFinite(rate[k])||rate[k]<0)throw Error('Rates must be non-negative numbers.');}const threshold=el('threshold').value.trim()===''?null:Number(el('threshold').value);if(threshold!==null&&(!Number.isFinite(threshold)||threshold<0))throw Error('Threshold must be non-negative or blank.');const next={rates:{...settings.rates,[selectedModel]:rate},threshold};localStorage.setItem(settingsKey,JSON.stringify(next));settings=next;pricingDirty=false;render();el('settingsStatus').textContent='Settings saved. Estimates recalculated; processing unchanged.';}catch(e){el('settingsStatus').textContent=e.message;}};
el('refresh').onclick=refresh;el('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),scope:'Bulk Listing Tool usage metadata only',events,settings},null,2)],{type:'application/json'}));a.download='ComicRox-API-Usage-Backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
refresh();setInterval(()=>{if(!document.hidden)refresh();},15000);
