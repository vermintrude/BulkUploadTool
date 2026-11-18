let comicRoxAiRunning=false;
const comicRoxRecoveryKey='comicrox_standard_ai_checkpoint_v1';
function comicRoxPhotoSignature(r){return JSON.stringify((r.photos||[r.photo]).map(p=>p?.path||''));}
function comicRoxAiComplete(r){return r.comicRoxAiComplete===true&&r.comicRoxAiPhotos===comicRoxPhotoSignature(r)||!r.comicRoxAiComplete&&!!r.aiBaseTitle&&!!r.confidence;}
function comicRoxRemaining(){return records.filter(r=>!comicRoxAiComplete(r)).length;}
function comicRoxUpdateResumeButton(){const n=comicRoxRemaining();if(records.length)$('identify').textContent=n===records.length?'IDENTIFY COMICS WITH AI':n?'RESUME AI — '+n+' REMAINING':'AI COMPLETE';$('identify').disabled=comicRoxAiRunning||!records.length||!n;for(const id of ['comicRoxRestoreRecovery','comicRoxImportRecovery'])if($(id))$(id).disabled=comicRoxAiRunning;}
function comicRoxSaveCheckpoint(){if(!records.length)return;try{localStorage.setItem(comicRoxRecoveryKey,JSON.stringify({version:1,savedAt:new Date().toISOString(),records}));$('comicRoxRecoveryStatus').textContent='Recovery checkpoint saved locally. Keep a downloaded backup before moving the app.';}catch{$('comicRoxRecoveryStatus').textContent='Recovery checkpoint could not save. Download a backup before closing this page.';}}
function comicRoxRestore(data){
 if(comicRoxAiRunning)throw Error('Wait for AI processing to finish before restoring a review.');
 if(data?.version!==1||!Array.isArray(data.records)||!data.records.length||data.records.length>200)throw Error('Not a supported ComicRox recovery backup.');
 const restored=JSON.parse(JSON.stringify(data.records));
 for(const r of restored){if(!r||typeof r!=='object'||!Array.isArray(r.photos)||!r.photos.length||r.photos.some(p=>!p||typeof p.path!=='string'||!p.path))throw Error('Backup is missing photo references.');}
 if(records.length&&!confirm('Replace the current Standard Batch review with this recovery backup? Download the current review first if needed.'))return;
 records=restored;renderReviews();comicRoxUpdateResumeButton();$('identifyStatus').textContent='Recovery restored. '+(records.length-comicRoxRemaining())+' completed; '+comicRoxRemaining()+' remaining. Photograph files must still exist at their original locations.';
}
(()=>{
 const controls=document.createElement('div');controls.style.margin='12px 0';controls.innerHTML='<button class="btn secondary" id="comicRoxDownloadRecovery">SAVE REVIEW BACKUP</button> <button class="btn secondary" id="comicRoxRestoreRecovery">RESTORE SAVED REVIEW</button> <label class="btn secondary filebtn">IMPORT REVIEW BACKUP<input id="comicRoxImportRecovery" type="file" accept=".json,application/json" style="display:none"></label><div id="comicRoxRecoveryStatus" class="mini"></div>';
 $('identify').parentElement.insertAdjacentElement('afterend',controls);
 const original=renderReviews;renderReviews=function(){
  // Legacy renderReviews attaches generic class handlers document-wide. Keep
  // the Lunar inputs' own handlers when rendering a Standard Batch review.
  const lunarInputs=[...document.querySelectorAll('#wholesaleRows input[data-wi], #wholesaleRows textarea[data-wi]')].map(el=>[el,el.oninput]);
  const value=original();
  for(const [el,handler] of lunarInputs)if(el.isConnected)el.oninput=handler;
  comicRoxBindStableEditors();comicRoxBindPhotoControls();comicRoxSaveCheckpoint();comicRoxUpdateResumeButton();return value;
 };
 $('reviews').addEventListener('input',()=>queueMicrotask(comicRoxSaveCheckpoint));
 $('comicRoxDownloadRecovery').onclick=()=>{if(!records.length){$('comicRoxRecoveryStatus').textContent='No current review to back up.';return;}dl(new Blob([JSON.stringify({version:1,savedAt:new Date().toISOString(),records},null,2)],{type:'application/json'}),'ComicRox-AI-Recovery.json');};
 $('comicRoxRestoreRecovery').onclick=()=>{try{const text=localStorage.getItem(comicRoxRecoveryKey);if(!text)throw Error('No saved review checkpoint in this browser.');comicRoxRestore(JSON.parse(text));}catch(e){$('comicRoxRecoveryStatus').textContent=e.message;}};
 $('comicRoxImportRecovery').onchange=async e=>{try{if(e.target.files[0])comicRoxRestore(JSON.parse(await e.target.files[0].text()));}catch(err){$('comicRoxRecoveryStatus').textContent=err.message;}finally{e.target.value='';}};
 let hasCheckpoint=false;try{hasCheckpoint=!!localStorage.getItem(comicRoxRecoveryKey);}catch{}
 if(hasCheckpoint)$('comicRoxRecoveryStatus').textContent='A saved review checkpoint is available. Restore it only if it is the batch you intend to continue.';
})();

// Editing issue/notes/grade must not rebuild the review list on every keypress.
// Update derived fields in place, leaving the current input and caret intact.
function comicRoxBindStableEditors(){
 const reviews=$('reviews');
 for(const kind of ['issue','notes','grade'])for(const input of reviews.querySelectorAll('.'+kind+'[data-i]')){
  input.oninput=()=>{
   const index=Number(input.dataset.i),record=records[index];if(!record)return;
   record[kind]=input.value;
   if(kind==='issue')updateIssue(index);
   else if(record.aiBaseTitle){
    record.title=titleWithNote(record.aiBaseTitle,record.notes,record.grade);
    record.description=descriptionWithNote((record.description||'').split(/\n\nKey \/ listing note:|\n\nCondition:/)[0],record.notes,record.grade);
   }
   const card=input.closest('.review');
   const title=card?.querySelector('input.title'),description=card?.querySelector('textarea.description');
   if(title)title.value=record.title||'';
   if(description)description.value=record.description||'';
   const count=card?.querySelector('.chars');if(count)count.textContent=String(record.title||'').length+'/80';
   summary();comicRoxSaveCheckpoint();
  };
 }
}

// Optional third workflow; existing Standard/Lunar review state is not replaced.
(()=>{const s=document.createElement('script');s.src='/ComicRox-Series-Run.js';s.onerror=()=>{const p=document.createElement('p');p.className='warn';p.textContent='Series / Run could not load. Copy its JS/helper files and the updated server, then restart the tool.';document.querySelector('.tabbtn')?.parentElement.appendChild(p);};document.body.appendChild(s);})();

// Shared laptop file picker: selected originals are copied locally, not published.
async function comicRoxBrowsePhotoFiles(fileList,onProgress=()=>{}){
 const selected=[...fileList];if(!selected.length)return [];
 if(selected.length>200)throw Error('Choose up to 200 photos at a time.');
 if(selected.some(f=>!/^.*\.(jpg|jpeg|png|webp)$/i.test(f.name)||!f.size||f.size>15*1024*1024))throw Error('Choose JPG, PNG or WebP photos up to 15 MB each.');
 if(selected.reduce((n,f)=>n+f.size,0)>500*1024*1024)throw Error('Choose up to 500 MB of photos at a time.');
 const result=[];
 for(let i=0;i<selected.length;i++){
  const f=selected[i];onProgress('Reading selected photo '+(i+1)+' of '+selected.length+' — '+f.name);
  const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(let n=0;n<bytes.length;n+=8192)binary+=String.fromCharCode(...bytes.subarray(n,n+8192));
  const data=await api('/api/photos/import',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({name:f.name,base64:btoa(binary)})});
  if(data.ok!==true||!data.photo?.path||!data.photo?.name)throw Error(data.error||'A selected photo could not be copied into the tool. Originals remain unchanged.');
  result.push(data.photo);
 }
 return [...new Map(result.map(p=>[p.path,p])).values()];
}
(()=>{
 const box=document.createElement('div');box.className='actions';box.style.margin='12px 0';
 box.innerHTML='<label class="btn secondary filebtn">BROWSE LAPTOP PHOTOS<input id="standardBrowsePhotos" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden></label><label>When choosing photos <select id="standardBrowseMode"><option value="replace">Replace current photo selection</option><option value="add">Add to current photo selection</option></select></label><p id="standardBrowseStatus" class="status" role="status"></p>';
 $('preview').closest('.actions').insertAdjacentElement('afterend',box);
 let browsing=false;
 $('standardBrowsePhotos').onchange=async e=>{
  if(browsing)return;const selected=[...e.target.files];if(!selected.length)return;
  try{
   if(comicRoxAiRunning)throw Error('Wait for AI identification to finish before choosing another photo batch.');
   const replace=$('standardBrowseMode').value==='replace';
   if(replace&&photos.length&&!confirm('Replace the current photo selection? Your existing review stays saved until you explicitly build a new review.'))return;
   browsing=true;e.target.disabled=true;
   const added=await comicRoxBrowsePhotoFiles(selected,text=>$('standardBrowseStatus').textContent=text);
   // Standard Batch builds oldest first by reversing its newest-first photo list.
   // Keep the selected sequence in that same review order when browser files are used.
   const ordered=replace?added:[...selectedPhotos()].reverse().concat(added);
   photos=[...new Map(ordered.map(p=>[p.path,{...p,selected:true}])).values()].reverse();
   renderPhotos();$('build').disabled=false;$('standardBrowseStatus').textContent=added.length+' selected photos copied locally. Enter condition/pricing lines and BUILD REVIEW, then use UPLOAD USED PHOTOS TO SHOPIFY at the end. Your originals have not changed.';
  }catch(err){$('standardBrowseStatus').textContent=err.message;}finally{browsing=false;e.target.disabled=false;e.target.value='';}
 };
})();

function comicRoxBindPhotoControls(){
 for(const [i,card]of [...$('reviews').querySelectorAll('.review')].entries()){
  const r=records[i],list=r.photos||[r.photo],container=card.querySelector('.reviewPhotos');if(!container)continue;
  for(const [j,img]of [...container.querySelectorAll('img')].entries()){
   const item=document.createElement('div');item.style.cssText='display:inline-block;vertical-align:top;margin:4px;max-width:145px';img.replaceWith(item);item.appendChild(img);
   const label=document.createElement('div');label.className='mini';label.textContent=(j===0?'MAIN PHOTO · ':'Photo '+(j+1)+' · ')+(list[j].displayName||list[j].name);item.appendChild(label);
   const controls=document.createElement('div');controls.className='actions';item.appendChild(controls);
   for(const [text,kind,disabled]of [['←','left',j===0],['→','right',j===list.length-1],['Remove','remove',list.length===1]]){
    const b=document.createElement('button');b.type='button';b.className='btn secondary';b.textContent=text;b.disabled=disabled;b.dataset.standardPhotoRow=i;b.dataset.standardPhotoIndex=j;b.dataset.standardPhotoAction=kind;
    b.onclick=()=>{
     if(comicRoxAiRunning){$('standardUsedStatus').textContent='Wait for AI identification to finish before changing photos.';return;}
     const complete=comicRoxAiComplete(r),photosForRow=r.photos||[r.photo],shopsForRow=r.shops||[r.shop];
     if(kind==='remove'){if(photosForRow.length<=1)return;photosForRow.splice(j,1);shopsForRow.splice(j,1);if(complete){r.comicRoxAiComplete=true;r.comicRoxAiPhotos='';}}
     else{const target=j+(kind==='left'?-1:1);[photosForRow[j],photosForRow[target]]=[photosForRow[target],photosForRow[j]];[shopsForRow[j],shopsForRow[target]]=[shopsForRow[target],shopsForRow[j]];}
     r.photos=photosForRow;r.shops=shopsForRow;r.photo=photosForRow[0];r.shop=shopsForRow[0]||null;
     if(kind!=='remove'&&complete){r.comicRoxAiComplete=true;r.comicRoxAiPhotos=comicRoxPhotoSignature(r);}
     renderReviews();
    };controls.appendChild(b);
   }
  }
  const names=container.nextElementSibling?.nextElementSibling;if(names?.classList.contains('mini'))names.textContent=list.map(p=>p.displayName||p.name).join(' · ');
 }
}
async function comicRoxRefreshUsedPhotoLinks(){
 await refreshShop(true);
 for(const r of records){const previous=r.shops||[r.shop];r.shops=(r.photos||[r.photo]).map((p,i)=>match(p)||previous[i]||null);r.shop=r.shops[0]||null;}
 renderReviews();const all=records.flatMap(r=>r.shops||[r.shop]);const missing=all.filter(x=>!x?.URL).length;
 $('standardUsedStatus').textContent=missing?missing+' used photo links are still missing/processing. Click REFRESH USED PHOTO LINKS again before export.':'All used photo links are ready. Review your listings, then DOWNLOAD SHOPIFY CSV.';return missing;
}
(()=>{
 const box=document.createElement('div');box.innerHTML='<p>After assigning and ordering your photos, upload only the photos used by this review. The first photo for each book becomes its main listing image.</p><button class="btn" id="standardUploadUsed">UPLOAD USED PHOTOS TO SHOPIFY</button> <button class="btn secondary" id="standardRefreshUsed">REFRESH USED PHOTO LINKS</button><p id="standardUsedStatus" class="status" role="status"></p>';
 $('export').insertAdjacentElement('beforebegin',box);
 let uploading=false;
 $('standardUploadUsed').onclick=async()=>{
  if(uploading)return;
  try{
   if(!records.length)throw Error('Build the review and assign photos to books first.');if(comicRoxAiRunning)throw Error('Wait for AI identification to finish first.');
   const missing=new Map();for(const r of records)for(const [i,p]of (r.photos||[r.photo]).entries())if(!(r.shops||[r.shop])[i]?.URL)missing.set(p.path,p);
   if(!missing.size){$('standardUsedStatus').textContent='All used photos already have Shopify links. No upload needed.';return;}
   if(!confirm('Upload '+missing.size+' used photos to Shopify Files? No products will be created.'))return;
   uploading=true;$('standardUploadUsed').disabled=true;$('standardUsedStatus').textContent='Uploading '+missing.size+' used photos. Keep this page open…';
   await api('/api/upload-shopify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:[...missing.keys()]})});await comicRoxRefreshUsedPhotoLinks();
  }catch(e){$('standardUsedStatus').textContent=e.message+' If an upload started, refresh used photo links before retrying.';}finally{uploading=false;$('standardUploadUsed').disabled=false;}
 };
 $('standardRefreshUsed').onclick=async()=>{try{await comicRoxRefreshUsedPhotoLinks();}catch(e){$('standardUsedStatus').textContent=e.message;}};
 const original=renderPhotos;renderPhotos=function(){original();for(const [i,card]of [...$('photos').querySelectorAll('.photo')].entries()){const text=card.querySelector('.mini');if(text)text.textContent=photos[i].displayName||photos[i].name;}};
 const buildOriginal=$('build').onclick;$('build').onclick=()=>{if(selectedPhotos().length!==photos.length){photos=selectedPhotos();renderPhotos();}buildOriginal();};
})();

// BEGIN COMICROX SEO BUNDLE
/* Template-based Shopify SEO. Existing listing data is read, never rewritten. */
'use strict';
(()=>{
 if(window.ComicRoxSEO)return;
 const KEY='comicrox_shopify_seo_v1',fields=['SEO Title','SEO Description'],props=['seoTitle','seoDescription'];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function text(value){const el=document.createElement('div');el.innerHTML=String(value??'').replace(/<\/(?:p|div|li|h[1-6]|section)>|<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ');return (el.textContent||'').replace(/\s+/g,' ').trim();}
 const acronyms=new Set('DC CGC CBCS PGX NM VF FN VG GD UDON IDW VIZ BOOM AWA BCW MCU DCEU GN TP FCBD TPB HC UK USA US MR RRP ISBN SDCC NYCC TMNT GI JLA JSA X II III IV VI VII VIII IX XI XII'.split(' '));
 function caps(s){const cleaned=text(s);return cleaned.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g,(word,offset)=>{if(acronyms.has(word.toUpperCase()))return word.toUpperCase();if(/^[A-Z]$/.test(word)&&/(?:cover|cvr|vol\.?|volume)\s*$/i.test(cleaned.slice(0,offset)))return word;if(word!==word.toUpperCase())return word;const names={MCFARLANE:'McFarlane',MCGUINNESS:'McGuinness',MCKAY:'McKay',MCKELVIE:'McKelvie',MCNIVEN:'McNiven',MCCREA:'McCrea',MCGUIRE:'McGuire',MCDONALD:'McDonald',DEMATTEIS:'DeMatteis'};if(names[word])return names[word];if(/^MC[A-Z]{3,}$/.test(word))return 'Mc'+word[2]+word.slice(3).toLowerCase();if(offset>0&&['OF','THE','AND','VS','WITH','A','AN','IN','AT','FOR','TO'].includes(word))return word.toLowerCase();return word[0].toUpperCase()+word.slice(1).toLowerCase();});}
 function iso(s){s=String(s||'').trim().replace(/^'/,'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:'';}
 function today(){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
 function dateFromBody(body){const m=/Release\s+Date\s*:\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(body);if(!m)return '';const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(m[2].toLowerCase())+1;return iso(m[3]+'-'+String(month).padStart(2,'0')+'-'+m[1].padStart(2,'0'));}
 function source(r={}){const body=text(r.body||r['Body (HTML)']||r.comicRoxDescription||r.description),raw=text(r.title||r.Title||r.cleanTitle||r.rawTitle),title=raw.replace(/\s*[—–-]?\s*PRE[- ]ORDER\s*$/i,'').trim();let base=title.match(/^.*?#\s*\d+(?:\.\d+)?[A-Za-z]?\b/)?.[0]||title.split(/\s+(?:CVR|COVER|VARIANT|PRINTING)\b/i)[0];const issue=text(r.issue||r.issueNumber);if(issue&&!new RegExp('(?:#|\\bNo\\.?\\s*)'+issue.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(base))base+=' #'+issue;
  const date=iso(r.release||r.releaseDate||r['Release Date (product.metafields.custom.release_date)'])||dateFromBody(body),preorder=date?date>(r.today||today()):/\bpre[- ]order\b/i.test(raw+' '+r.tags+' '+body.slice(0,100));
  const cover=text(r.coverArtist)||body.match(/Cover Artist:\s*(.*?)(?=\s+(?:Issue|Variant|Printing|Pages|Rating|Release Date|Condition):|$)/i)?.[1]||'',variant=text(r.variant||r.variantDescription||r.variantType)||title.match(/\b(?:Cover|CVR)\s+[A-Z0-9]+(?:\s+[^—]*)?/i)?.[0]||'',grade=text(r.grade||r.condition)||body.match(/Condition:\s*(.+?)(?=\.(?:\s|$)|!|$)/i)?.[1]||'',printing=text(r.printing),notes=text(r.notes||r.defects)||body.match(/Key\s*\/\s*listing note:\s*(.*?)(?=\s+Condition:|$)/i)?.[1]||'';
  const publisher=text(r.publisher||r['Publisher (product.metafields.custom.publisher)'])||body.match(/Publisher:\s*(.*?)(?=\s+(?:Writer|Artist|Cover Artist|Issue|Pages|Rating|Release Date|Condition):|$)/i)?.[1]||'',year=/^\d{4}$/.test(String(r.year||''))?String(r.year):'';let cleanVariant=caps(variant).replace(/\bCvr\b/g,'Cover');if(cover)cleanVariant=cleanVariant.replace(new RegExp(cover.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),'').replace(/\s+/g,' ').trim();return {base:caps(base),cover:caps(cover),variant:cleanVariant,grade,printing:caps(printing),notes,body,date,preorder,publisher:caps(publisher),year};
 }
 function cut(s,max){s=text(s);if(s.length<=max)return s;const words=s.split(' ');while(words.length&&words.join(' ').length>max)words.pop();return words.join(' ').replace(/[,:;–—-]+$/,'').trim();}
 function generate(r){const x=source(r),details=[x.cover,x.variant,x.printing,x.grade].filter(Boolean);let title=x.base;for(const d of details){if(title.toLowerCase().includes(d.toLowerCase()))continue;const next=title+' – '+d;if(next.length<=65)title=next;}if(title.length+11<=65)title+=' | ComicRox';
  const date=x.date?new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).format(new Date(x.date+'T00:00:00Z')):'';
  let description=(x.preorder?'Pre-order ':'')+x.base+'.';const essential=x.preorder&&date?' Release date: '+date+'.':'';description+=essential;
  const shipping=/\b(?:dispatch(?:ed|es)?|shipping|ships|delivery|delivered|postage|guaranteed|arrives?)\b/i;const additions=[x.cover?'Featuring '+x.cover+' cover art.':'',x.variant?x.variant+'.':'',x.printing?'Printing: '+x.printing+'.':'',x.grade?'Condition: '+x.grade+'.':'',x.notes&&!shipping.test(x.notes)?x.notes.replace(/[.!?]?$/,'.'):'',x.publisher?'Published by '+x.publisher+(x.year?' in '+x.year:'')+'.':x.year?'Published in '+x.year+'.':''];
  for(const item of additions){if(!item)continue;const next=description+' '+item;if(next.length<=160)description=next;}
  if(description.length<140){const intro=x.body.replace(/^PRE[- ]ORDER\s*[—–-]?\s*OFFICIAL RELEASE DATE:.*?(?:not be dispatched before its official release date\.|\.(?=\s))/i,'').split(/\b(?:Publisher|Writer|Artist|Cover Artist|Issue|Pages|Rating|Release Date|Condition):/i)[0].replace(/\b(?:pre[- ]order|not (?:be )?dispatched).*$/i,'').trim();if(intro&&!shipping.test(intro)&&!/Series volume:/i.test(intro)&&!description.includes(intro)){const room=159-description.length;const extra=cut(intro,room);if(extra.length>=25)description+=' '+extra.replace(/[.!?]?$/,'.');}}
  if(description.length>=105&&description.length<135&&description.length+28<=160)description+=' View this comic at ComicRox.';
  // Essential identity/date is retained even when unusually long. Never cut through an issue number or a word.
  if(description.length>160&&x.base.length<110)description=cut(description,159).replace(/[.!?]?$/,'.');
  return {title,description};
 }
 function loadLedger(){try{const value=JSON.parse(localStorage.getItem(KEY)||'{"version":1,"products":{}}');if(value.version!==1||!value.products)throw Error();return value;}catch{return {version:1,products:{},unavailable:true};}}
 function rememberMany(entries){const ledger=loadLedger();if(ledger.unavailable)return false;for(const {handle,field,value}of entries){if(!handle||!value)continue;const product=Object.hasOwn(ledger.products,handle)?ledger.products[handle]:{};product[field]=[...new Set([...(product[field]||[]),value])].slice(-12);ledger.products[handle]=product;}try{localStorage.setItem(KEY,JSON.stringify(ledger));return true;}catch{return false;}}
 function remember(handle,field,value){return rememberMany([{handle,field,value}]);}
 function recognised(handle,field,value){const ledger=loadLedger();return !!value&&Object.hasOwn(ledger.products,handle)&&(ledger.products[handle]?.[field]||[]).includes(value);}
 function resolve(record,input){const generated=generate(input),values={};record.seoGenerated=record.seoGenerated||{};for(let i=0;i<2;i++){const field=fields[i],prop=props[i],prior=String(record[prop]??record[field]??''),fresh=i?generated.description:generated.title;if(prior&&prior!==record.seoGenerated[prop])values[field]=prior;else{values[field]=fresh;record[prop]=fresh;record.seoGenerated[prop]=fresh;}}return values;}
 function csvRows(rows){return '\ufeff'+rows.map(row=>row.map(v=>{v=String(v??'');return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\r\n');}
 function enrich(csv,records=[]){const rows=parseCsv(csv.replace(/^\uFEFF/,'')),h=rows[0];if(!h?.includes('Handle')||!h.includes('Title'))throw Error('Not a Shopify product CSV.');const ix=n=>h.indexOf(n);for(const field of fields)if(!h.includes(field))h.push(field);let index=0;const tracking=[];for(const row of rows.slice(1)){if(!row[ix('Title')]){while(row.length<h.length)row.push('');continue;}const r=records[index++]||{},input={...r,title:row[ix('Title')],body:row[ix('Body (HTML)')],tags:row[ix('Tags')],publisher:row[ix('Publisher (product.metafields.custom.publisher)')]||r.publisher,release:row[ix('Release Date (product.metafields.custom.release_date)')]||r.release};const existing={...r};for(let j=0;j<2;j++)if(row[ix(fields[j])])existing[props[j]]=row[ix(fields[j])];const seo=resolve(existing,input);for(const prop of [...props,'seoGenerated'])r[prop]=existing[prop];for(const f of fields){row[ix(f)]=seo[f];if(seo[f]===(f==='SEO Title'?r.seoGenerated?.seoTitle:r.seoGenerated?.seoDescription))tracking.push({handle:row[ix('Handle')],field:f,value:seo[f]});}}rememberMany(tracking);return csvRows(rows);}
 function plan(csv,now=today()){const ledger=loadLedger(),known=(handle,field,value)=>Object.hasOwn(ledger.products,handle)&&(ledger.products[handle]?.[field]||[]).includes(value);const rows=parseCsv(csv.replace(/^\uFEFF/,'')),h=rows[0];for(const field of ['Handle','Title',...fields])if(!h?.includes(field))throw Error('Load a fresh Shopify export including '+field+'. Existing SEO must be present so manual wording can be preserved.');if(new Set(h).size!==h.length)throw Error('Duplicate Shopify column names.');const groups=new Map();for(const row of rows.slice(1)){const value=Object.fromEntries(h.map((k,i)=>[k,row[i]||'']));if(!value.Handle)continue;if(!groups.has(value.Handle))groups.set(value.Handle,[]);groups.get(value.Handle).push(value);}const changes=[],held=[],preserved=[];
  for(const [handle,group]of groups){const definitions=group.filter(r=>r.Title);if(!definitions.length){held.push({handle,reason:'Missing product title'});continue;}const r=definitions[0];if(definitions.some(x=>['Title','Body (HTML)',...fields].some(k=>x[k]!==r[k]))){held.push({handle,reason:'Conflicting product/SEO rows'});continue;}const generated=generate({title:r.Title,body:r['Body (HTML)'],tags:r.Tags,publisher:r['Publisher (product.metafields.custom.publisher)'],release:r['Release Date (product.metafields.custom.release_date)'],today:now}),seo={},expected={};for(const field of fields){const current=r[field],fresh=field===fields[0]?generated.title:generated.description;if(current&&!known(handle,field,current)){preserved.push({handle,field,value:current});continue;}if(current!==fresh){const prop=field===fields[0]?'title':'description';if((prop==='title'&&fresh.length>70)||(prop==='description'&&fresh.length>320)){held.push({handle,reason:'Generated '+field+' exceeds Shopify length limit'});continue;}seo[prop]=fresh;expected[prop]=current;}}if(Object.keys(seo).length)changes.push({handle,productTitle:r.Title,releaseDate:r['Release Date (product.metafields.custom.release_date)']||'',sourceDescription:r['Body (HTML)']||'',expected,seo});}
  return {schema:'comicrox-shopify-seo-v1',createdAt:new Date().toISOString(),changes,held,preserved};
 }
 window.ComicRoxSEO={editing,editors,text,caps,source,generate,resolve,enrich,plan,remember,rememberMany,recognised,csvRows,loadLedger};
 // Standard export is synchronous; capture only its own CSV, then append SEO.
 const standard=$('export').onclick;$('export').onclick=async()=>{let file;const originalDl=dl;try{dl=(blob,name)=>{file={blob,name};};standard();}finally{dl=originalDl;}if(!file)return;try{const csv=enrich(await file.blob.text(),records);comicRoxSaveCheckpoint();originalDl(new Blob([csv],{type:'text/csv'}),file.name);$('exportStatus').textContent+=' SEO title and description included.';}catch(e){$('exportStatus').textContent='No file downloaded: '+e.message;}};
 // Optional manual SEO overrides stay on the original record and in its existing backup.
 function editing(container){return !!container?.contains(document.activeElement)&&!!document.activeElement.closest('[data-seo-editor]');}
 function editors(container,items,save){if(!container||editing(container))return;container.querySelectorAll('[data-seo-editor]').forEach(x=>x.remove());items.forEach((r,i)=>{const d=document.createElement('details');d.dataset.seoEditor='1';d.innerHTML='<summary>Search engine wording — automatic unless edited</summary><p>'+esc(r.cleanTitle||r.title||r.rawTitle)+'</p>';for(let j=0;j<2;j++){const label=document.createElement('label');label.textContent=fields[j];const input=document.createElement(j?'textarea':'input');input.value=String(r[props[j]]??'');input.dataset.seoField=props[j];input.placeholder=generate(r)[j?'description':'title'];input.style.width='100%';input.oninput=()=>{r[props[j]]=input.value;save();};label.append(input);d.append(label);}container.append(d);});}
 const originalReviews=renderReviews;renderReviews=function(){if(editing($('reviews')))return;originalReviews();editors($('reviews'),records,comicRoxSaveCheckpoint);};
 const originalWholesale=renderWholesale;renderWholesale=function(){if(editing($('wholesaleRows').closest('section')))return;originalWholesale();editors($('wholesaleRows').closest('section'),wholesaleRecords,persistActiveLunarBatch);};
 // Existing products: export a reviewable plan; the companion helper uses SEO-only GraphQL updates.
 const tab=document.createElement('button');tab.className='tabbtn';tab.dataset.tab='seoPane';tab.textContent='SHOPIFY SEO';document.querySelector('.tabbtn').parentElement.append(tab);const pane=document.createElement('div');pane.className='tabpane';pane.id='seoPane';pane.innerHTML='<section class="panel"><h2>Shopify SEO for existing products</h2><p>Load a fresh Shopify all-products CSV. Blank SEO is filled; recognised tool-generated SEO can refresh. Other existing wording is preserved.</p><label>Shopify export <input id="seoFile" type="file" accept=".csv"></label><p id="seoStatus" role="status"></p><button id="seoPlanDownload" class="btn" disabled>DOWNLOAD SEO UPDATE PLAN</button><button id="seoPreviewDownload" class="btn secondary" disabled>DOWNLOAD REVIEW CSV</button><details><summary>How to apply the update</summary><p>The review CSV is for review only. Run UPDATE-SHOPIFY-SEO.bat in your tool folder and select the downloaded JSON plan. It previews the live changes and asks you to type APPLY. Only SEO fields are submitted to Shopify; changed fields are skipped. No product title, variant, price, stock or description is submitted.</p><p>Keep the tool on the same browser address so it recognises its generated SEO. Back up tracking before changing browsers.</p></details><button id="seoBackup" class="btn secondary">BACK UP SEO TRACKING</button><label>Restore SEO tracking <input id="seoRestore" type="file" accept=".json"></label><div id="seoPreview" style="overflow:auto"></div></section>';document.querySelector('.tabpane').parentElement.append(pane);tab.onclick=()=>{document.body.classList.remove('srSeriesActive');document.querySelectorAll('.tabbtn').forEach(x=>x.classList.toggle('active',x===tab));document.querySelectorAll('.tabpane').forEach(x=>x.classList.toggle('active',x===pane));};let preview;
 $('seoFile').onchange=async()=>{preview=null;$('seoPlanDownload').disabled=true;$('seoPreviewDownload').disabled=true;try{const f=$('seoFile').files[0];if(!f)return;$('seoStatus').textContent='Reading '+f.name+'…';preview=plan(await f.text());$('seoStatus').textContent=preview.changes.length+' products need SEO updates; '+preview.preserved.length+' non-empty fields preserved; '+preview.held.length+' checks need review.';$('seoPreview').innerHTML='<table><thead><tr><th>Product</th><th>SEO title</th><th>SEO description</th></tr></thead><tbody>'+preview.changes.map(x=>'<tr><td>'+esc(x.productTitle)+'</td><td>'+esc(x.seo.title||'Unchanged')+'</td><td>'+esc(x.seo.description||'Unchanged')+'</td></tr>').join('')+'</tbody></table>'+preview.held.map(x=>'<p>'+esc(x.handle+' — '+x.reason)+'</p>').join('');$('seoPlanDownload').disabled=!preview.changes.length;$('seoPreviewDownload').disabled=false;}catch(e){$('seoStatus').textContent=e.message;}};
 $('seoPlanDownload').onclick=()=>{if(!preview)return;try{rememberMany(preview.changes.flatMap(change=>Object.entries(change.seo).map(([prop,value])=>({handle:change.handle,field:prop==='title'?fields[0]:fields[1],value}))));dl(new Blob([JSON.stringify(preview,null,2)],{type:'application/json'}),'ComicRox-Shopify-SEO-Plan.json');}catch(e){$('seoStatus').textContent=e.message;}};
 $('seoPreviewDownload').onclick=()=>{if(preview)dl(new Blob([csvRows([['Handle','Product title (unchanged)','Old SEO title','Proposed SEO title','Old SEO description','Proposed SEO description'],...preview.changes.map(x=>[x.handle,x.productTitle,x.expected.title??'',x.seo.title??'',x.expected.description??'',x.seo.description??''])])],{type:'text/csv'}),'ComicRox-SEO-REVIEW-ONLY.csv');};
 $('seoBackup').onclick=()=>dl(new Blob([JSON.stringify(loadLedger(),null,2)],{type:'application/json'}),'ComicRox-SEO-Tracking.json');$('seoRestore').onchange=async()=>{try{const f=$('seoRestore').files[0],next=JSON.parse(await f.text());if(next.version!==1||!next.products||typeof next.products!=='object')throw Error('Invalid SEO tracking backup');for(const item of Object.values(next.products))for(const values of Object.values(item))if(!Array.isArray(values)||values.some(v=>typeof v!=='string'))throw Error('Invalid SEO tracking values');if(confirm('Replace only SEO generation tracking with this backup?'))localStorage.setItem(KEY,JSON.stringify(next));}catch(e){$('seoStatus').textContent=e.message;}};
})();
