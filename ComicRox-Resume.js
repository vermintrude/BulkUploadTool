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
 const original=renderReviews;renderReviews=function(){const value=original();comicRoxSaveCheckpoint();comicRoxUpdateResumeButton();return value;};
 $('reviews').addEventListener('input',()=>queueMicrotask(comicRoxSaveCheckpoint));
 $('comicRoxDownloadRecovery').onclick=()=>{if(!records.length){$('comicRoxRecoveryStatus').textContent='No current review to back up.';return;}dl(new Blob([JSON.stringify({version:1,savedAt:new Date().toISOString(),records},null,2)],{type:'application/json'}),'ComicRox-AI-Recovery.json');};
 $('comicRoxRestoreRecovery').onclick=()=>{try{const text=localStorage.getItem(comicRoxRecoveryKey);if(!text)throw Error('No saved review checkpoint in this browser.');comicRoxRestore(JSON.parse(text));}catch(e){$('comicRoxRecoveryStatus').textContent=e.message;}};
 $('comicRoxImportRecovery').onchange=async e=>{try{if(e.target.files[0])comicRoxRestore(JSON.parse(await e.target.files[0].text()));}catch(err){$('comicRoxRecoveryStatus').textContent=err.message;}finally{e.target.value='';}};
 let hasCheckpoint=false;try{hasCheckpoint=!!localStorage.getItem(comicRoxRecoveryKey);}catch{}
 if(hasCheckpoint)$('comicRoxRecoveryStatus').textContent='A saved review checkpoint is available. Restore it only if it is the batch you intend to continue.';
})();
