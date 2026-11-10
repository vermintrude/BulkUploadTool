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
 const records=parsed.records.map(fresh=>{const old=reviewed.get(lunarCodeKey(fresh));return old?{...fresh,...old,code:fresh.code,qty:fresh.qty,cost:fresh.cost,rrp:fresh.rrp,release:fresh.release,invoiceQty:fresh.invoiceQty,invoiceUnitUsd:fresh.invoiceUnitUsd,invoiceTotalUsd:fresh.invoiceTotalUsd,invoiceLines:fresh.invoiceLines,upc:fresh.upc,excludeFromExport:fresh.excludeFromExport,...lunarInvoiceReleaseFields(fresh,old,parsed.invoiceDate)}:{...fresh,...lunarInvoiceReleaseFields(fresh,null,parsed.invoiceDate)};});const now=new Date().toISOString(),weekKey=pDateISO(pMonday(pParseDate(records.map(r=>r.release).sort().pop())));const b={id:'LI-'+parsed.id,weekKey,source:f.name,invoiceDate:parsed.invoiceDate,invoiceId:parsed.id,invoiceFingerprint:fingerprint,status:'invoice_imported',createdAt:now,updatedAt:now,records};batches.push(b);saveLunarBatches(batches);activeLunarBatchId=b.id;wholesaleRecords=structuredClone(records);renderWholesale();persistActiveLunarBatch();st.textContent=`Imported invoice ${parsed.id}: ${records.length} products / ${records.reduce((n,r)=>n+Number(r.qty),0)} units from ${parsed.lineCount} invoice lines. ${parsed.splitProductCount} products have split invoice lines; original quantities and costs retained. ${records.filter(r=>r.excludeFromExport).length} free promotional lines excluded from sale. Prepared titles, prices, descriptions and images retained. Invoice records billing, not physical receipt.`;showLunarPage(records.filter(r=>!r.excludeFromExport).every(r=>r.productDataMatched)?'review':'product');$('lunarStatus').textContent=st.textContent;lunarRefreshGuide();
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
$('lunarRestore').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const v=JSON.parse(await f.text()),allowed=new Set([LUNAR_BATCH_STORE_KEY,lunarWorkflowKey,PLANNER_ORDERS_KEY,PLANNER_DATES_KEY,PLANNER_PENDING_KEY,PLANNER_STORE_KEY]);if(v.schema!==1||!v.values||typeof v.values!=='object'||Array.isArray(v.values))throw Error('Invalid backup.');for(const[k,t]of Object.entries(v.values)){if(!allowed.has(k)||typeof t!=='string')throw Error('Unexpected backup key.');const data=JSON.parse(t);if(k===LUNAR_BATCH_STORE_KEY&&(!Array.isArray(data)||data.some(b=>!b.id||!Array.isArray(b.records))))throw Error('Invalid saved batch data.');if(k===lunarWorkflowKey&&(data.schema!==2||!Array.isArray(data.exports)||data.exports.some(x=>!x.id||!Array.isArray(x.codes)||typeof x.csv!=='string')))throw Error('Invalid export history.');if(k===lunarWorkflowKey)lunarValidateDeliveries(data);if(k===lunarWorkflowKey&&data.deferred!==undefined&&(!Array.isArray(data.deferred)||data.deferred.some(x=>!x.batchId||!x.code||!Array.isArray(x.reasons))))throw Error('Invalid held-product history.');if(k===PLANNER_ORDERS_KEY&&(!data||typeof data!=='object'))throw Error('Invalid order ledger.');}if(!confirm('Restore this Lunar backup? Download a backup of current work first. This replaces Lunar data only.'))return;const original={};for(const k of Object.keys(v.values))original[k]=localStorage.getItem(k);try{for(const[k,t]of Object.entries(v.values))localStorage.setItem(k,t);}catch(err){for(const[k,t]of Object.entries(original))t===null?localStorage.removeItem(k):localStorage.setItem(k,t);throw err;}location.reload();}catch(err){alert(err.message);}finally{e.target.value='';}};
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

// Background price/product-data responses must not rebuild controls under the
// user's cursor. Keep the editor node (including selection/IME) until focus
// leaves the table; update only the non-editable market cells in the meantime.
const lunarOriginalRenderWholesale=renderWholesale;
let lunarRenderedRecords=wholesaleRecords,lunarRenderedBatchId=activeLunarBatchId;
let lunarRenderPending=false;
function lunarWholesaleEditor(){
 const el=document.activeElement;
 return el?.matches('#wholesaleRows input[data-wi], #wholesaleRows textarea[data-wi]')?el:null;
}
function lunarRefreshMarketCells(){
 const rows=$('wholesaleRows')?.querySelectorAll(':scope > tr:not(.wdescrow)')||[];
 rows.forEach((row,i)=>{
  const record=wholesaleRecords[i];if(!record)return;
  const cells=[...row.querySelectorAll(':scope > .ebayCell')];
  if(cells.length!==3)return;
  const holder=document.createElement('tr');holder.innerHTML=ebayCellsHtml(record,i);
  const next=[...holder.children];
  cells.forEach((cell,j)=>cell.replaceWith(next[j]));
 });
 renderWholesalePriceModeOnly();
}
renderWholesale=function(){
 const sameBatch=lunarRenderedRecords===wholesaleRecords&&lunarRenderedBatchId===activeLunarBatchId;
 if(sameBatch&&lunarWholesaleEditor()){
  lunarRenderPending=true;lunarRefreshMarketCells();wholesaleSummary();return;
 }
 lunarRenderPending=false;
 lunarOriginalRenderWholesale();
 lunarRenderedRecords=wholesaleRecords;lunarRenderedBatchId=activeLunarBatchId;
};
$('wholesaleRows').addEventListener('focusout',()=>{
 // Wait until the next control has focus; moving between fields must not redraw.
 setTimeout(()=>{if(lunarRenderPending&&!lunarWholesaleEditor())renderWholesale();},0);
});

// Returning to this window used to reapply the same Downloads CSV and restart
// pricing each time. Remember the last applied content per batch in memory.
const lunarAppliedProductFiles=new Map();
const lunarOriginalPreparedProductData=applyLunarProductDataText;
applyLunarProductDataText=function(text,name){
 const result=lunarOriginalPreparedProductData(text,name);
 lunarAppliedProductFiles.set(activeLunarBatchId||wholesaleRecords,text);
 return result;
};
let lunarDownloadCheckBusy=false;
checkLatestDownloadedLunarData=async function(manual=false){
 if(!wholesaleRecords.length||lunarDownloadCheckBusy)return false;
 const expected=wholesaleRecords,batchId=activeLunarBatchId,key=batchId||expected;
 lunarDownloadCheckBusy=true;
 try{
  if(manual)$('reviewProductDataStatus').textContent='Checking your Downloads folder for the latest Lunar Product Data CSV…';
  const response=await fetch('/api/lunar-latest-product-data?since='+encodeURIComponent(lunarAutoStarted||0));
  const data=await response.json();
  if(wholesaleRecords!==expected||activeLunarBatchId!==batchId)return false;
  if(data.ok&&data.found&&data.text){
   if(!manual&&lunarAppliedProductFiles.get(key)===data.text)return false;
   const result=applyLunarProductDataText(data.text,data.name||'Lunar Product Data CSV');
   $('autoLunarState').textContent='✓ Review populated';
   $('reviewProductDataStatus').textContent+=' Auto-detected from Downloads ('+result.matched+'/'+wholesaleRecords.length+' matched).';
   return true;
  }
  if(manual)$('reviewProductDataStatus').textContent='No new Lunar Product Data CSV was found in Downloads. Use IMPORT PRODUCT DATA CSV to select it manually.';
 }catch(error){if(manual&&wholesaleRecords===expected)$('reviewProductDataStatus').textContent='Could not check Downloads: '+error.message;}
 finally{lunarDownloadCheckBusy=false;}
 return false;
};


// Revised release dates are a separate, reviewed update to existing Shopify products.
// Never include inventory, prices, status, variants or publication fields in this CSV.
let lunarDateShopifySnapshot=null;
const lunarDateMasterOriginal=lunarSaveMaster;
lunarSaveMaster=function(text,name){
 lunarDateShopifySnapshot=null;
 const result=lunarDateMasterOriginal(text,name);
 lunarDateShopifySnapshot={text,name,at:Date.now()};
 return result;
};
function lunarDateToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function lunarDateSources(){
 const sources=new Map(),add=(code,date,source,observedAt='')=>{
  code=String(code||'').trim().toUpperCase();date=lunarISO(date);
  if(!/^\d{4}[A-Z]{2}\d+$/.test(code)||!date)return;
  if(!sources.has(code))sources.set(code,[]);
  sources.get(code).push({date,source,observedAt});
 };
 for(const b of loadLunarBatches())for(const r of b.records||[])add(r.code,r.release,b.invoiceId?'Invoice '+b.invoiceId:'Saved batch '+b.weekKey,r.releaseDateObservedAt);
 for(const r of wholesaleRecords)add(r.code,r.release,'Open batch',r.releaseDateObservedAt);
 for(const [code,d]of Object.entries(pReadDateCache()))add(code,d.iso,d.source||'Imported Lunar dates',d.importedAt);
 // Legacy order records are a fallback only; refreshed prep dates take precedence.
 for(const [id,order]of Object.entries(pReadOrders().orders))for(const r of order.items||[])if(!sources.has(String(r.code).toUpperCase()))add(r.code,r.instore,'Order '+id);
 return sources;
}
function lunarResolveReleaseDates(sources){
 const resolved=new Map(),conflicts=[];
 for(const [code,items]of sources){
  const observed=items.filter(x=>Number.isFinite(Date.parse(x.observedAt)));
  const newest=observed.length?Math.max(...observed.map(x=>Date.parse(x.observedAt))):null;
  const candidates=newest===null?items:observed.filter(x=>Date.parse(x.observedAt)===newest);
  const dates=[...new Set(candidates.map(x=>x.date))];
  if(observed.length&&items.some(x=>!Number.isFinite(Date.parse(x.observedAt))&&x.date!==dates[0])){conflicts.push({code,reason:'Saved dates disagree with imported dates. Refresh Lunar dates or Product Data to resolve.'});continue;}
  // Without dated source evidence, conflicting legacy snapshots need a fresh lookup.
  if(dates.length!==1){conflicts.push({code,reason:'Conflicting saved dates: '+dates.join(', ')+'. Import fresh Lunar dates or Product Data.'});continue;}
  resolved.set(code,{date:dates[0],source:candidates.filter(x=>x.date===dates[0]).map(x=>x.source).join('; ')});
 }
 return {resolved,conflicts};
}
function lunarBuildDateUpdates(text,sources,today=lunarDateToday()){
 const rows=parseCsv(text.replace(/^\uFEFF/,'')),h=rows[0]||[],ix=n=>h.indexOf(n);
 const dateHeader=h.find(n=>/\(product\.metafields\.custom\.release_date\)$/.test(n));
 for(const n of ['Handle','Title','Body (HTML)','Tags','Variant SKU'])if(ix(n)<0)throw Error('Shopify export is missing '+n+'. Export ALL products again.');
 if(!dateHeader)throw Error('Shopify export is missing the custom.release_date metafield. Include it in a fresh product export.');
 const products=new Map(),bySku=new Map();let current=null;
 for(const row of rows.slice(1)){
  const handle=String(row[ix('Handle')]||'').trim();if(!handle)continue;
  if(!products.has(handle))products.set(handle,{handle,skus:new Set(),definitions:[]});
  current=products.get(handle);
  if(row[ix('Title')])current.definitions.push({title:row[ix('Title')],body:row[ix('Body (HTML)')]||'',tags:row[ix('Tags')]||'',release:row[ix(dateHeader)]||''});
  const sku=String(row[ix('Variant SKU')]||'').trim().toUpperCase();
  if(sku){current.skus.add(sku);if(!bySku.has(sku))bySku.set(sku,[]);bySku.get(sku).push(current);}
 }
 const {resolved,conflicts}=lunarResolveReleaseDates(sources),held=[...conflicts],updates=[];
 for(const [code,target]of resolved){
  const sku='CR-LUNAR-'+code,matches=bySku.get(sku)||[];if(!matches.length)continue;
  const p=matches[0];
  if(matches.length!==1||p.skus.size!==1||p.definitions.length!==1){held.push({code,reason:'Ambiguous Shopify SKU/product. Review manually.'});continue;}
  const old=p.definitions[0],oldDate=lunarISO(String(old.release).replace(/^'/,''));
  if(!oldDate){held.push({code,reason:'Shopify release date is missing or invalid. Review manually.'});continue;}
  let title=old.title,body=old.body,tags=old.tags;const future=target.date>today;
  if(future){
   title=title.replace(/\s*[—–-]\s*PRE[- ]?ORDER\s*$/i,'').trim()+' — PRE-ORDER';
   const tagList=tags.split(',').map(x=>x.trim()).filter(Boolean).filter(x=>!/^New Release$/i.test(x));
   if(!tagList.some(x=>/^Pre-Order$/i.test(x)))tagList.push('Pre-Order');tags=tagList.join(', ');
   // Only replace the generated leading notice, preserving the owner's remaining HTML.
   body=body.replace(/^\s*<p(?:\s[^>]*)?>\s*PRE-ORDER\s*[—–-]\s*OFFICIAL RELEASE DATE:[\s\S]*?<\/p>\s*/i,'');
   if(/PRE-ORDER\s*[—–-]\s*OFFICIAL RELEASE DATE:/i.test(body)){held.push({code,reason:'Preorder notice has a custom format. Review description manually.'});continue;}
   body='<p>PRE-ORDER — OFFICIAL RELEASE DATE: '+prettyRelease(target.date)+'. This item will not be dispatched before its official release date.</p>'+body;
  }
  if(oldDate===target.date&&title===old.title&&body===old.body&&tags===old.tags)continue;
  // Keep the generated detail date consistent with the metafield, without rebuilding copy.
  body=body.replace(/((?:<br\s*\/?>|<p>)Release Date:\s*)[^<\r\n]+(?=<|$)/gi,(_,prefix)=>prefix+prettyRelease(target.date));
  updates.push({code,handle:p.handle,title,body,tags,oldDate,date:target.date,source:target.source,restorePreorder:future});
 }
 return {updates,held};
}
function lunarDateCSV(plan){
 const header=['Handle','Title','Body (HTML)','Tags','Release Date (product.metafields.custom.release_date)'];
 return '\ufeff'+[header,...plan.updates.map(x=>[x.handle,x.title,x.body,x.tags,x.date])].map(row=>row.map(q).join(',')).join('\r\n');
}
function lunarCurrentDatePlan(){
 if(!$('lunarMasterComplete').checked)throw Error('Confirm that the Shopify export contains ALL products.');
 if(!lunarDateShopifySnapshot||!lunarMaster||Date.now()-lunarDateShopifySnapshot.at>30*60*1000)throw Error('Load a fresh full Shopify export first (within 30 minutes).');
 return lunarBuildDateUpdates(lunarDateShopifySnapshot.text,lunarDateSources());
}
let lunarDatePreviewSignature='';
function lunarPreviewDateUpdates(){
 lunarDatePreviewSignature='';$('lunarDateDownload').disabled=true;
 try{
  persistActiveLunarBatch();const plan=lunarCurrentDatePlan();lunarDatePreviewSignature=JSON.stringify(plan);
  $('lunarDateResults').innerHTML='<p><b>'+plan.updates.length+' existing listings need an update; '+plan.held.length+' need review.</b></p>'+plan.updates.map(x=>'<p>'+esc(x.code)+' — '+esc(x.title)+'<br>'+esc(x.oldDate)+' → <b>'+esc(x.date)+'</b>'+(x.restorePreorder?' · restore preorder details':' · date correction only')+'</p>').join('')+plan.held.map(x=>'<p class="warn">'+esc(x.code)+' — '+esc(x.reason)+'</p>').join('');
  $('lunarDateDownload').disabled=!plan.updates.length;
 }catch(e){$('lunarDateResults').textContent=e.message;}
}
$('lunarPublishStep').insertAdjacentHTML('beforeend','<section class="panel" id="lunarDatePanel"><h3>Keep existing Shopify release dates up to date</h3><p>After refreshing Lunar dates or Product Data, check ALL saved batches against a fresh full Shopify export. New-product exports do not update existing listings. Download and import this separate update before the overnight release flow.</p><button class="btn secondary" id="lunarDateCheck">CHECK RELEASE-DATE CHANGES</button> <button class="btn" id="lunarDateDownload" disabled>DOWNLOAD SHOPIFY RELEASE-DATE UPDATES</button><div id="lunarDateResults" role="status"></div><p>For future dates, this restores preorder title, notice and tags. It does not confirm receipt or change stock, prices, visibility or product status. Import with “Overwrite products with matching handles” selected. Omitted columns stay unchanged. Check Shopify’s preview before importing, then load a fresh export to verify.</p></section>');
$('lunarDateCheck').onclick=lunarPreviewDateUpdates;
$('lunarDateDownload').onclick=()=>{
 try{
  const plan=lunarCurrentDatePlan();if(JSON.stringify(plan)!==lunarDatePreviewSignature)throw Error('Dates or Shopify data changed. Check release-date changes again before downloading.');
  if(!plan.updates.length)throw Error('No release-date updates are needed.');
  dl(new Blob([lunarDateCSV(plan)],{type:'text/csv'}),'ComicRox_Shopify_RELEASE_DATE_UPDATES_'+lunarDateToday()+'.csv');
  lunarDatePreviewSignature='';$('lunarDateDownload').disabled=true;
  $('lunarDateResults').insertAdjacentHTML('beforeend','<p><b>Downloaded '+plan.updates.length+' updates. Shopify has NOT changed yet.</b> Import the CSV with matching-handle overwrite enabled, then load a fresh Shopify export and check again. Keep the release workflow off while correcting already-released listings.</p>');
  lunarDateShopifySnapshot=null;lunarMaster=null;lunarExportBadge();
 }catch(e){$('lunarDateResults').textContent=e.message;$('lunarDateDownload').disabled=true;}
};
// Record when supplier dates were actually observed; reopening a batch is not a refresh.
const lunarDateEnrichOriginal=applyLunarProductDataText;
applyLunarProductDataText=function(text,name){
 const dates=pPlannerProductDatesFromText(text),result=lunarDateEnrichOriginal(text,name),at=new Date().toISOString();
 const updates=new Map([...dates].map(([code,date])=>[code,pDateISO(date)]));
 if(updates.size){lunarDateImportOriginal(name,[['Code','InStoreDate'],...updates].map(row=>row.map(q).join(',')).join('\n'));lunarSyncSavedReleaseDates(updates,at);}
 persistActiveLunarBatch();return result;
};
const lunarDateImportOriginal=pImportPlannerDates;
pImportPlannerDates=function(name,text){
 const result=lunarDateImportOriginal(name,text);
 const cache=pReadDateCache(),rows=parseCsv(text.replace(/^\uFEFF/,'')),hi=rows.findIndex(r=>r.includes('Code')&&r.includes('InStoreDate'));
 const updates=new Map(rows.slice(hi+1).filter(row=>pLunarISO(row[rows[hi].indexOf('InStoreDate')])).map(row=>String(row[rows[hi].indexOf('Code')]||'').trim().toUpperCase()).filter(code=>cache[code]).map(code=>[code,cache[code].iso]));
 lunarSyncSavedReleaseDates(updates,new Date().toISOString());
 $('plannerStatus').textContent+=' Revised dates are local only: use CHECK SHOPIFY & EXPORT → CHECK RELEASE-DATE CHANGES and import the update CSV into Shopify.';
 return result;
};

function lunarSyncSavedReleaseDates(dates,at){
 const all=loadLunarBatches();
 for(const b of all)for(const r of b.records||[])if(dates.has(r.code)){r.release=dates.get(r.code);r.releaseDateObservedAt=at;}
 saveLunarBatches(all);
 for(const r of wholesaleRecords)if(dates.has(r.code)){r.release=dates.get(r.code);r.releaseDateObservedAt=at;}
 if(wholesaleRecords.length)renderWholesale();
}


// Deliveries are evidence of dispatch. Receipt is recorded only after the owner counts a parcel.
function lunarValidateDeliveries(v){
 for(const key of ['shipments','billingDocuments'])if(v[key]!==undefined&&(!v[key]||typeof v[key]!=='object'||Array.isArray(v[key])))throw Error('Invalid delivery/billing history. Restore a verified backup.');
 for(const [id,s]of Object.entries(v.shipments||{})){
  if(!/^\d+$/.test(id)||s.id!==id||!s.fingerprint||!Array.isArray(s.items)||!Array.isArray(s.lines)||!Array.isArray(s.adjustments)||!Number.isFinite(Date.parse(s.importedAt)))throw Error('Invalid saved shipment.');
  const codes=new Set();for(const r of s.items){if(!/^\d{4}[A-Z]{2}\d+$/.test(r.code)||codes.has(r.code)||!Number.isSafeInteger(r.qty)||r.qty<=0||!lunarISO(r.release))throw Error('Invalid saved shipment product.');codes.add(r.code);}
  if(s.receipt){
   if(!lunarISO(s.receipt.date)||!s.receipt.counts||typeof s.receipt.counts!=='object')throw Error('Invalid receipt history.');
   for(const r of s.items){const c=s.receipt.counts[r.code];if(!c||![c.good,c.damaged].every(n=>Number.isSafeInteger(n)&&n>=0)||c.good+c.damaged>r.qty)throw Error('Invalid received quantities.');}
   if(Object.keys(s.receipt.counts).some(code=>!codes.has(code)))throw Error('Unexpected receipt product.');
  }
  if(s.completed!==undefined&&(!s.completed||typeof s.completed!=='object'||Array.isArray(s.completed)))throw Error('Invalid listing checklist.');
  for(const [code,c]of Object.entries(s.completed||{}))if(!codes.has(code)||!s.receipt||c.good!==s.receipt.counts[code].good||!lunarISO(c.release)||!Number.isFinite(Date.parse(c.at)))throw Error('Invalid completed listing entry.');
 }
 for(const [id,b]of Object.entries(v.billingDocuments||{}))if(b.id!==id||!/^\d+$/.test(id)||!['merchandise','shipping_credit'].includes(b.kind)||!b.fingerprint)throw Error('Invalid saved billing document.');
 return v;
}
const lunarDeliveryReadOriginal=lunarReadState;
lunarReadState=function(){return lunarValidateDeliveries(lunarDeliveryReadOriginal());};
const lunarDeliveryWriteOriginal=lunarWriteState;
lunarWriteState=function(v){lunarValidateDeliveries(v);lunarDeliveryWriteOriginal(v);};
async function lunarDocumentFingerprint(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function lunarParseShipment(text,name){
 const id=String(name).match(/^Shipment_(\d+)\.csv$/i)?.[1],rows=parseCsv(text.replace(/^\uFEFF/,''));
 if(!id||String(rows[0]?.[0]||'').trim()!==id)throw Error('Choose the original Shipment_123456.csv file. Its shipment number must match the filename.');
 const hi=rows.findIndex(r=>r[0]==='Code'&&r[1]==='Title');if(hi<0)throw Error('Shipment product headers are missing.');
 const h=rows[hi],ix=n=>h.indexOf(n);for(const n of ['Code','Title','Qty','UPC','In-Store Date'])if(ix(n)<0)throw Error('Shipment column missing: '+n);
 const groups=new Map(),lines=[],seen=new Set();
 for(const row of rows.slice(hi+1)){
  if(row.every(x=>!String(x).trim()))continue;
  const get=n=>String(row[ix(n)]??'').trim(),code=get('Code').toUpperCase();
  if(!/^\d{4}[A-Z]{2}\d+$/.test(code))throw Error('Unsupported shipment row. No shipment has been saved.');
  const qty=Number(get('Qty')),release=lunarISO(get('In-Store Date')),title=get('Title'),upc=get('UPC');
  if(!/^-?\d+$/.test(get('Qty'))||!Number.isSafeInteger(qty)||!release||!title)throw Error('Invalid shipment quantity, date or title for '+code+'.');
  const signature=JSON.stringify(row);if(seen.has(signature))throw Error('Identical shipment line repeated for '+code+'. Review the original file.');seen.add(signature);
  const identity=JSON.stringify([title.toUpperCase().replace(/\s+/g,' '),upc,release]);
  let group=groups.get(code);if(group&&group.identity!==identity)throw Error('Conflicting shipment details for '+code+'.');
  if(!group){group={code,title,upc,release,qty:0,identity};groups.set(code,group);}
  group.qty+=qty;if(!Number.isSafeInteger(group.qty))throw Error('Shipment quantity is too large.');
  lines.push({code,title,qty,release,upc,raw:row});
 }
 if(!groups.size)throw Error('Shipment contains no product rows.');
 const items=[],adjustments=[];for(const {identity,...r}of groups.values())(r.qty>0?items:adjustments).push(r);
 return {id,sourceFile:name,dispatchText:String(rows[1]?.[0]||''),documentDate:lunarISO(String(rows[1]?.[0]||'').split(' ')[0]),items,adjustments,lines};
}
async function lunarImportShipment(text,name){
 const parsed=lunarParseShipment(text,name),fingerprint=await lunarDocumentFingerprint(text),state=lunarReadState();state.shipments??={};
 const existing=state.shipments[parsed.id];
 if(existing){if(existing.fingerprint!==fingerprint)throw Error('Shipment '+parsed.id+' is already saved with different contents. Existing receipt checks are retained; review the amendment manually.');return {shipment:existing,reopened:true};}
 const shipment={...parsed,fingerprint,importedAt:new Date().toISOString(),receipt:null,completed:{},receiptHistory:[]};state.shipments[parsed.id]=shipment;lunarWriteState(state);return {shipment,reopened:false};
}
function lunarSaveReceipt(id,date,counts,notes){
 const state=lunarReadState(),s=state.shipments?.[id];if(!s)throw Error('Import the shipment first.');
 date=lunarISO(date);if(!date||date>lunarDateToday())throw Error('Choose the date the parcel arrived, no later than today.');
 const checked={};for(const r of s.items){const c=counts[r.code];if(!c||![c.good,c.damaged].every(n=>Number.isSafeInteger(n)&&n>=0)||c.good+c.damaged>r.qty)throw Error('Check received quantities for '+r.code+'. Good plus damaged cannot exceed shipped quantity. Put extras in the notes.');checked[r.code]={good:c.good,damaged:c.damaged};}
 const receipt={date,counts:checked,notes:String(notes||'').trim(),savedAt:new Date().toISOString()};
 if(s.receipt&&JSON.stringify([s.receipt.date,s.receipt.counts,s.receipt.notes])===JSON.stringify([receipt.date,receipt.counts,receipt.notes]))return s;
 if(s.receipt)(s.receiptHistory??=[]).push({receipt:s.receipt,completed:s.completed});
 s.receipt=receipt;s.completed={};lunarWriteState(state);return s;
}
function lunarBillingRows(text){
 const rows=parseCsv(text.replace(/^\uFEFF/,'')),hi=rows.findIndex(r=>r[0]==='Code'&&r[1]==='Title');if(hi<0)throw Error('Invoice product headers are missing.');
 const h=rows[hi],items=[];for(const row of rows.slice(hi+1)){const code=String(row[h.indexOf('Code')]||'').trim();if(!/^\d{4}[A-Z]{2}\d+$/.test(code))continue;const qty=Number(row[h.indexOf('Qty')]);if(!Number.isSafeInteger(qty))throw Error('Invalid invoice quantity.');items.push({code,qty,title:row[h.indexOf('Title')],release:lunarISO(row[h.indexOf('In-Store Date')]),raw:row});}
 return items;
}
async function lunarRecordBilling(text,name,kind){
 const id=text.match(/Invoice\s*#\s*(\d+)/i)?.[1],filenameId=name.match(/^Invoice_(\d+)(?: \(\d+\))?\.csv$/i)?.[1];if(!id||id!==filenameId)throw Error('Choose the original Invoice_123456.csv with a matching invoice number.');
 const items=lunarBillingRows(text),fingerprint=await lunarDocumentFingerprint(text),state=lunarReadState();state.billingDocuments??={};
 const old=state.billingDocuments[id];if(old){if(old.fingerprint!==fingerprint)throw Error('Invoice '+id+' has different contents from the saved document. Review the amendment manually.');return old;}
 const doc={id,sourceFile:name,kind,fingerprint,importedAt:new Date().toISOString(),date:lunarISO(text.match(/Invoice Date:\s*([^\r\n]+)/i)?.[1]),amount:text.match(/Pay this amount:[^\r\n]*?\$([\d,.]+)/i)?.[1]||'',items,rawText:text};
 state.billingDocuments[id]=doc;lunarWriteState(state);return doc;
}
// A shipping/credit-only invoice belongs in billing history, never in a sale batch.
const lunarDeliveryInvoiceOriginal=$('lunarFile').onchange;
$('lunarFile').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  const text=await f.text(),items=lunarBillingRows(text),incomingId=text.match(/Invoice\s*#\s*(\d+)/i)?.[1],prior=lunarReadState().billingDocuments?.[incomingId];
  if(!incomingId||f.name.match(/^Invoice_(\d+)(?: \(\d+\))?\.csv$/i)?.[1]!==incomingId)throw Error('Choose the original Invoice_123456.csv with a matching invoice number.');
  if(prior&&prior.fingerprint!==await lunarDocumentFingerprint(text))throw Error('Invoice '+incomingId+' has different contents from the saved document. Existing records are retained.');
  const shippingOnly=items.every(r=>r.qty<=0)&&/Shipping Charges/i.test(text);
  if(shippingOnly){const doc=await lunarRecordBilling(text,f.name,'shipping_credit');$('lunarInvoiceMessage').textContent='Invoice '+doc.id+' saved as shipping / credit only. No books or stock were added. Next: check the parcel in DELIVERIES when it arrives.';e.target.value='';lunarRenderDashboard();return;}
  // Normal merchandise imports retain all existing invoice validation and duplicate protection.
  await lunarDeliveryInvoiceOriginal(e);
  const id=text.match(/Invoice\s*#\s*(\d+)/i)?.[1],b=loadLunarBatches().find(b=>b.invoiceId===id),hash=await lunarDocumentFingerprint(text);
  if(b?.invoiceFingerprint===hash){await lunarRecordBilling(text,f.name,'merchandise');lunarRenderDashboard();}
 }catch(err){$('lunarInvoiceMessage').textContent=err.message;}finally{e.target.value='';}
};
const lunarDeliveryDateSourcesOriginal=lunarDateSources;
lunarDateSources=function(){
 const sources=lunarDeliveryDateSourcesOriginal();
 for(const s of Object.values(lunarReadState().shipments||{}))for(const r of s.items){if(!sources.has(r.code))sources.set(r.code,[]);sources.get(r.code).push({date:r.release,source:'Shipment '+s.id,observedAt:s.documentDate?s.documentDate+'T00:00:00Z':''});}
 return sources;
};
function lunarDeliveryDateInfo(){return lunarResolveReleaseDates(lunarDateSources());}
function lunarDeliveryRows(today=lunarDateToday()){
 const state=lunarReadState(),dates=lunarDeliveryDateInfo(),conflicts=new Map(dates.conflicts.map(x=>[x.code,x.reason])),result=[];
 for(const s of Object.values(state.shipments||{}))for(const r of s.items){
  const release=dates.resolved.get(r.code)?.date||r.release,c=s.receipt?.counts[r.code],good=c?.good||0,damaged=c?.damaged||0,missing=c?r.qty-good-damaged:null;
  const conflict=conflicts.get(r.code),done=!!(s.completed?.[r.code]&&s.completed[r.code].release===release&&s.completed[r.code].good===good);
  const status=conflict?'check_date':!s.receipt||!good?'waiting_delivery':release>today?'waiting_date':done?'done':'ready';
  result.push({...r,shipmentId:s.id,release,good,damaged,missing,receiptDate:s.receipt?.date||'',status,conflict,done});
 }
 return result;
}
function lunarCompleteDelivery(id,code){
 const row=lunarDeliveryRows().find(r=>r.shipmentId===id&&r.code===code);if(!row||row.status!=='ready')throw Error('Only received, undamaged books whose release date has arrived can be marked checked.');
 const state=lunarReadState();state.shipments[id].completed[code]={at:new Date().toISOString(),good:row.good,release:row.release};lunarWriteState(state);
}
function lunarWeekStart(date){return pDateISO(pMonday(pParseDate(date)));}
function lunarWeeklyRows(week){
 const dates=lunarDeliveryDateInfo(),deliveries=lunarDeliveryRows(),result=new Map(),add=(code,title,release)=>{if(!release||lunarWeekStart(release)!==week)return null;if(!result.has(code))result.set(code,{code,title,release,ordered:null,billed:null,shipped:0,good:0,damaged:0,missing:0,awaitingCount:false,shipments:[],conflict:dates.conflicts.find(x=>x.code===code)?.reason});return result.get(code);};
 for(const [id,o]of Object.entries(pReadOrders().orders))for(const r of o.items||[]){const x=add(r.code,r.title,dates.resolved.get(r.code)?.date||lunarISO(r.instore));if(x)x.ordered=(x.ordered||0)+Number(r.qty);}
 for(const b of loadLunarBatches())for(const r of b.records||[]){const x=add(r.code,r.cleanTitle||r.rawTitle,dates.resolved.get(r.code)?.date||lunarISO(r.release));if(x&&b.invoiceId)x.billed=(x.billed||0)+Number(r.invoiceQty??r.qty);}
 for(const r of deliveries){const x=add(r.code,r.title,r.release);if(!x)continue;x.shipped+=r.qty;x.good+=r.good;x.damaged+=r.damaged;x.missing+=r.missing||0;x.awaitingCount||=r.missing===null;x.shipments.push(r.shipmentId);}
 return [...result.values()].sort((a,b)=>a.title.localeCompare(b.title));
}
function lunarReceiptEditor(id){
 const s=lunarReadState().shipments?.[id];if(!s)return;
 $('lunarShipmentSelect').value=id;
 $('lunarReceiptEditor').innerHTML='<h3>Shipment '+esc(s.id)+' — '+s.items.length+' products / '+s.items.reduce((n,r)=>n+r.qty,0)+' copies</h3><p>'+esc(lunarShipmentInvoiceSummary(s))+'</p><p>Enter the total good and damaged copies you have received against this shipment. Blank good quantities must be filled in; use 0 for missing books. Saving again replaces these counts rather than adding them.</p><button class="btn secondary" id="lunarAllReceived">ALL COPIES HERE AND UNDAMAGED</button><label>Date parcel arrived <input type="date" id="lunarReceiptDate" value="'+esc(s.receipt?.date||lunarDateToday())+'" max="'+lunarDateToday()+'"></label><div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Book / code</th><th>Release</th><th>Shipped</th><th>Good received</th><th>Damaged</th></tr></thead><tbody>'+s.items.map(r=>'<tr><td>'+esc(r.title)+'<br><small>'+esc(r.code)+'</small></td><td>'+esc(r.release)+'</td><td>'+r.qty+'</td><td><input aria-label="Good received '+esc(r.code)+'" type="number" min="0" max="'+r.qty+'" step="1" style="width:85px" data-receipt-good="'+esc(r.code)+'" value="'+(s.receipt?s.receipt.counts[r.code].good:'')+'"></td><td><input aria-label="Damaged '+esc(r.code)+'" type="number" min="0" max="'+r.qty+'" step="1" style="width:85px" data-receipt-damaged="'+esc(r.code)+'" value="'+(s.receipt?s.receipt.counts[r.code].damaged:0)+'"></td></tr>').join('')+'</tbody></table></div><label>Shortages, damage or extra copies<textarea id="lunarReceiptNotes">'+esc(s.receipt?.notes||'')+'</textarea></label><label style="display:block;margin:12px 0"><input type="checkbox" id="lunarReceiptConfirmed"> I have counted the parcel. These are actual received quantities.</label><button class="btn" id="lunarSaveReceipt">SAVE PARCEL CHECK</button> <button class="btn secondary" id="lunarReceiptToDashboard">VIEW WEEKLY CHECKLIST</button>'+(s.adjustments.length?'<details><summary>'+s.adjustments.length+' cancelled / adjustment product(s) — excluded from receipt quantities</summary>'+s.adjustments.map(r=>'<p>'+esc(r.code)+' — net '+r.qty+' copies. Check Lunar credit records if needed.</p>').join('')+'</details>':'');
 $('lunarAllReceived').onclick=()=>{for(const r of s.items){document.querySelector('[data-receipt-good="'+r.code+'"]').value=r.qty;document.querySelector('[data-receipt-damaged="'+r.code+'"]').value=0;}$('lunarReceiptConfirmed').checked=false;};
 $('lunarReceiptToDashboard').onclick=()=>showLunarPage('overview');
 $('lunarSaveReceipt').onclick=()=>{try{
  if(!$('lunarReceiptConfirmed').checked)throw Error('Count the parcel and tick the confirmation first.');
  const counts={};for(const r of s.items){const good=document.querySelector('[data-receipt-good="'+r.code+'"]'),damaged=document.querySelector('[data-receipt-damaged="'+r.code+'"]');if(!/^\d+$/.test(good.value)||!/^\d+$/.test(damaged.value))throw Error('Enter whole-number quantities for every book, including 0 for missing copies.');counts[r.code]={good:Number(good.value),damaged:Number(damaged.value)};}
  lunarSaveReceipt(id,$('lunarReceiptDate').value,counts,$('lunarReceiptNotes').value);$('lunarShipmentMessage').textContent='Parcel check saved. Shopify stock has not changed. The weekly checklist now shows what can be listed and what must wait.';lunarRenderDashboard();lunarReceiptEditor(id);
 }catch(e){$('lunarShipmentMessage').textContent=e.message;}};
}
function lunarRenderShipments(){
 const select=$('lunarShipmentSelect');if(!select)return;const previous=select.value;
 const shipments=Object.values(lunarReadState().shipments||{}).sort((a,b)=>b.id.localeCompare(a.id));
 select.innerHTML='<option value="">Choose a saved shipment…</option>'+shipments.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.id)+' — '+(s.receipt?'parcel checked':'waiting for parcel check')+'</option>').join('');if(shipments.some(s=>s.id===previous))select.value=previous;
}
function lunarRenderDashboard(){
 const box=$('lunarWeeklyList');if(!box)return;
 const week=$('lunarWeekChoice').value||lunarWeekStart(lunarDateToday());let rows;
 try{rows=lunarWeeklyRows(week);}catch(e){box.textContent=e.message;return;}
 const weeks=new Set([lunarWeekStart(lunarDateToday()),week]);for(const item of lunarDateSources().values())for(const d of item)weeks.add(lunarWeekStart(d.date));
 $('lunarWeekJump').innerHTML=[...weeks].sort().map(w=>'<option value="'+w+'" '+(w===week?'selected':'')+'>Week of '+esc(prettyRelease(w))+'</option>').join('');
 $('lunarWeeklySummary').textContent=rows.length+' products · '+rows.reduce((n,r)=>n+r.shipped,0)+' copies recorded shipped · '+rows.reduce((n,r)=>n+r.good,0)+' good copies confirmed received. A dash means that document has not been loaded. These are local records, not live Shopify stock.';
 box.innerHTML=rows.length?'<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Book / release date</th><th>Ordered</th><th>Billed</th><th>Shipped</th><th>Good received</th><th>Next step</th></tr></thead><tbody>'+rows.map(r=>{
 const action=r.conflict?'Check date — refresh Lunar dates':r.good&&r.release>lunarDateToday()?'Wait until '+prettyRelease(r.release):r.good?'Check the listing checklist below':r.shipped?'Count parcel / await delivery':'Await shipment';
 return '<tr><td>'+esc(r.title||r.code)+'<br><small>'+esc(r.code)+' · '+esc(r.release)+'</small></td><td data-label="Ordered">'+esc(r.ordered??'—')+'</td><td data-label="Billed">'+esc(r.billed??'—')+'</td><td data-label="Shipped">'+r.shipped+'</td><td data-label="Good received">'+r.good+(r.damaged?' · '+r.damaged+' damaged':'')+(r.missing?' · '+r.missing+' missing':'')+'</td><td>'+esc(action)+(r.shipments.length?'<br><button class="btn secondary" data-open-shipment="'+esc(r.shipments[0])+'">CHECK PARCEL</button>':'')+'</td></tr>';
 }).join('')+'</tbody></table></div>':'<p>No saved records for this week. Import your orders or shipment file to start.</p>';
 const queue=lunarDeliveryRows(),ready=queue.filter(r=>r.status==='ready'),waiting=queue.filter(r=>r.status==='waiting_date'),unreceived=queue.filter(r=>r.status==='waiting_delivery'),conflicted=queue.filter(r=>r.status==='check_date');
 $('lunarReadyList').innerHTML='<h3>Ready to check in Crosslist — '+ready.length+' shipment lines (all weeks)</h3><p>These have good copies confirmed received and a release date of today or earlier. Check current Shopify stock and existing listings first. Add only genuinely new stock; do not add the shipment quantity again if it is already recorded. Publish received stock to eBay/Whatnot, leaving Shopify unticked.</p>'+ready.map(r=>'<p>'+esc(r.title)+' · <b>'+r.good+' good copies received</b> · shipment '+esc(r.shipmentId)+'<br><button class="btn secondary" data-delivery-done="'+esc(r.shipmentId)+'" data-delivery-code="'+esc(r.code)+'">I HAVE CHECKED / LISTED THIS</button></p>').join('')+(ready.length?'':'<p>No received books currently awaiting listing checks.</p>')+'<details><summary>Waiting / completed</summary><p>'+waiting.length+' waiting for release date · '+unreceived.length+' awaiting good copies / parcel count · '+conflicted.length+' need a date check · '+queue.filter(r=>r.status==='done').length+' listing checks complete.</p>'+queue.filter(r=>r.status!=='ready').map(r=>'<p>'+esc(r.title)+' · '+esc({waiting_date:'Wait until '+prettyRelease(r.release),waiting_delivery:'Await good copies / check parcel',check_date:'Refresh conflicting release dates',done:'Listing check complete'}[r.status])+'</p>').join('')+'</details>';
 const docs=Object.values(lunarReadState().billingDocuments||{});$('lunarBillingHistory').innerHTML='<details><summary>Saved invoice documents — '+docs.length+'</summary>'+docs.map(d=>'<p>Invoice '+esc(d.id)+' · '+(d.kind==='shipping_credit'?'shipping / credit only — no stock':'merchandise billing — not receipt')+(d.amount?' · $'+esc(d.amount):'')+'</p>').join('')+'</details>';
 lunarRenderShipments();
}
const lunarDeliveryHelp={
 overview:['Start here','Choose what has happened today. The weekly checklist below brings orders, invoices and deliveries together.'],
 planner:['New order','Use Order_….csv here. Refresh Lunar dates, choose the release week, then SEND TO WEBSITE PREP. Orders are plans, not deliveries.'],
 batches:['Your saved work','Open an existing batch to continue. Your reviewed prices and descriptions are retained.'],
 product:['Add book details','Use Lunar Product Data for covers, descriptions and current dates. Then CONTINUE TO REVIEW & PRICE.'],
 review:['Check titles and prices','Review the books, then SAVE REVIEW → CHECK SHOPIFY & EXPORT. Receipt is checked separately in DELIVERIES.'],
 publish:['Send changes to Shopify','Load a fresh ALL-products Shopify export. New-product CSVs create missing books; release-date CSVs correct existing books. Import each downloaded file into Shopify.'],
 invoice:['New invoice','Use Invoice_….csv here. Merchandise invoices record billing; shipping / credit-only invoices are saved separately. Neither confirms delivery.'],
 deliveries:['Parcel arrived','Use Shipment_….csv here. Importing records dispatch only. Count the parcel, enter good and damaged copies, then SAVE PARCEL CHECK.']
};
const lunarDeliveryGuideOriginal=lunarRefreshGuide;
lunarRefreshGuide=function(){lunarDeliveryGuideOriginal();const page=document.querySelector('.lunarNavBtn.active')?.dataset.lunarNav||'overview',[title,help]=lunarDeliveryHelp[page]||lunarDeliveryHelp.overview;$('lunarGuide').innerHTML='<b>'+esc(title)+'</b><p>'+esc(help)+'</p><small>Shopify release emails follow dates only. Use the receipt checklist before listing on eBay / Whatnot.</small>';};
const lunarDeliveryShowOriginal=showLunarPage;
showLunarPage=function(page){
 if(['overview','deliveries'].includes(page)){document.querySelectorAll('.lunarNavBtn').forEach(b=>b.classList.toggle('active',b.dataset.lunarNav===page));document.querySelectorAll('.lunarPage').forEach(p=>p.classList.toggle('active',p.dataset.lunarPage===page));}
 else lunarDeliveryShowOriginal(page);
 lunarRefreshGuide();if(['overview','deliveries'].includes(page))lunarRenderDashboard();
};
$('lunarSubnav').insertAdjacentHTML('afterbegin','<button class="lunarNavBtn" data-lunar-nav="overview">START HERE</button>');
$('lunarSubnav').insertAdjacentHTML('beforeend','<button class="lunarNavBtn" data-lunar-nav="deliveries">DELIVERIES</button>');
for(const page of ['overview','deliveries'])document.querySelector('[data-lunar-nav="'+page+'"]').onclick=()=>showLunarPage(page);
document.querySelector('[data-lunar-nav="invoice"]').textContent='INVOICES — BILLING';
$('wholesalePane').insertAdjacentHTML('beforeend','<section class="panel lunarPage" data-lunar-page="overview"><h2>Your Lunar checklist</h2><div class="actions"><button class="btn secondary" data-lunar-go="planner">NEW ORDER</button><button class="btn secondary" data-lunar-go="publish">UPDATE SHOPIFY / DATES</button><button class="btn secondary" data-lunar-go="invoice">NEW INVOICE</button><button class="btn" data-lunar-go="deliveries">PARCEL ARRIVED</button></div><p>Order = planned. Invoice = billed. Shipment = dispatched. Parcel check = received.</p><label>Expected release week <select id="lunarWeekJump"></select></label><button class="btn secondary" id="lunarPrevWeek">PREVIOUS WEEK</button> <button class="btn secondary" id="lunarNextWeek">NEXT WEEK</button><input hidden type="date" id="lunarWeekChoice" value="'+lunarWeekStart(lunarDateToday())+'"><button class="btn secondary" id="lunarRefreshDashboard">REFRESH CHECKLIST</button> <button class="btn secondary" id="lunarDownloadWeek">DOWNLOAD WEEKLY CHECKLIST</button><div id="lunarWeeklySummary" role="status"></div><div id="lunarWeeklyList"></div><section id="lunarReadyList"></section><div id="lunarBillingHistory"></div><p>This checklist is saved in this browser and included in DOWNLOAD LUNAR BACKUP. It does not change Shopify, Crosslist or your overnight Flow.</p></section><section class="panel lunarPage" data-lunar-page="deliveries"><h2>Check a delivery</h2><p>1. Import the shipment file. 2. Count the parcel. 3. Save actual received quantities.</p><label class="btn filebtn">IMPORT SHIPMENT CSV<input id="lunarShipmentFile" type="file" accept=".csv" hidden></label><label>Or reopen <select id="lunarShipmentSelect"></select></label><div id="lunarShipmentMessage" role="status"></div><div id="lunarReceiptEditor"></div></section>');
$('lunarInvoiceStep').insertAdjacentHTML('beforeend','<p>Shipping / credit-only invoices are recorded as billing documents, with no stock changes.</p><button class="btn secondary" data-lunar-go="deliveries">NEXT: CHECK A DELIVERY</button>');
$('lunarWeekChoice').onchange=()=>{const date=lunarISO($('lunarWeekChoice').value);if(date)$('lunarWeekChoice').value=lunarWeekStart(date);lunarRenderDashboard();};
$('lunarRefreshDashboard').onclick=lunarRenderDashboard;
 $('lunarWeekJump').onchange=e=>{$('lunarWeekChoice').value=e.target.value;lunarRenderDashboard();};
 for(const [id,days]of [['lunarPrevWeek',-7],['lunarNextWeek',7]])$(id).onclick=()=>{const d=pParseDate($('lunarWeekChoice').value);d.setDate(d.getDate()+days);$('lunarWeekChoice').value=pDateISO(d);lunarRenderDashboard();};
$('lunarDownloadWeek').onclick=()=>{try{const week=$('lunarWeekChoice').value,rows=lunarWeeklyRows(week),header=['Release date','Code','Book','Ordered','Billed','Shipped','Good received','Damaged','Missing after count','Shipment IDs'];const csv='\ufeff'+[header,...rows.map(r=>[r.release,r.code,r.title,r.ordered??'',r.billed??'',r.shipped,r.good,r.damaged,r.missing,r.shipments.join('; ')])].map(row=>row.map(q).join(',')).join('\r\n');dl(new Blob([csv],{type:'text/csv'}),'ComicRox_Weekly_CHECKLIST_'+week+'.csv');}catch(e){$('lunarWeeklySummary').textContent=e.message;}};
 $('lunarShipmentSelect').onchange=e=>{if(e.target.value)lunarReceiptEditor(e.target.value);else $('lunarReceiptEditor').innerHTML='';};
$('lunarShipmentFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const {shipment,reopened}=await lunarImportShipment(await f.text(),f.name);$('lunarShipmentMessage').textContent=(reopened?'Reopened saved shipment '+shipment.id+'. Your parcel checks were retained.':'Shipment '+shipment.id+' saved. Nothing is marked received yet. Count the parcel below.')+' No Shopify stock has changed.';lunarRenderShipments();lunarReceiptEditor(shipment.id);lunarRenderDashboard();}catch(err){$('lunarShipmentMessage').textContent=err.message;}finally{e.target.value='';}};
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.lunarGo)showLunarPage(b.dataset.lunarGo);
 if(b.dataset.openShipment){showLunarPage('deliveries');lunarReceiptEditor(b.dataset.openShipment);}
 if(b.dataset.deliveryDone){try{if(!confirm('Have you checked current stock and completed any needed eBay / Whatnot listing work? This marks the local checklist only; it changes no listings or stock.'))return;lunarCompleteDelivery(b.dataset.deliveryDone,b.dataset.deliveryCode);lunarRenderDashboard();}catch(err){alert(err.message);}}
});
// Simplify export history without discarding unresolved imports or their audit trail.
lunarRenderHistory=function(){
 lunarHeldOriginalHistory();lunarRenderDeferred();
 const all=lunarReadState().exports.slice().reverse(),pending=all.filter(x=>x.outcome==='pending'),completed=all.filter(x=>x.outcome!=='pending');
 const entry=x=>'<div><p><b>'+esc(x.fileName)+'</b> · '+esc(x.outcome)+'<br>'+esc(x.at||'Date unavailable')+' · '+x.codes.length+' products · '+esc(x.batchId||'batch unavailable')+' · '+esc(x.id)+'</p><button class="btn secondary" data-lunar-redownload="'+esc(x.id)+'">Download same file</button>'+(x.outcome==='pending'?' <button class="btn secondary" data-lunar-outcome="'+esc(x.id)+'" data-outcome="imported">All rows imported</button> <button class="btn secondary" data-lunar-outcome="'+esc(x.id)+'" data-outcome="not_imported">Not imported / cancelled</button><p>Partial import? Keep pending. Load a fresh Shopify export before retrying. Cancel only if none were imported.</p>':'')+'</div>';
 $('lunarExportHistory').innerHTML='<h3>Awaiting import confirmation — '+pending.length+'</h3>'+pending.map(entry).join('')+'<details><summary>Completed export history — '+completed.length+'</summary>'+completed.map(entry).join('')+'</details>';
};
lunarRenderHistory();showLunarPage('overview');

function lunarInvoiceReleaseFields(fresh,old,invoiceDate){
 const stamp=invoiceDate?invoiceDate+'T00:00:00Z':'';
 // Retain a later observed supplier revision; original billed dates remain in invoiceLines.
 if(old?.releaseDateObservedAt&&lunarISO(old.release)&&(!stamp||Date.parse(old.releaseDateObservedAt)>Date.parse(stamp)))return {release:old.release,releaseDateObservedAt:old.releaseDateObservedAt};
 return {release:fresh.release,releaseDateObservedAt:stamp};
}

document.head.insertAdjacentHTML('beforeend',`<style>
#lunarWeeklyList table,#lunarReceiptEditor table{border-collapse:collapse;table-layout:fixed;width:100%}
#lunarWeeklyList th,#lunarReceiptEditor th{position:static!important;text-align:left;background:#161b16;color:#fff;padding:12px 8px}
#lunarWeeklyList td,#lunarReceiptEditor td{padding:12px 8px;vertical-align:top;border-bottom:1px solid #333;overflow-wrap:anywhere}
#lunarWeeklyList th:first-child{width:44%}#lunarWeeklyList th:last-child{width:21%}
#lunarWeeklySummary{margin:14px 0;color:#c6d5c6;line-height:1.5}
#lunarReceiptEditor table{min-width:700px}#lunarReceiptEditor th:first-child{width:45%}
#lunarReceiptEditor label{display:block;margin:12px 0}#lunarReceiptEditor input[type=checkbox]{width:auto}
#lunarReadyList{margin-top:24px;padding-top:12px;border-top:1px solid #444}
@media(max-width:700px){#lunarWeeklyList thead{display:none}#lunarWeeklyList tr{display:block;border:1px solid #444;border-radius:8px;margin:12px 0;padding:8px}#lunarWeeklyList td{display:block;border:0;padding:5px 4px}#lunarWeeklyList td[data-label]::before{content:attr(data-label) ': ';font-weight:bold;color:#b4c9b4}#lunarWeeklyList td:first-child{font-weight:bold;padding-bottom:10px}}
</style>`);

function lunarShipmentInvoiceSummary(shipment){
 const invoices=new Map();for(const b of loadLunarBatches())if(b.invoiceId){if(!invoices.has(b.invoiceId))invoices.set(b.invoiceId,new Map());for(const r of b.records||[])invoices.get(b.invoiceId).set(r.code,Number(r.invoiceQty??r.qty));}
 const exact=[],partial=[];for(const [id,items]of invoices){if(shipment.items.every(r=>items.get(r.code)===r.qty)&&items.size===shipment.items.length)exact.push(id);else if(shipment.items.some(r=>items.has(r.code)))partial.push(id);}
 if(exact.length)return 'Product codes and quantities match merchandise invoice '+exact.join(', ')+'. Invoice and shipment are still separate records.';
 if(partial.length)return 'Some products appear on invoice '+partial.join(', ')+'. Quantities / coverage differ: check the documents; this is not a confirmed full match.';
 return 'Matching merchandise invoice has not been imported yet. You can still count and check this parcel.';
}

// Guided publishing: current work first; maintenance remains available on demand.
(function(){
 const step=$('lunarPublishStep'),exportPanel=$('exportWholesale').closest('section');
 step.insertAdjacentHTML('afterbegin','<h2>3. Prepare your Shopify listings</h2><p id="lunarNextAction" role="status"></p>');
 step.querySelector('.workflowHint').hidden=true;
 exportPanel.querySelector('h2').textContent='Download this batch';
 exportPanel.querySelector('.wholesaleNote').hidden=true;
 function fold(node,label){const d=document.createElement('details');d.className='lunarOptional';const summary=document.createElement('summary');summary.textContent=label;d.append(summary);node.before(d);d.append(node);return d;}
 fold($('lunarExportHistory'),'Previous downloads and import confirmations');
 fold($('lunarDatePanel'),'Maintenance: update existing Shopify release dates');
 fold($('lunarExisting'),'Existing Shopify products');
 step.insertBefore(exportPanel,$('lunarExisting').parentElement);
 const outcome=document.createElement('div');outcome.id='lunarCurrentOutcome';exportPanel.append(outcome);
 function refresh(){
  const b=lunarActive();
  $('lunarNextAction').textContent=b?'Current batch: '+(b.invoiceId?'invoice '+b.invoiceId:'saved planning week '+b.weekKey)+'. Check Shopify below, then download your listings.':'Open a saved batch to continue.';
  const dates=[...new Set(wholesaleRecords.filter(r=>!r.excludeFromExport).map(r=>lunarISO(r.release)).filter(Boolean))].sort();if(b&&dates.length)$('lunarNextAction').textContent+=' Release dates in this batch: '+dates.join(', ')+'. The saved week is a preparation label, not a confirmed arrival date.';
  const runs=lunarReadState().exports.filter(x=>x.batchId===activeLunarBatchId&&x.outcome==='pending');
  outcome.replaceChildren();
  if(runs.length){const h=document.createElement('h3');h.textContent='Next: import your downloaded file in Shopify';outcome.append(h);for(const run of runs){const line=document.createElement('p');line.textContent=run.fileName+' — '+run.codes.length+' products';const button=document.createElement('button');button.className='btn';button.textContent='CONFIRM ALL ROWS IMPORTED';button.onclick=()=>{const original=document.querySelector('[data-lunar-outcome="'+run.id+'"]');original?.click();};outcome.append(line,button);}}
 }
 const previousShow=showLunarPage;let displayedBatch;
 showLunarPage=function(page){previousShow(page);if(displayedBatch!==activeLunarBatchId){$('wholesaleExportStatus').textContent='';$('lunarPlan').textContent='';displayedBatch=activeLunarBatchId;}refresh();if(page==='publish'){try{lunarMasterFeedback();}catch(e){$('lunarMasterStatus').textContent=e.message;}step.scrollIntoView({block:'start'});}};
 const previousHistory=lunarRenderHistory;lunarRenderHistory=function(){previousHistory();refresh();};
 const previousPlan=lunarShowPlan;lunarShowPlan=function(plan){previousPlan(plan);$('lunarPlan').insertAdjacentHTML('beforeend',plan.held.length?'<button class="btn secondary" id="lunarFixReview">FIX HELD BOOKS IN REVIEW</button>':'');if($('lunarFixReview'))$('lunarFixReview').onclick=()=>showLunarPage('review');};
 const prevSummary=wholesaleSummary;wholesaleSummary=function(){prevSummary();document.querySelectorAll('#wholesaleRows input[data-wf="cleanTitle"]').forEach(input=>{if(input.dataset.guidedCount)return;if(input.value===undefined)return;if(input.closest('td')&&/title/i.test(input.outerHTML)){input.dataset.guidedCount='1';const count=document.createElement('small');input.after(count);const update=()=>{count.textContent=input.value.length+' / 80 characters';count.style.color=input.value.length>80?'#ffbf00':'';};input.addEventListener('input',update);update();}});};
 const savedRender=renderSavedLunarBatches;renderSavedLunarBatches=function(){savedRender();document.querySelectorAll('#savedBatchList .savedBatchTitle').forEach(title=>{title.textContent=title.textContent.replace('Expected delivery w/c','Saved preparation week w/c');});};renderSavedLunarBatches();
 for(const [page,label] of [['planner','PREPARE PRE-ORDERS'],['invoice','PROCESS AN INVOICE'],['deliveries','RECEIVE A DELIVERY']]){const button=document.querySelector('[data-lunar-go="'+page+'"]');if(button)button.textContent=label;}
 $('lunarGuide').insertAdjacentHTML('beforeend','<p>Saved planning weeks are snapshots. Individual release dates can change after preparation.</p>');
 refresh();
})();
