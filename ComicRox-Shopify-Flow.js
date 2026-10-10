'use strict';
(()=>{
 const $f=id=>document.getElementById(id),key='comicrox_shopify_actions_v1';
 let state={version:1,events:{},done:{},runs:{},last:null};
 try{const s=JSON.parse(localStorage.getItem(key)||'null');if(validState(s))state=s;}catch{}
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const iso=x=>{if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x))return null;const n=Date.parse(x);return Number.isFinite(n)?new Date(n).toISOString():null;};
 function validState(s){
  if(!s||s.version!==1||!s.events||Array.isArray(s.events)||typeof s.events!=='object'||!s.done||Array.isArray(s.done)||typeof s.done!=='object'||!s.runs||Array.isArray(s.runs)||typeof s.runs!=='object')return false;
  for(const [id,e]of Object.entries(s.events)){const date=Date.parse(e?.at);if(!e?.product||!/^gid:\/\/shopify\/Product\/\d+$/.test(e.product.id)||!Number.isFinite(date)||e.id!==id||id!==e.product.id+'|'+new Date(date).toISOString()||!Array.isArray(e.product.skus))return false;}
  for(const [id,at]of Object.entries(s.done))if(!s.events[id]||!Number.isFinite(Date.parse(at)))return false;
  for(const r of Object.values(s.runs))if(!['release','ageing'].includes(r.name)||!Number.isFinite(Date.parse(r.scheduledAt))||!Number.isInteger(r.matched)||r.matched<0||r.matched>100)return false;
  if(s.last&&(!Array.isArray(s.last.products)||!Number.isFinite(Date.parse(s.last.fetchedAt))))return false;
  return true;
 }
 const fmt=x=>x?new Date(x).toLocaleString('en-GB',{timeZone:'Europe/London'}):'Not recorded';
 function persist(next){localStorage.setItem(key,JSON.stringify(next));state=next;}
 function adminLink(p,shop){const id=String(p.id||'').match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1];const host=String(shop?.myshopifyDomain||'');return id&&/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(host)?'https://'+host+'/admin/products/'+id:null;}
 function merge(data){
  if(data.ok!==true||data.readOnly!==true||!Array.isArray(data.products))throw Error('Unsupported Shopify report response.');
  const next=JSON.parse(JSON.stringify(state));next.last=data;
  for(const p of data.products){
   if(!/^gid:\/\/shopify\/Product\/\d+$/.test(p.id))continue;
   const a=iso(p.descriptionAt),b=iso(p.tagsAt);if(a&&b&&a===b){const id=p.id+'|'+a;next.events[id]={id,product:p,at:a,shop:data.shop};}
  }
  for(const name of ['release','ageing']){const run=data[name+'Run'];if(run)next.runs[name+'|'+run.scheduledAt]={name,...run};}
  persist(next);
 }
 function status(name,run,products){
  if(!run)return 'No query marker recorded. Reporting may not be configured; this does not mean the Flow failed.';
  const when=iso(run.scheduledAt);let verified=0;
  for(const p of products){if(name==='release'){if(iso(p.descriptionAt)===when&&iso(p.tagsAt)===when)verified++;}else if(iso(p.agedAt)===when)verified++;}
  if(run.matched===0)return 'Query recorded '+fmt(when)+': zero matches; no product actions were required.';
  return 'Query recorded '+fmt(when)+': '+run.matched+' matched; '+verified+' product'+(verified===1?'':'s')+' with all required action markers.'+(verified===run.matched?' All matched products accounted for.':' Partial evidence — refresh after the Flow finishes; inspect Shopify run details if the gap remains.')+(run.matched>=run.limit?' Query reached its 100-product limit; additional eligible products may remain.':'');
 }
 function render(){
  const data=state.last;
  $f('flowReleaseStatus').textContent=data?status('release',data.releaseRun,data.products):'Not connected yet. Check the connection, then refresh Shopify report.';
  $f('flowAgeingStatus').textContent=data?status('ageing',data.ageingRun,data.products):'Not connected yet.';
  const partial=data?.products.filter(p=>{const a=iso(p.descriptionAt),b=iso(p.tagsAt);return(p.descriptionAt||p.tagsAt)&&(!a||!b||a!==b);})||[];
  $f('flowPartial').textContent=partial.length?partial.length+' product(s) have incomplete or differing release markers. They are not included as confirmed releases.':'';
  const filter=$f('flowFilter').value;
  const entries=Object.values(state.events).filter(e=>filter==='all'||(filter==='done'?!!state.done[e.id]:!state.done[e.id])).sort((a,b)=>b.at.localeCompare(a.at));
  $f('flowCount').textContent=Object.values(state.events).filter(e=>!state.done[e.id]).length+' outstanding recorded releases';
  $f('flowActions').innerHTML=entries.map(e=>{const url=adminLink(e.product,e.shop),done=state.done[e.id];return '<tr><td>'+escape(fmt(e.at))+'</td><td>'+escape(e.product.title)+'</td><td>'+escape((e.product.skus||[]).join(', '))+(e.product.skuListTruncated?'<br>Additional variants: open Shopify':'')+'</td><td>'+(url?'<a href="'+escape(url)+'" target="_blank" rel="noopener">Open Shopify</a>':'No product link')+'</td><td><button class="btn secondary flowDone" data-event="'+escape(e.id)+'">'+(done?'Done — undo':'Mark done')+'</button></td></tr>';}).join('')||'<tr><td colspan="5">No recorded releases for this filter. Existing New Release tags are not imported as release events.</td></tr>';
  for(const btn of document.querySelectorAll('.flowDone'))btn.onclick=()=>{try{const next=JSON.parse(JSON.stringify(state));if(next.done[btn.dataset.event])delete next.done[btn.dataset.event];else next.done[btn.dataset.event]=new Date().toISOString();persist(next);render();}catch{$f('flowStatus').textContent='Checklist could not save. Existing state was retained; download a backup.';}};
  $f('flowRunHistory').innerHTML=Object.values(state.runs).sort((a,b)=>b.scheduledAt.localeCompare(a.scheduledAt)).map(r=>'<tr><td>'+escape(r.name)+'</td><td>'+escape(fmt(r.scheduledAt))+'</td><td>'+r.matched+'</td></tr>').join('')||'<tr><td colspan="3">No run markers observed yet.</td></tr>';
  if(data)$f('flowSnapshot').textContent='Last loaded snapshot: '+fmt(data.fetchedAt)+'. Statuses describe that snapshot, not a live Flow execution log.';
 }
 async function read(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);try{const r=await fetch(url,{cache:'no-store',signal:controller.signal});const j=await r.json();if(!r.ok||j.ok!==true)throw Error(j.error||'Shopify report could not be read');return j;}finally{clearTimeout(timer);}}
 $f('flowCheck').onclick=async()=>{const btn=$f('flowCheck');btn.disabled=true;try{const r=await read('/api/admin/shopify-setup');if(r.readOnly!==true||!/^gid:\/\/shopify\/Shop\/\d+$/.test(r.shop?.id))throw Error('Invalid Shopify connection response');$f('flowShopId').textContent=r.shop.id;$f('flowConnection').textContent='Connected to '+r.shop.name+'. Granted scopes: '+r.scopes.join(', ')+'. '+(r.scopes.includes('read_products')?'Product-read permission present.':'Product-read permission missing.');}catch(e){$f('flowConnection').textContent=e.message;}finally{btn.disabled=false;}};
 $f('flowRefresh').onclick=async()=>{const btn=$f('flowRefresh');btn.disabled=true;$f('flowStatus').textContent='Reading Shopify reporting markers…';try{const data=await read('/api/admin/shopify-report');merge(data);render();$f('flowStatus').textContent=data.reportingConfigured?'Snapshot refreshed. Shopify was only read; no listings, tags, quantities or Flows were changed.':'Connected, but no reporting markers found. The draft Flow reporting actions have not been configured or have not run yet.';}catch(e){$f('flowStatus').textContent=e.message+' Last saved snapshot and checklist are retained.';}finally{btn.disabled=false;}};
 $f('flowSetupDraft').onclick=async()=>{try{const id=$f('flowShopId').textContent;if(!/^gid:\/\/shopify\/Shop\/\d+$/.test(id))throw Error('Check Shopify connection first to obtain the shop ID.');const r=await fetch('/SHOPIFY-FLOW-SETUP-DRAFT.txt',{cache:'no-store'});if(!r.ok)throw Error('Setup draft could not be loaded.');const text=(await r.text()).split('SHOP_GID_FROM_READ_ONLY_CHECK').join(id);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download='ComicRox-Flow-Setup-DRAFT.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$f('flowStatus').textContent='Draft downloaded with the checked shop ID. Nothing was written to Shopify; review before configuring or activating reporting actions.';}catch(e){$f('flowStatus').textContent=e.message;}};
 $f('flowFilter').onchange=render;
 $f('flowBackup').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='ComicRox-Shopify-Actions-Backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 $f('flowRestore').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const s=JSON.parse(await file.text());if(!validState(s))throw Error('Unsupported checklist backup');if(!confirm('Replace this local Shopify Actions history and checklist with the selected backup? Download the current backup first if needed.'))return;persist(s);render();$f('flowStatus').textContent='Local checklist backup restored. No Shopify changes.';}catch(err){$f('flowStatus').textContent=err.message;}finally{e.target.value='';}};
 for(const btn of document.querySelectorAll('[data-admin-tab]'))btn.onclick=()=>{const show=btn.dataset.adminTab;document.querySelectorAll('.adminApiPanel').forEach(e=>e.hidden=show!=='api');$f('flowPanel').hidden=show!=='shopify';document.querySelectorAll('[data-admin-tab]').forEach(e=>e.setAttribute('aria-pressed',String(e===btn)));};
 // Expose pure report helpers only for local, isolated verification.
 window.comicRoxFlowReport={merge,status,iso,adminLink,render};render();
})();
