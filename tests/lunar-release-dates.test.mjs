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
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{}');return;}const name=url.pathname==='/'?'ComicRox-Listing-Tool.html':url.pathname.slice(1);const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function setup(){const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await page.goto(origin);await page.waitForFunction(()=>typeof lunarInvoiceRows==='function'&&document.getElementById('lunarFile'));return {page,errors};}
const code='0526DE0754';
const snapshot=(extra=[])=>[
 ['Handle','Title','Body (HTML)','Tags','Variant SKU','Variant Inventory Qty','Variant Price','Status','Release Date (product.metafields.custom.release_date)'],
 ['comic-lilo','Lilo & Stitch 626 #3 Cover A','<p>Owner description &amp; details.</p><p>Release Date: 28 October 2026</p>','Custom Tag, New Release','CR-LUNAR-'+code,'5','4.75','active','2026-10-28'],...extra
].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
const source=(date='2026-11-11')=>[[code,[{date,source:'Fresh Lunar dates',observedAt:'2026-10-28T10:00:00Z'}]]];
async function build(page,text=snapshot(),sources=source()) {return page.evaluate(({text,sources})=>lunarBuildDateUpdates(text,new Map(sources),'2026-10-28'),{text,sources});}
test('delayed live product becomes a preorder using its exact existing handle and owner copy',async()=>{
 const {page,errors}=await setup();try{
 const plan=await build(page);assert.equal(plan.updates.length,1);assert.equal(plan.held.length,0);const r=plan.updates[0];assert.equal(r.handle,'comic-lilo');assert.equal(r.date,'2026-11-11');assert.match(r.title,/ — PRE-ORDER$/);assert.equal(r.tags,'Custom Tag, Pre-Order');assert.match(r.body,/Owner description &amp; details/);assert.match(r.body,/OFFICIAL RELEASE DATE: 11 November 2026\. This item will not be dispatched/);assert.match(r.body,/<p>Release Date: 11 November 2026<\/p>/);
 const csv=await page.evaluate(p=>lunarDateCSV(p),plan);assert.deepEqual(csv.replace(/^\uFEFF/,'').split('\r\n')[0].split(',').map(s=>s.replaceAll('"','')),['Handle','Title','Body (HTML)','Tags','Release Date (product.metafields.custom.release_date)']);assert.doesNotMatch(csv,/Variant Inventory|Variant Price|Status|Published|Variant SKU/);
 const reapplied=await page.evaluate(({r})=>{const h=['Handle','Title','Body (HTML)','Tags','Variant SKU','Release Date (product.metafields.custom.release_date)'];const text=[h,[r.handle,r.title,r.body,r.tags,'CR-LUNAR-0526DE0754',r.date]].map(row=>row.map(q).join(',')).join('\n');return lunarBuildDateUpdates(text,new Map([['0526DE0754',[{date:r.date,source:'Lunar'}]]]),'2026-10-28');},{r});assert.equal(reapplied.updates.length,0);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('ambiguous SKU, missing dates and conflicting dates are held; non-matches are never created',async()=>{
 const {page}=await setup();try{
 assert.equal((await build(page,snapshot([['other','Other comic','','','CR-LUNAR-'+code,'1','3','draft','2026-10-28']]))).held.length,1);
 assert.equal((await build(page,snapshot().replaceAll('2026-10-28',''))).held.length,1);
 const conflicting=[[code,[{date:'2026-11-04',source:'Old batch'},{date:'2026-11-11',source:'Other batch'}]]];assert.equal((await build(page,snapshot(),conflicting)).updates.length,0);assert.equal((await build(page,snapshot(),conflicting)).held.length,1);
 assert.equal((await build(page,snapshot().replace('CR-LUNAR-'+code,'OTHER-SKU'))).updates.length,0);
 const staleCache=[[code,[{date:'2026-10-28',source:'Old cache',observedAt:'2026-10-20T00:00:00Z'},{date:'2026-11-11',source:'Undated legacy prep'}]]];assert.equal((await build(page,snapshot(),staleCache)).updates.length,0);
 }finally{await page.close();}
});
test('past date corrections preserve release tags and do not automatically release products',async()=>{
 const {page}=await setup();try{const plan=await build(page,snapshot(),source('2026-10-21'));assert.equal(plan.updates.length,1);assert.equal(plan.updates[0].tags,'Custom Tag, New Release');assert.equal(plan.updates[0].title,'Lilo & Stitch 626 #3 Cover A');assert.doesNotMatch(plan.updates[0].body,/PRE-ORDER/);}finally{await page.close();}
});
test('fresh Lunar date imports synchronise every saved occurrence, retain quantities and reviewed copy',async()=>{
 const {page,errors}=await setup();try{
 const result=await page.evaluate(()=>{
 const record={code:'0526DE0754',release:'2026-10-28',qty:'5',cleanTitle:'Owner title',comicRoxDescription:'Owner copy',sellPrice:'4.75'};
 saveLunarBatches([{id:'a',weekKey:'2026-10-26',records:[{...record}]},{id:'b',weekKey:'2026-11-02',records:[{...record,qty:'2'}]}]);
 activeLunarBatchId='a';wholesaleRecords=[{...record}];
 pImportPlannerDates('Lunar-Dates.csv','Code,InStoreDate\n0526DE0754,11/11/2026');
 return {batches:loadLunarBatches(),active:wholesaleRecords,plan:[...lunarDateSources()]};
 });
 for(const b of result.batches){assert.equal(b.records[0].release,'2026-11-11');assert.equal(b.records[0].cleanTitle,'Owner title');assert.equal(b.records[0].comicRoxDescription,'Owner copy');assert.equal(b.records[0].sellPrice,'4.75');}
 assert.deepEqual(result.batches.map(b=>b.records[0].qty),['5','2']);assert.equal(result.active[0].release,'2026-11-11');assert.equal((await build(page,snapshot(),result.plan)).updates.length,1);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('download requires fresh complete Shopify snapshot and rechecks changed dates after preview',async()=>{
 const {page,errors}=await setup();try{
 await page.evaluate(()=>{saveLunarBatches([{id:'a',weekKey:'2026-11-09',records:[{code:'0526DE0754',release:'2026-11-11'}]}]);lunarPreviewDateUpdates();});assert.match(await page.locator('#lunarDateResults').textContent(),/Confirm/);
 await page.evaluate(text=>{lunarSaveMaster(text,'all.csv');$('lunarMasterComplete').checked=true;lunarPreviewDateUpdates();},snapshot());assert.equal(await page.locator('#lunarDateDownload').isDisabled(),false);
 await page.evaluate(()=>{saveLunarBatches([{id:'a',weekKey:'2026-11-09',records:[{code:'0526DE0754',release:'2026-11-18'}]}]);$('lunarDateDownload').click();});assert.match(await page.locator('#lunarDateResults').textContent(),/changed/);
 await page.evaluate(()=>lunarPreviewDateUpdates());const downloaded=page.waitForEvent('download');await page.evaluate(()=>$('lunarDateDownload').click());const file=await downloaded;const csv=fs.readFileSync(await file.path(),'utf8');assert.match(csv,/2026-11-18/);assert.doesNotMatch(csv,/Variant Inventory/);assert.match(await page.locator('#lunarDateResults').textContent(),/NOT changed yet/);assert.equal(await page.evaluate(()=>lunarMaster),null);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('Product Data refresh updates saved batches and planner date evidence without changing ordered quantity',async()=>{
 const {page,errors}=await setup();try{
 const result=await page.evaluate(()=>{
 const record=plannerToWholesaleRecord({code:'0526DE0754',title:'Lilo & Stitch #3',qty:5,rrp:'4.99',unit:'2.495',instore:pParseDate('2026-10-28')});
 saveLunarBatches([{id:'a',weekKey:'2026-10-26',records:[record]},{id:'b',weekKey:'2026-11-02',records:[{...record,qty:'2'}]}]);activeLunarBatchId='a';wholesaleRecords=[{...record}];
 applyLunarProductDataText('Code,Title,ImageUrl,InStoreDate\n0526DE0754,Lilo & Stitch #3,https://example.test/cover.jpg,11/11/2026','Lunar_Product_Data.csv');
 return {batches:loadLunarBatches(),cache:pReadDateCache(),sources:[...lunarDateSources()]};
 });
 assert.equal(result.cache[code].iso,'2026-11-11');assert(result.batches.every(b=>b.records[0].release==='2026-11-11'));assert.deepEqual(result.batches.map(b=>String(b.records[0].qty)),['5','2']);assert.equal((await build(page,snapshot(),result.sources)).updates.length,1);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
