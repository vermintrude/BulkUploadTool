/* Guided Lunar workflow. Local browser state only; no Shopify writes. */
'use strict';
const lunarWorkflowKey='comicrox_lunar_workflow_v2';
let lunarMaster=null;
const lunarFailedImages=new Set();
let lunarExportBusy=false;
const lunarBeforeKey='comicrox_lunar_before_v260';
let lunarBeforeBackup=localStorage.getItem(lunarBeforeKey);
if(!lunarBeforeBackup){const values={};for(const k of [LUNAR_BATCH_STORE_KEY,PLANNER_ORDERS_KEY,PLANNER_DATES_KEY,PLANNER_PENDING_KEY,PLANNER_STORE_KEY]){const value=localStorage.getItem(k);if(value!==null)values[k]=value;}lunarBeforeBackup=JSON.stringify({schema:1,at:new Date().toISOString(),values});try{localStorage.setItem(lunarBeforeKey,lunarBeforeBackup);}catch(e){console.warn('Automatic Lunar backup could not be persisted; download it before continuing.');}}

function lunarReadState(){const v=JSON.parse(localStorage.getItem(lunarWorkflowKey)||'{"schema":2,"exports":[]}');if(v.schema!==2||!Array.isArray(v.exports)||(v.deferred!==undefined&&(!Array.isArray(v.deferred)||v.deferred.some(x=>!x.batchId||!x.code||!Array.isArray(x.reasons)))))throw Error('Invalid workflow history. Restore a verified backup.');return v;}
function lunarWriteState(v){localStorage.setItem(lunarWorkflowKey,JSON.stringify(v));}
savedBatchForWeek=function(key){return loadLunarBatches().find(b=>b.weekKey===key&&!b.invoiceId&&b.status!=='published')||null;};
function lunarActive(){return loadLunarBatches().find(b=>b.id===activeLunarBatchId);}
function lunarISO(v){return pLunarISO(v)||'';}
function lunarBaseTitle(v,r={}){
 let t=cleanWholesaleTitle(v).replace(/\s*[-—–:]?\s+PRE[- ]?ORDER\s*$/i,'').trim();
 if(t.length<=80)return t;
 // Remove supplier punctuation and shorten wording, preserving issue, printing and edition.
 t=t.replace(/\bOF\s+\d+\b/gi,'').replace(/\bCard Stock\b/gi,'Cardstock').replace(/\bSecond Printing\b/gi,'2nd Printing').replace(/\bThird Printing\b/gi,'3rd Printing').replace(/\bCover\s+([A-Z])\b/g,'Cvr $1').replace(/\s+/g,' ').trim();
 if(t.length>80&&r.coverArtist){const full=String(r.coverArtist).trim();const surname=full.split(/\s+/).pop();if(full.includes(' '))t=t.replace(new RegExp(full.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),surname);}
 return t; // Never cut identifying words: export blocks if a reviewed title still exceeds 80.
}
releaseClass=function(r){const iso=lunarISO(r.release);if(!iso)return'review';const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const age=(Date.parse(today)-Date.parse(iso))/86400000;return age<0?'preorder':age<28?'new_release':'historic';};
storefrontTitle=function(r){const t=lunarBaseTitle(r.cleanTitle||r.rawTitle,r);return releaseClass(r)==='preorder'?t+' — PRE-ORDER':t;};
storefrontDescription=function(r){const body=wholesaleDesc(r);return releaseClass(r)==='preorder'?`PRE-ORDER — OFFICIAL RELEASE DATE: ${prettyRelease(lunarISO(r.release))}. This item will not be dispatched before its official release date.\n\n${body}`:body;};
const lunarOriginalPersist=persistActiveLunarBatch;
persistActiveLunarBatch=function(){lunarOriginalPersist();if(!activeLunarBatchId)return;const all=loadLunarBatches(),b=all.find(x=>x.id===activeLunarBatchId);if(!b)return;b.costSettings={fx:pricingSetting('usdGbpRate',.75),freightUsd:pricingSetting('inboundFreightUsd',.50),mailerGbp:pricingSetting('mailerGbp',.35)};b.costSnapshot=wholesaleRecords.map(r=>({code:r.code,qty:Number(r.qty),unitUsd:Number(r.cost),preparedUnitGbp:wholesaleLandedCost(r),sellPrice:r.sellPrice,invoiceTotalUsd:r.invoiceTotalUsd,invoiceLines:r.invoiceLines}));saveLunarBatches(all);};
const lunarOriginalOpen=openSavedLunarBatch;
openSavedLunarBatch=function(id){const b=loadLunarBatches().find(x=>x.id===id);if(!b)return;persistActiveLunarBatch();if(b.costSettings)for(const [id,k]of [['usdGbpRate','fx'],['inboundFreightUsd','freightUsd'],['mailerGbp','mailerGbp']])$(id).value=b.costSettings[k];lunarOriginalOpen(id);lunarRefreshGuide();};
// Product data must not overwrite an owner's reviewed title, price, description or image.
const lunarOriginalEnrich=applyLunarProductDataText;
applyLunarProductDataText=function(text,name){const saved=wholesaleRecords.map(r=>({...r}));const result=lunarOriginalEnrich(text,name);for(let i=0;i<wholesaleRecords.length;i++){const r=wholesaleRecords[i],old=saved[i];if(old.productDataMatched||old.ownerReviewed){for(const k of ['cleanTitle','comicRoxDescription','imageUrl'])if(old[k])r[k]=old[k];if(old.sellPrice){r.sellPrice=old.sellPrice;r.priceMode=old.priceMode;}}r.release=lunarISO(r.release)||r.release;}renderWholesale();persistActiveLunarBatch();lunarRefreshGuide();return result;};
document.addEventListener('input',e=>{const i=e.target.dataset?.wi;if(i!==undefined&&wholesaleRecords[+i])wholesaleRecords[+i].ownerReviewed=true;});
// Decimal USD arithmetic keeps supplier lines exact; only the blended per-unit
// display cost may need rounding (8 decimal places). Never merge by title alone.
function lunarInvoiceMoney(value, label) {
 const text=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,8})?$/.test(text))throw Error('Invalid '+label+'. No changes have been applied.');
 const [whole,fraction='']=text.split('.');
 return BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
}
function lunarInvoiceMoneyText(value) {
 const whole=value/100000000n,fraction=String(value%100000000n).padStart(8,'0').replace(/0+$/,'');
 return String(whole)+(fraction?'.'+fraction:'');
}
function lunarInvoiceRows(text,name){
 const rows=parseCsv(text.replace(/^\uFEFF/,''));
 const hi=rows.findIndex(r=>r[0]?.trim()==='Code'&&r[1]?.trim()==='Title');
 const id=(text.match(/Invoice\s*#\s*(\d+)/i)||name.match(/Invoice[_ ](\d+)/i))?.[1];
 if(hi<0||!id)throw Error('Choose the original Lunar Invoice_*.csv, not an order, dates file or product-data file.');
 const h=rows[hi].map(v=>v.trim()),idx=n=>h.indexOf(n);
 for(const n of ['Code','Title','Qty','Discounted Price','Retail','In-Store Date'])if(idx(n)<0)throw Error('Invoice column missing: '+n);
 const groups=new Map();let lineCount=0;
 for(let i=hi+1;i<rows.length;i++){
  const row=rows[i],get=n=>String(row[idx(n)]??'').trim(),code=get('Code').toUpperCase();
  if(!/^\d{4}[A-Z]{2}\d+$/i.test(code))continue;
  const qty=Number(get('Qty'));
  if(!/^\d+$/.test(get('Qty'))||!Number.isSafeInteger(qty)||qty<=0)throw Error('Invoice adjustment or invalid quantity/cost for '+code+'. No changes have been applied.');
  const cost=lunarInvoiceMoney(get('Discounted Price'),'invoice unit cost for '+code);
  const retail=lunarInvoiceMoney(get('Retail'),'invoice retail price for '+code);
  const release=lunarISO(get('In-Store Date'));
  if(!release)throw Error('Invalid official release date for '+code);
  const title=get('Title'),upc=get('UPC');
  if(!title)throw Error('Missing invoice title for '+code);
  const total=cost*BigInt(qty);
  if(get('Total')&&lunarInvoiceMoney(get('Total'),'invoice line total for '+code)!==total)throw Error('Invoice line total does not match quantity and unit cost for '+code+'. Review the original invoice; no changes have been applied.');
  const identity=JSON.stringify([title.replace(/\s+/g,' ').toUpperCase(),upc,release,String(retail)]);
  const signature=JSON.stringify(row.map(v=>String(v).trim()));
  let group=groups.get(code);
  if(group){
   if(group.identity!==identity)throw Error('Conflicting invoice details for repeated code '+code+' (title, UPC, release date or retail price). No changes have been applied.');
   if(group.signatures.has(signature))throw Error('Identical invoice line repeated for '+code+'. Review this invoice before importing; no changes have been applied.');
   if(!Number.isSafeInteger(group.qty+qty))throw Error('Invoice quantity is too large for '+code);
   group.qty+=qty;group.total+=total;group.signatures.add(signature);
  }else{
   group={code,title,upc,release,retail,cost,qty,total,identity,signatures:new Set([signature]),lines:[]};groups.set(code,group);
  }
  group.lines.push({lineNumber:i+1,quantity:qty,unitUsd:lunarInvoiceMoneyText(cost),totalUsd:lunarInvoiceMoneyText(total),discount:get('Discount'),retailUsd:lunarInvoiceMoneyText(retail),upc,release,rawTitle:title,purchaseOrder:get('PO Number')});
  lineCount++;
 }
 if(!groups.size)throw Error('Invoice contains no supported product rows.');
 const records=[...groups.values()].map(g=>{
  const blended=(g.total+BigInt(Math.floor(g.qty/2)))/BigInt(g.qty),costText=lunarInvoiceMoneyText(blended);
  const r=plannerToWholesaleRecord({code:g.code,upc:g.upc,title:g.title,qty:g.qty,rrp:lunarInvoiceMoneyText(g.retail),unit:costText,instore:pParseDate(g.release)});
  r.release=g.release;r.invoiceQty=g.qty;r.invoiceUnitUsd=Number(costText);
  r.invoiceTotalUsd=lunarInvoiceMoneyText(g.total);r.invoiceLines=g.lines;
  r.excludeFromExport=g.total===0n&&/promo|poster|sampler|ashcan/i.test(r.rawTitle);
  return r;
 });
 const invoiceDate=lunarISO((text.match(/Invoice Date:\s*([^\r\n]+)/i)||[])[1]||'');
 return{id,invoiceDate,records,lineCount,splitProductCount:records.filter(r=>r.invoiceLines.length>1).length};
}
$('lunarFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;const st=$('lunarInvoiceMessage');st.textContent='Reading and checking '+f.name+'…';try{
 const text=await f.text(),parsed=lunarInvoiceRows(text,f.name),fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(v=>v.toString(16).padStart(2,'0')).join('');let batches=loadLunarBatches(),existing=batches.find(b=>b.invoiceId===parsed.id);
 if(existing){if(existing.invoiceFingerprint!==fingerprint)throw Error('Invoice '+parsed.id+' was already imported with different contents. Your existing work is retained; review the amendment before changing it.');openSavedLunarBatch(existing.id);st.textContent='Invoice '+parsed.id+' was already imported. Reopened the saved work; quantities were not added again.';showLunarPage('review');return;}
 persistActiveLunarBatch();batches=loadLunarBatches();const reviewed=new Map();for(const b of batches.sort((a,b)=>String(a.updatedAt).localeCompare(String(b.updatedAt))))for(const r of b.records||[])reviewed.set(lunarCodeKey(r),r);for(const r of wholesaleRecords)reviewed.set(lunarCodeKey(r),r);
 const records=parsed.records.map(fresh=>{const old=reviewed.get(lunarCodeKey(fresh));return old?{...fresh,...old,code:fresh.code,qty:fresh.qty,cost:fresh.cost,rrp:fresh.rrp,release:fresh.release,invoiceQty:fresh.invoiceQty,invoiceUnitUsd:fresh.invoiceUnitUsd,invoiceTotalUsd:fresh.invoiceTotalUsd,invoiceLines:fresh.invoiceLines,upc:fresh.upc,excludeFromExport:fresh.excludeFromExport}:fresh;});const now=new Date().toISOString(),weekKey=pDateISO(pMonday(pParseDate(records.map(r=>r.release).sort().pop())));const b={id:'LI-'+parsed.id,weekKey,source:f.name,invoiceDate:parsed.invoiceDate,invoiceId:parsed.id,invoiceFingerprint:fingerprint,status:'invoice_imported',createdAt:now,updatedAt:now,records};batches.push(b);saveLunarBatches(batches);activeLunarBatchId=b.id;wholesaleRecords=structuredClone(records);renderWholesale();persistActiveLunarBatch();st.textContent=`Imported invoice ${parsed.id}: ${records.length} products / ${records.reduce((n,r)=>n+Number(r.qty),0)} units from ${parsed.lineCount} invoice lines. ${parsed.splitProductCount} products have split invoice lines; original quantities and costs retained. ${records.filter(r=>r.excludeFromExport).length} free promotional lines excluded from sale. Prepared titles, prices, descriptions and images retained. Invoice records billing, not physical receipt.`;showLunarPage(records.filter(r=>!r.excludeFromExport).every(r=>r.productDataMatched)?'review':'product');$('lunarStatus').textContent=st.textContent;lunarRefreshGuide();
 }catch(err){st.textContent=err.message;}finally{e.target.value='';}};
$('completeLunarReview').onclick=()=>{try{if(!activeLunarBatchId)throw Error('Choose a planner week or import an invoice first.');for(const r of wholesaleRecords)r.ownerReviewed=true;persistActiveLunarBatch();const all=loadLunarBatches(),b=all.find(x=>x.id===activeLunarBatchId);b.reviewComplete=true;saveLunarBatches(all);showLunarPage('publish');lunarRefreshGuide();}catch(e){alert(e.message);}};
function lunarRefreshGuide(){const b=lunarActive(),paid=wholesaleRecords.filter(r=>!r.excludeFromExport);$('lunarGuide').innerHTML=`<b>${b?.invoiceId?'Invoice '+esc(b.invoiceId):b?'Preparing w/c '+esc(b.weekKey):'Start a Lunar batch'}</b><p>${!b?'Import Order_*.csv in Delivery Planner, then choose a release week and SEND TO WEBSITE PREP. If the invoice has already arrived, use Invoice instead.':b.invoiceId?'Invoice already imported. Keep this batch open; load missing Product Data, review, then check Shopify and export only new products. Do not send the planner week again.':'Load Product Data → review titles, images and prices → check Shopify and export preorders. When the invoice arrives, use Invoice; existing products will be reported rather than recreated.'}</p><span>${paid.length} sale products; ${wholesaleRecords.filter(r=>r.excludeFromExport).length} excluded promotional lines. ${b?.invoiceId?'No need to import this invoice again.':''}</span>`;$('completeLunarReview').textContent='SAVE REVIEW → CHECK SHOPIFY & EXPORT';const badge=$('lunarInvoiceStep').querySelector('.stepBadge');if(b?.invoiceId)badge.textContent='IMPORTED — NO REPEAT NEEDED';lunarRenderExclusions();lunarExportBadge();const waiting=lunarReadState().deferred?.length||0;if(waiting)$('lunarGuide').insertAdjacentHTML('beforeend','<p class=warn>'+waiting+' held products are waiting in Saved Work & History. They have not been deleted or permanently excluded.</p>');if(b?.invoiceId){const split=wholesaleRecords.filter(r=>r.invoiceLines?.length>1);if(split.length)$('lunarGuide').insertAdjacentHTML('beforeend','<details><summary>Split invoice costs — '+split.length+' products</summary>'+split.map(r=>'<p>'+esc(r.code)+' — '+esc(r.rawTitle)+': '+r.invoiceLines.map(x=>esc(x.quantity)+' × $'+esc(x.unitUsd)+' ('+esc(x.discount)+'% discount)').join(' + ')+' = '+esc(r.invoiceQty)+' copies / $'+esc(r.invoiceTotalUsd)+' total. Blended unit cost $'+esc(r.invoiceUnitUsd)+'.</p>').join('')+'</details>');}}
const lunarOriginalUI=updateLunarWorkflowUI;updateLunarWorkflowUI=function(){lunarOriginalUI();lunarRefreshGuide();};
function lunarRenderExclusions(){const box=$('lunarExclusions');box.innerHTML=wholesaleRecords.filter(r=>r.excludeFromExport||Number(r.cost)===0).map(r=>`<label style="display:block"><input type="checkbox" data-lunar-include="${esc(r.code)}" ${r.excludeFromExport?'':'checked'}> Include ${esc(r.cleanTitle)} in sale export (free supplier item; set a selling price and image if included)</label>`).join('');}
function lunarSaveMaster(text,name){const rows=parseCsv(text.replace(/^\uFEFF/,'')),h=rows[0],ix=n=>h.indexOf(n);for(const n of ['Handle','Title','Variant SKU','Variant Inventory Qty'])if(ix(n)<0)throw Error('Choose a fresh full Shopify product export; column missing: '+n);const bySku=new Map(),handles=new Set();let handle='',title='';for(const row of rows.slice(1)){if(row[ix('Handle')])handle=row[ix('Handle')];if(row[ix('Title')])title=row[ix('Title')];if(handle)handles.add(handle);const sku=String(row[ix('Variant SKU')]||'').trim().toUpperCase();if(sku){if(!bySku.has(sku))bySku.set(sku,[]);bySku.get(sku).push({handle,title,qty:row[ix('Variant Inventory Qty')]});}}lunarMaster={bySku,handles,name,at:Date.now()};return bySku.size;}
function lunarExportPlan(){
 if(!$('lunarMasterComplete').checked)throw Error('Confirm that the Shopify export contains all products, not a filtered selection.');
 if(!lunarMaster||Date.now()-lunarMaster.at>30*60*1000)throw Error('Import a fresh full Shopify product export first (checked within the last 30 minutes).');
 const state=lunarReadState(),pending=new Set(state.exports.filter(x=>x.outcome==='pending').flatMap(x=>x.codes)),fresh=[],existing=[],held=[],heldDetails=[];
 const hold=(r,reasons,kind='data')=>{held.push(r.code+': '+reasons.join(', '));heldDetails.push({code:r.code,reasons,kind,record:structuredClone(r)});};
 for(const r of wholesaleRecords){
  if(r.excludeFromExport)continue;
  const sku=('CR-LUNAR-'+r.code).toUpperCase(),matches=lunarMaster.bySku.get(sku)||[];
  if(matches.length>1){hold(r,['duplicate SKU in Shopify'],'identity');continue;}
  if(matches.length){existing.push({r,match:matches[0]});continue;}
  if(pending.has(r.code)){hold(r,['previous CSV is awaiting its import outcome'],'pending');continue;}
  const reasons=[];
  if(!lunarISO(r.release))reasons.push('missing or invalid release date');
  if(!Number.isInteger(Number(r.qty))||Number(r.qty)<=0)reasons.push('quantity must be a positive whole number');
  if(!(Number(r.sellPrice)>0))reasons.push('missing or invalid selling price');
  if(!String(r.imageUrl||'').trim())reasons.push('missing image URL');
  else if(!/^https:\/\//i.test(r.imageUrl))reasons.push('image URL must start with https://');
  else if(lunarFailedImages.has(r.imageUrl))reasons.push('image could not be loaded; check or replace its URL');
  if(!String(r.cleanTitle||r.rawTitle||'').trim())reasons.push('missing title');
  else if(lunarBaseTitle(r.cleanTitle||r.rawTitle,r).length>80)reasons.push('base title exceeds 80 characters');
  if(reasons.length){hold(r,reasons);continue;}
  const handle=r.shopifyHandle||slug('comicrox-lunar-'+r.code);
  if(lunarMaster.handles.has(handle)){hold(r,['handle already exists with a different SKU'],'identity');continue;}
  fresh.push({...r,shopifyHandle:handle});
 }
 if(new Set(wholesaleRecords.filter(r=>!r.excludeFromExport).map(r=>lunarCodeKey(r))).size!==wholesaleRecords.filter(r=>!r.excludeFromExport).length)throw Error('Repeated product codes in the working batch.');
 return{fresh,existing,held,heldDetails};
}
async function lunarDownloadExport(readyOnly=false){if(lunarExportBusy)return;lunarExportBusy=true;$('exportWholesale').disabled=true;$('lunarReadyOnly').disabled=true;try{if(!lunarActive())throw Error('Open your saved batch first.');persistActiveLunarBatch();lunarExportPlan();await lunarCheckImages();const plan=lunarExportPlan();$('wholesaleExportStatus').textContent=`${plan.fresh.length} new products; ${plan.existing.length} already in Shopify; ${plan.held.length} held. Existing listings are excluded, with no automatic inventory changes. ${plan.held.join('; ')}`;lunarShowExisting(plan.existing);lunarShowPlan(plan);if(plan.held.length&&!readyOnly)throw Error('No file created. '+plan.held.join('; ')+'. Use DOWNLOAD READY ONLY to keep these saved for later.');if(!plan.fresh.length){if(readyOnly){const waiting=lunarReadState();lunarUpdateDeferred(waiting,plan,true);lunarWriteState(waiting);lunarRenderDeferred();}throw Error('No file created: no new products are ready. Held products remain saved; existing listings and pending exports are protected.');}if(readyOnly&&plan.held.length&&!confirm('Download '+plan.fresh.length+' ready products and keep '+plan.held.length+' held products saved for later? Your edited titles, prices and descriptions will be retained.'))return;
 const h=['Handle','Title','Body (HTML)','Vendor','Product Category','Type','Tags','Published','Option1 Name','Option1 Value','Variant SKU','Variant Grams','Variant Inventory Tracker','Variant Inventory Qty','Variant Inventory Policy','Variant Fulfillment Service','Variant Price','Variant Requires Shipping','Variant Taxable','Image Src','Image Position','Image Alt Text','Gift Card','Status','Publisher (product.metafields.custom.publisher)','Release Date (product.metafields.custom.release_date)'];const rows=plan.fresh.map(r=>{const title=storefrontTitle(r);return[r.shopifyHandle,title,bodyHtml(storefrontDescription(r)),'ComicRox',CATEGORY,'Comic Books',storefrontTags(r),'True','Title','Default Title','CR-LUNAR-'+r.code,120,'shopify',Number(r.qty),'deny','manual',r.sellPrice,'True','True',r.imageUrl,1,title,'False','active',r.publisher,lunarISO(r.release)];});const csv='\ufeff'+[h,...rows].map(r=>r.map(q).join(',')).join('\r\n'),now=new Date().toISOString(),run={id:'LX-'+Date.now(),batchId:activeLunarBatchId,at:now,codes:plan.fresh.map(r=>r.code),outcome:'pending',csv,fileName:'ComicRox_Lunar_'+(lunarActive()?.invoiceId||lunarActive()?.weekKey||'Batch')+'_NEW_PRODUCTS.csv'};const state=lunarReadState();lunarUpdateDeferred(state,plan,readyOnly);state.exports.push(run);lunarWriteState(state);dl(new Blob([csv],{type:'text/csv'}),run.fileName);lunarMaster=null;$('wholesaleExportStatus').textContent=`Downloaded ${rows.length} NEW products as ${run.fileName}. Find it in browser Downloads (Ctrl+J). Import once in Shopify. Refresh the Shopify export afterwards; existing items will not be recreated. Record the outcome above.${plan.held.length?' '+plan.held.length+' held products remain saved for retry.':''}`;lunarRenderHistory();lunarRenderDeferred();lunarExportBadge();
 }catch(e){$('wholesaleExportStatus').textContent=e.message;}finally{lunarExportBusy=false;$('exportWholesale').disabled=!wholesaleRecords.length;$('lunarReadyOnly').disabled=!wholesaleRecords.length;}}
$('exportWholesale').onclick=()=>lunarDownloadExport(false);
function lunarShowExisting(items){$('lunarExisting').innerHTML=items.length?'<h3>Already in Shopify — excluded from new-product CSV</h3><p>Invoice quantities are billed quantities, not proof that stock should be added. Check existing stock separately; this tool has made no changes.</p>'+items.map(({r,match})=>`<p>${esc(r.code)} — ${esc(match.title)} · Shopify stock ${esc(match.qty)} · ${lunarActive()?.invoiceId?'invoice':'planned'} quantity ${esc(r.qty)}</p>`).join(''):'';}
function lunarRenderHistory(){const all=loadLunarBatches(),current=pMonday(new Date()),cutoff=new Date(current.getFullYear(),current.getMonth(),current.getDate()-28);const currentWeek=pDateISO(current),firstWeek=pDateISO(cutoff);$('lunarCostHistory').innerHTML='<h3>Previous four weeks — saved cost history</h3>'+all.filter(b=>{const date=b.invoiceDate||b.weekKey;return date>=firstWeek&&date<currentWeek;}).map(b=>`<details><summary>${esc(b.invoiceId?'Invoice '+b.invoiceId:'w/c '+b.weekKey)} — ${esc(b.updatedAt||b.createdAt)}</summary><p>${b.costSettings?'Saved USD→GBP '+b.costSettings.fx+', inbound freight $'+b.costSettings.freightUsd+'/item, mailer £'+b.costSettings.mailerGbp+'/item.':'Historic cost settings were not recorded; unavailable.'}</p>${(b.costSnapshot||[]).map(r=>`<p>${esc(r.code)} · ${r.qty} units · purchase $${r.unitUsd} each · prepared £${Number(r.preparedUnitGbp).toFixed(2)} each / £${(Number(r.preparedUnitGbp)*r.qty).toFixed(2)} total · selling £${esc(r.sellPrice)}</p>`).join('')}<p>${b.invoiceId?'Invoiced; physical receipt not recorded.':'Order estimate; not an invoice.'}</p></details>`).join('');$('lunarExportHistory').innerHTML=lunarReadState().exports.slice().reverse().map(x=>`<div><b>${esc(x.fileName)}</b> · ${esc(x.outcome)} <button class="btn secondary" data-lunar-redownload="${esc(x.id)}">Download same file</button>${x.outcome==='pending'?` <button class="btn secondary" data-lunar-outcome="${esc(x.id)}" data-outcome="imported">All rows imported</button> <button class="btn secondary" data-lunar-outcome="${esc(x.id)}" data-outcome="not_imported">Not imported / cancelled</button>`:''}<p>For partial success, keep this pending and load a fresh Shopify export. Only cancel after confirming none of its remaining products were imported.</p></div>`).join('');}
// Add guidance to existing pages without replacing photo, pricing, AI or planner controls.
const nav=document.querySelector('.lunarNavBtn').parentElement;nav.insertAdjacentHTML('afterend','<section id="lunarGuide" class="panel"></section>');
$('lunarInvoiceStep').insertAdjacentHTML('beforeend','<div id="lunarInvoiceMessage" role="status" class="status"></div><p>Required file: original Invoice_*.csv. Import once; reimporting identical contents reopens the same saved invoice. Prepared records remain saved separately.</p>');
$('lunarReviewStep').insertAdjacentHTML('beforeend','<section id="lunarExclusions"></section>');
$('lunarPublishStep').insertAdjacentHTML('beforeend','<p>Required file: Shopify → Products → Export → All products. Existing SKUs are excluded; no listings or inventory are changed automatically.</p><label class="btn filebtn">CHECK CURRENT SHOPIFY PRODUCTS<input id="lunarShopifyMaster" type="file" accept=".csv" hidden></label><label style="display:flex;align-items:center;gap:8px"><input id="lunarMasterComplete" type="checkbox" style="width:auto;margin:0"> This Shopify export contains ALL products, including draft and archived products.</label><div id="lunarMasterStatus" role="status"></div><div id="lunarExisting"></div><div id="lunarExportHistory"></div>');
$('savedBatchList').insertAdjacentHTML('afterend','<button class="btn secondary" id="lunarBackup">DOWNLOAD LUNAR BACKUP</button><label class="btn filebtn">RESTORE LUNAR BACKUP<input id="lunarRestore" type="file" accept=".json" hidden></label><section id="lunarCostHistory"></section>');
$('lunarShopifyMaster').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;lunarMaster=null;$('lunarMasterStatus').textContent='Reading '+f.name+'…';lunarSaveMaster(await f.text(),f.name);lunarMasterFeedback();}catch(err){lunarMaster=null;$('lunarMasterStatus').textContent=err.message;}finally{e.target.value='';lunarExportBadge();}};
$('lunarBackup').onclick=()=>{persistActiveLunarBatch();const keys=[LUNAR_BATCH_STORE_KEY,lunarWorkflowKey,PLANNER_ORDERS_KEY,PLANNER_DATES_KEY,PLANNER_PENDING_KEY,PLANNER_STORE_KEY];const values={};for(const k of keys){const v=localStorage.getItem(k);if(v!==null)values[k]=v;}dl(new Blob([JSON.stringify({schema:1,at:new Date().toISOString(),values},null,2)],{type:'application/json'}),'ComicRox-Lunar-Backup.json');};
$('lunarRestore').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const v=JSON.parse(await f.text()),allowed=new Set([LUNAR_BATCH_STORE_KEY,lunarWorkflowKey,PLANNER_ORDERS_KEY,PLANNER_DATES_KEY,PLANNER_PENDING_KEY,PLANNER_STORE_KEY]);if(v.schema!==1||!v.values||typeof v.values!=='object'||Array.isArray(v.values))throw Error('Invalid backup.');for(const[k,t]of Object.entries(v.values)){if(!allowed.has(k)||typeof t!=='string')throw Error('Unexpected backup key.');const data=JSON.parse(t);if(k===LUNAR_BATCH_STORE_KEY&&(!Array.isArray(data)||data.some(b=>!b.id||!Array.isArray(b.records))))throw Error('Invalid saved batch data.');if(k===lunarWorkflowKey&&(data.schema!==2||!Array.isArray(data.exports)||data.exports.some(x=>!x.id||!Array.isArray(x.codes)||typeof x.csv!=='string')))throw Error('Invalid export history.');if(k===lunarWorkflowKey&&data.deferred!==undefined&&(!Array.isArray(data.deferred)||data.deferred.some(x=>!x.batchId||!x.code||!Array.isArray(x.reasons))))throw Error('Invalid held-product history.');if(k===PLANNER_ORDERS_KEY&&(!data||typeof data!=='object'))throw Error('Invalid order ledger.');}if(!confirm('Restore this Lunar backup? Download a backup of current work first. This replaces Lunar data only.'))return;const original={};for(const k of Object.keys(v.values))original[k]=localStorage.getItem(k);try{for(const[k,t]of Object.entries(v.values))localStorage.setItem(k,t);}catch(err){for(const[k,t]of Object.entries(original))t===null?localStorage.removeItem(k):localStorage.setItem(k,t);throw err;}location.reload();}catch(err){alert(err.message);}finally{e.target.value='';}};
document.addEventListener('change',e=>{const code=e.target.dataset?.lunarInclude;if(code){wholesaleRecords.find(r=>r.code===code).excludeFromExport=!e.target.checked;persistActiveLunarBatch();lunarRefreshGuide();}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.lunarRedownload||b.dataset.lunarOutcome;if(!id)return;try{const state=lunarReadState(),run=state.exports.find(x=>x.id===id);if(!run)return;if(b.dataset.lunarRedownload){dl(new Blob([run.csv],{type:'text/csv'}),run.fileName);return;}if(!confirm(b.dataset.outcome==='imported'?'Confirm every row was successfully imported into Shopify?':'Confirm this CSV was not imported, or cancelled? For partial success first check a fresh Shopify export.'))return;run.outcome=b.dataset.outcome;lunarWriteState(state);lunarMaster=null;lunarRenderHistory();}catch(err){alert(err.message);}});
['usdGbpRate','inboundFreightUsd','mailerGbp'].forEach(id=>$(id).addEventListener('change',()=>persistActiveLunarBatch()));
lunarRefreshGuide();lunarRenderHistory();

const lunarStandardExport=$('export').onclick;
$('export').onclick=()=>{for(const r of records)r.title=String(r.title||'').replace(/[()\[\]{}]/g,' ').replace(/\s+/g,' ').trim();const long=records.filter(r=>r.title.length>80);if(long.length){alert('Review '+long.length+' title(s) over 80 characters. Issue, year and variant have been preserved; shorten lower-priority wording before exporting.');return;}lunarStandardExport();};

$('lunarProductStep').insertAdjacentHTML('beforeend','<button class="btn" id="lunarContinueReview">CONTINUE TO REVIEW &amp; PRICE</button><p>Required data: Lunar Format Product Data CSV (Code/ImageUrl columns). START / RETRY retrieves it automatically where possible. The manual fallback must contain product details, not just order dates.</p>');
$('lunarContinueReview').onclick=()=>{if(!wholesaleRecords.length){alert('Choose a planner week or import an invoice first.');return;}showLunarPage('review');};
$('lunarInvoiceStep').insertAdjacentHTML('beforeend','<button class="btn secondary" id="lunarContinueInvoice">CONTINUE WITH LOADED BATCH</button>');
$('lunarContinueInvoice').onclick=()=>{if(!wholesaleRecords.length)return;showLunarPage(wholesaleRecords.filter(r=>!r.excludeFromExport).every(r=>r.productDataMatched)?'review':'product');};

$('lunarBackup').insertAdjacentHTML('afterend','<button class="btn secondary" id="lunarBeforeDownload">DOWNLOAD PRE-UPGRADE LUNAR SNAPSHOT</button>');
$('lunarBeforeDownload').onclick=()=>dl(new Blob([lunarBeforeBackup],{type:'application/json'}),'ComicRox-Lunar-Before-2.6.0.json');

// Holds are retained under the existing workflow backup key, never by deleting records.
function lunarUpdateDeferred(state,plan,readyOnly){
 const rows=state.deferred||[],exported=new Set(plan.fresh.map(r=>r.code)),existing=new Set(plan.existing.map(x=>x.r.code));
 state.deferred=rows.filter(x=>!existing.has(x.code)&&!(x.batchId===activeLunarBatchId&&exported.has(x.code)));
 if(!readyOnly)return;
 const now=new Date().toISOString();
 for(const item of plan.heldDetails){if(item.kind==='pending')continue;const old=state.deferred.find(x=>x.batchId===activeLunarBatchId&&x.code===item.code);const row={batchId:activeLunarBatchId,weekKey:lunarActive()?.weekKey||'',code:item.code,reasons:item.reasons,record:item.record,queuedAt:old?.queuedAt||now,lastCheckedAt:now};state.deferred=state.deferred.filter(x=>!(x.batchId===row.batchId&&x.code===row.code));state.deferred.push(row);}
}
function lunarShowPlan(plan){const box=$('lunarPlan');if(!box)return;box.innerHTML='<p><b>'+plan.fresh.length+' ready to export · '+plan.existing.length+' already in Shopify · '+plan.held.length+' held</b></p>'+plan.heldDetails.map(x=>'<p class="warn">'+esc(x.code)+' — '+esc(x.reasons.join('; '))+'</p>').join('');}
function lunarMasterFeedback(){
 if(!lunarMaster)return;
 const prefix='Loaded '+lunarMaster.name+' — '+lunarMaster.bySku.size+' SKUs. ';
 if(!$('lunarMasterComplete').checked){$('lunarMasterStatus').textContent=prefix+'Tick the ALL products confirmation to finish checking; you do not need to choose the file again.';return;}
 const plan=lunarExportPlan();$('lunarMasterStatus').textContent='Checked '+lunarMaster.bySku.size+' SKUs from '+lunarMaster.name+'. '+(!wholesaleRecords.length?'Next: open your prepared batch in Saved Work & History.':'Next: use a download button below.');lunarShowExisting(plan.existing);lunarShowPlan(plan);
}
function lunarExportBadge(){const badge=$('lunarPublishStep')?.querySelector('.stepBadge');if(!badge)return;const checked=lunarMaster&&Date.now()-lunarMaster.at<=30*60*1000&&$('lunarMasterComplete')?.checked;badge.textContent=!wholesaleRecords.length?'OPEN SAVED BATCH':checked?'SHOPIFY CHECKED':'LOAD SHOPIFY EXPORT';badge.className='stepBadge '+(checked?'complete':'active');}
function lunarRenderDeferred(){const box=$('lunarDeferred');if(!box)return;const rows=lunarReadState().deferred||[];const groups=new Map();for(const row of rows){if(!groups.has(row.batchId))groups.set(row.batchId,[]);groups.get(row.batchId).push(row);}box.innerHTML='<h3>Held for later — '+rows.length+' products</h3>'+(rows.length?'<p>Your reviewed titles, prices and descriptions are retained. Reopen and retry product data when images become available. Ready records are automatically included again on the next checked export.</p>'+[...groups].map(([id,items])=>'<div><b>Batch '+esc(items[0].weekKey||id)+'</b>'+items.map(x=>'<p>'+esc(x.code)+' — '+esc(x.record?.cleanTitle||'')+' · '+esc(x.reasons.join('; '))+'</p>').join('')+'<button class="btn secondary" data-lunar-held-retry="'+esc(id)+'">OPEN & RETRY HELD PRODUCTS</button></div>').join(''):'<p>No products currently waiting for retry.</p>');}
$('exportWholesale').insertAdjacentHTML('beforebegin','<div id="lunarPlan" role="status"></div>');
$('exportWholesale').insertAdjacentHTML('afterend',' <button class="btn secondary" id="lunarReadyOnly">DOWNLOAD READY ONLY — KEEP HELD FOR LATER</button>');
$('lunarReadyOnly').onclick=()=>lunarDownloadExport(true);
$('savedBatchList').insertAdjacentHTML('beforebegin','<section id="lunarDeferred"></section>');
$('lunarMasterComplete').addEventListener('change',()=>{try{lunarMasterFeedback();lunarExportBadge();}catch(e){$('lunarMasterStatus').textContent=e.message;}});
document.addEventListener('click',e=>{const id=e.target.closest('[data-lunar-held-retry]')?.dataset.lunarHeldRetry;if(!id)return;try{const source=loadLunarBatches().find(b=>b.id===id);if(!source){alert('The original saved batch is no longer present. Restore your Lunar backup before retrying; the held snapshots have been retained.');return;}openSavedLunarBatch(id);showLunarPage('product');$('lunarStatus').textContent='Reopened saved batch with reviewed prices/descriptions intact. Retrying official product data; a fresh Shopify check will exclude products already imported.';$('processLunar').click();}catch(e){alert(e.message);}});
const lunarHeldOriginalHistory=lunarRenderHistory;
lunarRenderHistory=function(){lunarHeldOriginalHistory();lunarRenderDeferred();};
lunarRenderDeferred();lunarExportBadge();

async function lunarCheckImages(){
 const urls=[...new Set(wholesaleRecords.filter(r=>!r.excludeFromExport).map(r=>r.imageUrl).filter(u=>/^https:\/\//i.test(u||'')))];let index=0,done=0;
 const one=url=>new Promise(resolve=>{const im=new Image();let timer;const finish=ok=>{clearTimeout(timer);im.onload=null;im.onerror=null;ok?lunarFailedImages.delete(url):lunarFailedImages.add(url);done++;$('wholesaleExportStatus').textContent='Checking image links '+done+' / '+urls.length+'…';resolve();};im.onload=()=>finish(im.naturalWidth>0);im.onerror=()=>finish(false);timer=setTimeout(()=>finish(false),10000);im.src=url;});
 $('wholesaleExportStatus').textContent='Checking image links before export…';
 await Promise.all(Array.from({length:Math.min(6,urls.length)},async()=>{while(index<urls.length)await one(urls[index++]);}));
}

// Refresh a prepared forecast from the current order ledger without resaving stale active rows.
const lunarOriginalSendPrep=sendPlannerWeekToPrep;
sendPlannerWeekToPrep=function(key){
 try{
  persistActiveLunarBatch();
  const group=pForecastGroups().find(x=>pDateISO(x.date)===key);
  if(!group)throw Error('No upcoming forecast exists for this week. Saved work remains unchanged.');
  const saved=savedBatchForWeek(key);
  if(!saved){const original=pGroups;pGroups=()=>{pGroups=original;return [group];};try{return lunarOriginalSendPrep(key);}finally{pGroups=original;}}
  const batches=loadLunarBatches(),index=batches.findIndex(b=>b.id===saved.id);
  if(index<0)throw Error('Saved batch could not be found. No new preparation was created.');
  const merged=mergePlannerWeekIntoSavedBatch(batches[index],group);
  if(merged.added||merged.updated)batches[index].reviewComplete=false;
  saveLunarBatches(batches);
  // openSavedLunarBatch first persists the currently active rows. Detach only after
  // saving the merge, or those pre-merge rows would overwrite the refreshed batch.
  activeLunarBatchId=null;
  openSavedLunarBatch(saved.id);
  showLunarPage(wholesaleRecords.some(r=>!r.productDataMatched&&!r.excludeFromExport)?'product':'review');
  const message='Updated saved preparation for w/c '+key+': '+merged.added+' new products added, '+merged.updated+' supplier changes refreshed, '+merged.total+' products retained. Your reviewed titles, prices, descriptions and images are preserved. Load product data for new books, then check a fresh Shopify export to download only new listings. Stock in Shopify has not been changed.';
  $('savedBatchStatus').textContent=message;$('lunarStatus').textContent=message;$('plannerStatus').textContent=message;
  lunarRefreshGuide();renderPlanner();
 }catch(e){$('plannerStatus').textContent='Preparation not updated: '+e.message;}
};
pSendForecastWeek=function(key){sendPlannerWeekToPrep(key);};
const lunarOriginalRenderPrepPlanner=renderPlanner;
renderPlanner=function(){lunarOriginalRenderPrepPlanner();for(const button of document.querySelectorAll('.plannerWeekPrep'))if(savedBatchForWeek(button.dataset.week))button.textContent='UPDATE SAVED PREP — ADD NEW ITEMS';};
renderPlanner();
// A planner refresh can switch the working records while automatic pricing is
// awaiting eBay. Stop the old loop cleanly rather than indexing the new batch.
checkAllEbay=async function(auto=false){
 if(ebayBatchRunning||!wholesaleRecords.length)return;
 ebayBatchRunning=true;
 const expected=wholesaleRecords,batchId=activeLunarBatchId,total=expected.length,button=$('checkAllEbay'),status=$('ebayBatchStatus');let ok=0,changed=false;
 if(button){button.disabled=true;button.textContent='CHECKING EBAY…';}
 try{for(let i=0;i<total;i++){
  if(wholesaleRecords!==expected||activeLunarBatchId!==batchId){changed=true;break;}
  if(status)status.textContent='eBay pricing: checking '+(i+1)+' / '+total+'…';
  await checkEbayActive(i,{batch:true});
  if(wholesaleRecords!==expected||activeLunarBatchId!==batchId){changed=true;break;}
  if(expected[i]?.ebayActive?.ok)ok++;
  await new Promise(resolve=>setTimeout(resolve,120));
 }}finally{
  ebayBatchRunning=false;
  if(button){button.disabled=!wholesaleRecords.length;button.textContent='RECHECK ALL MARKET PRICES';}
  if(status)status.textContent=changed?'Pricing stopped because the working batch changed. Recheck prices for the batch now open.':'eBay pricing complete: '+total+' checked · '+ok+' with usable market data'+(auto?' · automatic':'')+'.';
 }
};
