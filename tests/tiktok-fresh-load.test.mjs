import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.COMICROX_TEST_MODULES||'/workspace/comicrox-price-checker',process.cwd()]}));
const root=path.resolve(new URL('..',import.meta.url).pathname);
let browser,server,origin;
before(async()=>{
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{}');return;}const name=url.pathname==='/'?'ComicRox-TikTok.html':url.pathname.slice(1);const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function setup(){const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await page.goto(origin);await page.waitForFunction(()=>!!window.ComicRoxTikTokTest&&!!document.getElementById('beginFreshCatalogue'));return {page,errors};}
const headers=['Handle','Title','Published','Status','Variant Price','Variant Inventory Qty','Variant SKU','Variant Grams','Image Src','Option1 Value','Tags','Release Date (product.metafields.custom.release_date)'];
const row=(handle,title,qty=2,tags='',date='')=>[handle,title,'true','active','4.75',String(qty),handle,'120','https://example.test/'+handle+'.jpg','Default Title',tags,date];
const data=()=>[headers,row('one','Available comic #1'),row('two','Preorder comic #2',3,'Pre-Order'),row('three','Future comic #3',2,'','2030-11-04'),row('zero','Sold comic',0)].map(r=>r.map(v=>'"'+v+'"').join(',')).join('\n');
async function begin(page){const download=page.waitForEvent('download');await page.locator('#reloadBackup').click();await download;await page.locator('#emptyCatalogueConfirmed').check();await page.locator('#beginFreshCatalogue').click();await page.waitForFunction(()=>window.ComicRoxTikTokTest.isFreshCatalogue());}
test('fresh load retains old outcomes, excludes preorders/future dates, and prevents repeat downloads within the new catalogue',async()=>{
 const {page,errors}=await setup();try{
 await page.evaluate(()=>localStorage.setItem('comicrox_tiktok_sync_v1',JSON.stringify({version:1,links:{},skus:{},overrides:{'two|Default Title':{available:true}},profiles:{single:{weight:145,length:33,width:21,height:.5},graded:{},bundle:{}},history:[{id:'old',at:'2026-10-20T00:00:00Z',rows:[{key:'one|Default Title',sku:'one',status:'success'}]}]})));
 await page.reload();await page.waitForFunction(()=>!!window.ComicRoxTikTokTest);
 await page.locator('#beginFreshCatalogue').click();assert.match(await page.locator('#status').textContent(),/backup/);
 await begin(page);await page.locator('#shopFile').setInputFiles({name:'shop.csv',mimeType:'text/csv',buffer:Buffer.from(data())});await page.waitForFunction(()=>document.getElementById('shopStatus').textContent.includes('4 variants'));
 await page.locator('#packingConfirm').check();await page.locator('#run').click();await page.waitForFunction(()=>!!window.ComicRoxTikTokTest.getResult());
 let result=await page.evaluate(()=>window.ComicRoxTikTokTest.getResult());assert.deepEqual(result.add.map(x=>x.s.handle),['one']);assert.equal(result.hold.length,2);assert(result.hold.every(x=>/Excluded from fresh load/.test(x.reason)));
 const download=page.waitForEvent('download');await page.locator('#generate').click();const file=await download;
 const bytes=Array.from(fs.readFileSync(await file.path()));const workbook=await page.evaluate(async bytes=>(await window.ComicRoxTikTokTest.workbook(Uint8Array.from(bytes).buffer)).rows,bytes);const h=workbook[0],rows=workbook.slice(5).filter(r=>r[h.indexOf('product_name')]);assert.equal(rows.length,1);assert.equal(rows[0][h.indexOf('product_name')],'Available comic #1');assert.equal(Number(rows[0][h.indexOf('quantity')]),2);
 const st=await page.evaluate(()=>window.ComicRoxTikTokTest.getState());assert.equal(st.history[0].rows[0].status,'success');assert.equal(st.history.at(-1).catalogueEpoch,st.catalogueEpoch);assert.equal(st.history.at(-1).rows[0].status,'pending');
 assert.equal(await page.evaluate(()=>window.ComicRoxTikTokTest.getResult().add.length),0);
 await page.reload();await page.waitForFunction(()=>!!window.ComicRoxTikTokTest);await begin(page);assert.equal((await page.evaluate(()=>window.ComicRoxTikTokTest.getState())).catalogueEpoch,st.catalogueEpoch);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('normal comparison still blocks previously generated rows for the current catalogue',async()=>{
 const {page}=await setup();try{
 const result=await page.evaluate(text=>{const t=window.ComicRoxTikTokTest,shop=t.shopRows(text),state=t.getState();state.history=[{id:'old',rows:[{key:'one|Default Title',sku:'one',status:'success'}]}];return t.compare(shop,[],state).prior.size;},data());assert.equal(result,1);
 }finally{await page.close();}
});
test('current owner CSV and create template generate only available non-preorder products (private fixtures)',{skip:!process.env.COMICROX_PRIVATE_SHOPIFY||!process.env.COMICROX_PRIVATE_TIKTOK_TEMPLATE},async()=>{
 const {page,errors}=await setup();try{
 await begin(page);
 await page.locator('#shopFile').setInputFiles(process.env.COMICROX_PRIVATE_SHOPIFY);await page.waitForFunction(()=>document.getElementById('shopStatus').textContent.includes('variants'));
 await page.locator('#createTemplate').setInputFiles(process.env.COMICROX_PRIVATE_TIKTOK_TEMPLATE);await page.waitForFunction(()=>document.getElementById('templateStatus').textContent.includes('selected.'));
 await page.locator('#packingConfirm').check();await page.locator('#run').click();await page.waitForFunction(()=>!!window.ComicRoxTikTokTest.getResult());
 const counts=await page.evaluate(()=>{const r=window.ComicRoxTikTokTest.getResult();return {ready:r.add.length,held:r.hold.length,preorders:r.hold.filter(x=>x.reason.includes('Excluded from fresh load')).length,allSafe:r.add.every(x=>x.s.eligible&&!x.s.futureRelease&&!/pre[ -]?order/i.test(x.s.title+' '+x.s.tags))};});assert(counts.ready>0);assert(counts.allSafe);console.log('Owner fixture counts:',JSON.stringify(counts));
 const download=page.waitForEvent('download');await page.locator('#generate').click();const file=await download;const bytes=Array.from(fs.readFileSync(await file.path()));
 const check=await page.evaluate(async bytes=>{const w=await window.ComicRoxTikTokTest.workbook(Uint8Array.from(bytes).buffer),h=w.rows[0],rows=w.rows.slice(5).filter(r=>r[h.indexOf('product_name')]);return {count:rows.length,allStock:rows.every(r=>Number(r[h.indexOf('quantity')])>0),uniqueSkus:new Set(rows.map(r=>r[h.indexOf('seller_sku')])).size,create:w.rows[1][1]};},bytes);
 assert.equal(check.count,counts.ready);assert(check.allStock);assert.equal(check.uniqueSkus,counts.ready);assert.equal(check.create,'create_product');assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
