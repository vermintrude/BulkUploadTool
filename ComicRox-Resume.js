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
