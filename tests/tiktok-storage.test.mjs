import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(require.resolve('playwright',{paths:['/workspace/comicrox-price-checker']}));
const root=path.resolve(new URL('..',import.meta.url).pathname);
async function setup(block=false){
 const server=http.createServer((req,res)=>{const file=path.join(root,req.url.split('?')[0]);if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),page=await browser.newPage();
 await page.addInitScript(block=>{
  if(!localStorage.getItem('comicrox_tiktok_sync_v1'))localStorage.setItem('comicrox_tiktok_sync_v1',JSON.stringify({version:1,links:{tt:'book|'},skus:{'book|':'SKU1'},overrides:{},profiles:{single:{weight:145,length:33,width:21,height:.5}},history:[{id:'saved-file',at:'2026-11-10',rows:[{key:'book|',sku:'SKU1',status:'pending'},{key:'old|',sku:'SKU2',status:'success'},{key:'released|',sku:'SKU3',status:'released'}],file:btoa('old workbook bytes '.repeat(10000))}]}));
  localStorage.setItem('lunar-sentinel','keep Lunar work');const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='comicrox_tiktok_sync_v1'&&v.length>2000)throw new DOMException('Simulated full settings store','QuotaExceededError');return original.call(this,k,v);};
  if(block)indexedDB.open=()=>{throw Error('Simulated workbook store failure');};
 },block);
 await page.goto('http://127.0.0.1:'+server.address().port+'/ComicRox-TikTok.html');
 return {page,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
test('storage migration frees settings space, preserves audit and mappings, redownloads after reload and produces portable backups',async()=>{
 const {page,close}=await setup();try{
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('comicrox_tiktok_sync_v1')));
 await page.locator('#compactTikTokStorage').click();await page.waitForFunction(()=>document.querySelector('#tikTokStorageStatus').textContent.includes('updated'));
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('comicrox_tiktok_sync_v1')));assert.equal(after.history[0].file,undefined);assert.match(after.history[0].fileRef,/^[a-f0-9]{64}$/);assert.deepEqual(after.history[0].rows,before.history[0].rows);assert.deepEqual(after.skus,before.skus);assert.deepEqual(after.links,before.links);assert.equal(await page.evaluate(()=>localStorage.getItem('lunar-sentinel')),'keep Lunar work');
 await page.reload();let downloading=page.waitForEvent('download');await page.locator('[data-redownload="saved-file"]').click();let file=await downloading;assert.equal(fs.readFileSync(await file.path(),'utf8'),'old workbook bytes '.repeat(10000));
 downloading=page.waitForEvent('download');await page.locator('#backup').click();file=await downloading;const backup=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.equal(backup.history[0].file,before.history[0].file);assert.equal(backup.history[0].fileRef,undefined);
 }finally{await close();}
});
test('failed workbook migration leaves original data intact and reports error beside download action',async()=>{
 const {page,close}=await setup(true);try{const before=await page.evaluate(()=>localStorage.getItem('comicrox_tiktok_sync_v1'));await page.locator('#compactTikTokStorage').click();await page.waitForFunction(()=>document.querySelector('#outputStatus').textContent.includes('Simulated workbook store failure'));assert.equal(await page.evaluate(()=>localStorage.getItem('comicrox_tiktok_sync_v1')),before);}finally{await close();}
});
