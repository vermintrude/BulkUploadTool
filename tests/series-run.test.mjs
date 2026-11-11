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
async function setup(){const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await page.goto(origin);await page.waitForFunction(()=>!!window.ComicRoxSeriesRunTest);return {page,errors};}
const master=(rows=[])=>[['Handle','Title','Variant SKU','Status'],...rows].map(r=>r.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\n');
async function prepare(page,issues='2, 10'){
 await page.locator('[data-tab="seriesRunPane"]').click();
 await page.locator('#srSeries').fill('Spawn');await page.locator('#srVolume').fill('1');await page.locator('#srPublisher').fill('Image Comics');await page.locator('#srIssues').fill(issues);await page.locator('#srGrade').fill('NM');await page.locator('#srPrice').fill('4.75');await page.locator('#srBuild').click();
}
async function images(page){
 await page.route('https://covers.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="green"/></svg>'}));
 const ids=await page.evaluate(()=>ComicRoxSeriesRunTest.getState().rows.map(r=>r.id));for(const id of ids){const input=page.locator('[data-sr-row="'+id+'"][data-sr-field="imageUrl"]');await input.fill('https://covers.test/'+id+'.jpg');await input.dispatchEvent('change');await page.waitForFunction(id=>ComicRoxSeriesRunTest.getState().rows.find(r=>r.id===id).imageSize>=500,id);await page.locator('[data-sr-row="'+id+'"][data-sr-field="imageConfirmed"]').check();}
}
async function load(page,text=master()) {await page.locator('#srMaster').setInputFiles({name:'products.csv',mimeType:'text/csv',buffer:Buffer.from(text)});await page.waitForFunction(()=>!!ComicRoxSeriesRunTest.getMaster());await page.locator('#srMasterComplete').check();}
test('third workflow parses runs without touching Standard or Lunar; titles use confirmed details and preserve issue identity',async()=>{
 const {page,errors}=await setup();try{
 await page.evaluate(()=>{records=[{title:'Existing Standard draft'}];wholesaleRecords=[{code:'0826DC0001',cleanTitle:'Lunar draft'}];});await prepare(page,'2, 10, 12, 22, 26');
 const s=await page.evaluate(()=>ComicRoxSeriesRunTest.getState());assert.deepEqual(s.rows.map(r=>r.issue),['2','10','12','22','26']);assert(s.rows.every(r=>r.qty==='1'&&r.grade==='NM'&&r.price==='4.75'));assert.match(s.rows[0].title,/Spawn Vol 1 #2 Image Comics NM/);assert.doesNotMatch(s.rows[0].description,/first appearance|rare|1992/i);assert.match(s.rows[0].description,/Stock cover image/);assert.equal(await page.evaluate(()=>records[0].title),'Existing Standard draft');assert.equal(await page.evaluate(()=>wholesaleRecords[0].cleanTitle),'Lunar draft');
 assert.deepEqual(await page.evaluate(()=>ComicRoxSeriesRunTest.parseIssues('1-3, 2, #10; 12.1')),['1','2','3','10','12.1']);assert.deepEqual(await page.evaluate(()=>ComicRoxSeriesRunTest.parseIssues('002, 12.10, 12.1')),['2','12.10','12.1']);await assert.rejects(page.evaluate(()=>ComicRoxSeriesRunTest.parseIssues('10-2')));await assert.rejects(page.evaluate(()=>ComicRoxSeriesRunTest.parseIssues('1-250')));
 await page.locator('[data-sr-row="issue-2"][data-sr-field="year"]').fill('1992');assert.match(await page.locator('[data-sr-row="issue-2"][data-sr-field="title"]').inputValue(),/1992/);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('online cover suggestions require explicit selection and edition confirmation before a clean new-product CSV',async()=>{
 const {page,errors}=await setup();try{
 await prepare(page);
 await page.route('**/api/series-run/covers',route=>route.fulfill({json:{ok:true,candidates:[{title:'Spawn #2 1992 Image',imageUrl:'https://covers.test/2.jpg',sourceUrl:'https://www.ebay.co.uk/itm/123'}]}}));
 await page.locator('[data-sr-search="issue-2"]').click();await page.waitForSelector('[data-sr-cover="issue-2"]');assert.equal((await page.evaluate(()=>ComicRoxSeriesRunTest.getState())).rows[0].imageUrl,'');assert.equal(await page.locator('[data-sr-cover="issue-2"]').count(),1);
 await images(page);await load(page);await page.locator('#srCheck').click();assert.match(await page.locator('#srExportStatus').textContent(),/2 ready/);
 const download=page.waitForEvent('download');await page.locator('#srExport').click();const f=await download;const csv=fs.readFileSync(await f.path(),'utf8');assert.match(csv,/CR-SR-/);assert.match(csv,/Stock cover image/);assert.doesNotMatch(csv,/Please see the supplied photos for a detailed view/);const parsed=await page.evaluate(csv=>parseCsv(csv.replace(/^\uFEFF/,'')),csv);assert.equal(parsed.length,3);const h=parsed[0];assert.equal(parsed[1][h.indexOf('Variant Inventory Qty')],'1');assert.equal(parsed[1][h.indexOf('Variant Price')],'4.75');assert.equal(parsed[1][h.indexOf('Variant Grams')],'120');assert.equal(parsed[1][h.indexOf('Image Src')],'https://covers.test/issue-2.jpg');
 await load(page);const plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert.equal(plan.ready.length,0);assert.equal(plan.held.length,2);assert(plan.held.every(x=>/earlier CSV/.test(x.reason)));assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('existing SKUs, archived titles and handle collisions are protected; missing image/condition/price and long titles hold',async()=>{
 const {page}=await setup();try{
 await prepare(page,'2, 10, 12');const sku=await page.evaluate(()=>ComicRoxSeriesRunTest.skuFor(ComicRoxSeriesRunTest.getState().rows[0]));await load(page,master([['old-spawn','Spawn #2 old',sku,'draft'],['spawn10','Spawn #10 1992','legacy-sku','archived']]));
 let plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert.equal(plan.existing.length,1);assert.equal(plan.held.length,2);assert(plan.held.some(x=>/Possible existing issue/.test(x.reason)));assert(plan.held.some(x=>/public HTTPS images/.test(x.reason)));
 const title=page.locator('[data-sr-row="issue-12"][data-sr-field="title"]');await title.fill('Spawn #12 '+ 'very long title '.repeat(10));await page.locator('[data-sr-row="issue-12"][data-sr-field="grade"]').fill('');await page.locator('[data-sr-row="issue-12"][data-sr-field="price"]').fill('');plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert.match(plan.held.find(x=>x.r.issue==='12').reason,/maximum 80/);assert.match(plan.held.find(x=>x.r.issue==='12').reason,/enter condition/);assert.match(plan.held.find(x=>x.r.issue==='12').reason,/enter a price/);
 }finally{await page.close();}
});
test('own-photo filename grouping, Shopify file upload and multiple CSV image rows stay per issue',async()=>{
 const {page,errors}=await setup();try{
 await prepare(page,'2');await page.locator('[data-sr-row="issue-2"][data-sr-field="imageMode"]').selectOption('own');
 await page.route('**/api/latest?*',route=>route.fulfill({json:[{path:'C:/photos/Spawn-002-1.jpg',name:'Spawn-002-1.jpg'},{path:'C:/photos/Spawn-002-2.jpg',name:'Spawn-002-2.jpg'},{path:'C:/photos/Spawn-012-1.jpg',name:'Spawn-012-1.jpg'}]}));
 await page.route('**/api/photo?*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"/>'}));let paths=[];
 await page.route('**/api/upload-shopify',route=>{paths=route.request().postDataJSON().paths;return route.fulfill({json:{ok:true,message:'uploaded'}});});
 await page.route('**/api/refresh-shopify',route=>route.fulfill({json:[{Alt:'Spawn-002-1.jpg',URL:'https://cdn.test/a.jpg'},{Alt:'Spawn-002-2.jpg',URL:'https://cdn.test/b.jpg'}]}));
 await page.locator('summary').filter({hasText:'My photos — load'}).click();await page.locator('#srLoadPhotos').click();await page.locator('#srMatchNames').click();await page.waitForFunction(()=>ComicRoxSeriesRunTest.getState().rows[0].photos.every(p=>p.imageSize>=500));
 page.once('dialog',d=>d.accept());await page.locator('#srUploadPhotos').click();assert.equal(paths.length,2);assert.equal(await page.locator('[data-sr-row="issue-2"][data-sr-field="imageConfirmed"]').count(),0);await load(page);await page.waitForFunction(()=>ComicRoxSeriesRunTest.getState().rows[0].photos.every(p=>p.imageSize>=500));
 const d=page.waitForEvent('download');await page.locator('#srExport').click();const f=await d;const csv=fs.readFileSync(await f.path(),'utf8');const parsed=await page.evaluate(csv=>parseCsv(csv.replace(/^\uFEFF/,'')),csv);assert.equal(parsed.length,3);assert.equal(parsed[2][19],'https://cdn.test/b.jpg');assert.equal(parsed[2][20],'2');assert.equal(parsed[2][1],'');assert.match(csv,/Photos show the actual copy/);assert.doesNotMatch(csv,/Stock cover image/);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('drafts and pending export history survive reload without weakening the fresh Shopify check',async()=>{
 const {page}=await setup();try{
 await prepare(page,'2');await images(page);await load(page);const d=page.waitForEvent('download');await page.locator('#srExport').click();await d;const before=await page.evaluate(()=>ComicRoxSeriesRunTest.getState());await page.reload();await page.waitForFunction(()=>!!window.ComicRoxSeriesRunTest);const after=await page.evaluate(()=>ComicRoxSeriesRunTest.getState());assert.equal(after.rows[0].title,before.rows[0].title);assert.equal(after.exports[0].csv,before.exports[0].csv);await assert.rejects(page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan()),/fresh Shopify/);
 }finally{await page.close();}
});
test('third tab remains readable on desktop/mobile and changing series requires rebuilding without altering other batches',async()=>{
 const {page,errors}=await setup();try{
 await prepare(page,'2, 10, 12, 22, 26');await page.setViewportSize({width:1440,height:1000});await page.locator('#seriesRunPane .panel').first().screenshot({path:'/workspace/scratch/series-run/setup.png'});await page.locator('.srIssue').first().screenshot({path:'/workspace/scratch/series-run/issue.png'});await page.setViewportSize({width:390,height:844});await page.locator('#seriesRunPane .panel').first().screenshot({path:'/workspace/scratch/series-run/mobile.png'});
 await page.locator('#srSeries').fill('Batman');assert.equal((await page.evaluate(()=>ComicRoxSeriesRunTest.getState())).rows[0].title,'Spawn Vol 1 #2 Image Comics NM');page.once('dialog',d=>d.accept());await page.locator('#srBuild').click();assert.match((await page.evaluate(()=>ComicRoxSeriesRunTest.getState())).rows[0].title,/^Batman Vol 1 #2/);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
async function mockBrowsing(page){
 const uploads=[];
 await page.route('**/api/photos/import',route=>{const data=route.request().postDataJSON();return route.fulfill({json:{ok:true,photo:{path:'C:/photos/Selected_Imports/'+data.name,name:'copy-'+data.name,displayName:data.name,browserSelected:true}}});});
 await page.route('**/api/photo?*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"/>'}));
 await page.route('**/api/upload-shopify',route=>{uploads.push(route.request().postDataJSON().paths);return route.fulfill({json:{ok:true,message:'uploaded'}});});
 await page.route('**/api/refresh-shopify',route=>route.fulfill({json:['a.jpg','b.jpg','c.jpg'].map(name=>({Alt:'copy-'+name,Filename:'copy-'+name,URL:'https://cdn.test/'+name}))}));
 return uploads;
}
const localPhotos=()=>['a.jpg','b.jpg','c.jpg'].map(name=>({name,mimeType:'image/jpeg',buffer:Buffer.from([255,216,255,0])}));
test('laptop browse assigns directly to an issue; reorder/remove controls determine main CSV image and only used photos upload',async()=>{
 const {page,errors}=await setup();try{
 const uploads=await mockBrowsing(page);await prepare(page,'2');await page.locator('[data-sr-row="issue-2"][data-sr-field="imageMode"]').selectOption('own');
 await page.locator('[data-sr-browse-row="issue-2"]').setInputFiles(localPhotos());await page.waitForFunction(()=>ComicRoxSeriesRunTest.getState().rows[0].photos.length===3);assert.equal(uploads.length,0);
 await page.locator('button[data-sr-photo-row="issue-2"][data-sr-photo-index="0"][data-sr-photo-action="right"]').click();await page.locator('button[data-sr-photo-row="issue-2"][data-sr-photo-index="2"][data-sr-photo-action="remove"]').click();
 let photos=await page.evaluate(()=>ComicRoxSeriesRunTest.getState().rows[0].photos);assert.deepEqual(photos.map(p=>p.displayName),['b.jpg','a.jpg']);
 await page.locator('summary').filter({hasText:'Photo upload and link troubleshooting'}).click();page.once('dialog',d=>d.accept());await page.locator('#srUploadUsedPhotos').click();await page.waitForFunction(()=>ComicRoxSeriesRunTest.getState().rows[0].photos.every(p=>p.url&&p.imageSize>=500));assert.deepEqual(uploads[0],['C:/photos/Selected_Imports/b.jpg','C:/photos/Selected_Imports/a.jpg']);
 await page.locator('#srUploadUsedPhotos').click();assert.equal(uploads.length,1);assert.equal(await page.locator('[data-sr-row="issue-2"][data-sr-field="imageConfirmed"]').count(),0);await load(page);
 const d=page.waitForEvent('download');await page.locator('#srExport').click();const f=await d;const parsed=await page.evaluate(csv=>parseCsv(csv.replace(/^\uFEFF/,'')),fs.readFileSync(await f.path(),'utf8'));assert.equal(parsed[1][19],'https://cdn.test/b.jpg');assert.equal(parsed[2][19],'https://cdn.test/a.jpg');assert.equal(parsed[2][20],'2');assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('Standard Batch can browse a directory selection, build before upload and reorder used photos with matching image links',async()=>{
 const {page,errors}=await setup();try{
 const uploads=await mockBrowsing(page);await page.locator('[data-tab="standardPane"]').click();await page.locator('#standardBrowsePhotos').setInputFiles(localPhotos());await page.waitForFunction(()=>photos.length===3);assert.equal(uploads.length,0);
 await page.locator('#bulk').fill('1 NM 5 x3');await page.locator('#build').click();assert.equal(await page.evaluate(()=>records.length),1);assert.deepEqual(await page.evaluate(()=>records[0].photos.map(p=>p.displayName)),['a.jpg','b.jpg','c.jpg']);
 await page.locator('[data-standard-photo-row="0"][data-standard-photo-index="0"][data-standard-photo-action="right"]').click();await page.locator('[data-standard-photo-row="0"][data-standard-photo-index="2"][data-standard-photo-action="remove"]').click();assert.deepEqual(await page.evaluate(()=>records[0].photos.map(p=>p.displayName)),['b.jpg','a.jpg']);
 page.once('dialog',d=>d.accept());await page.locator('#standardUploadUsed').click();await page.waitForFunction(()=>records[0].shops.every(p=>p?.URL));assert.deepEqual(uploads[0],['C:/photos/Selected_Imports/b.jpg','C:/photos/Selected_Imports/a.jpg']);
 await page.locator('[data-standard-photo-row="0"][data-standard-photo-index="1"][data-standard-photo-action="left"]').click();assert.equal(await page.evaluate(()=>records[0].photos[0].displayName),'a.jpg');assert.equal(await page.evaluate(()=>records[0].shops[0].URL),'https://cdn.test/a.jpg');assert.equal(await page.evaluate(()=>records[0].shop.URL),'https://cdn.test/a.jpg');assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('Series / Run can explicitly skip the Shopify CSV without skipping listing validation or pending-file protection',async()=>{
 const {page,errors}=await setup();try{
 await prepare(page,'2');await images(page);
 await assert.rejects(page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan()),/fresh Shopify/);
 await page.locator('#srDuplicateModeSkip').check();assert.equal(await page.locator('#srShopifyCheckInputs').isHidden(),true);await assert.rejects(page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan()),/Confirm these are new/);
 await page.locator('#srSkipCheckConfirm').check();let plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert.equal(plan.catalogueChecked,false);assert.equal(plan.ready.length,1);
 await page.locator('[data-sr-row="issue-2"][data-sr-field="price"]').fill('');plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert.match(plan.held[0].reason,/enter a price/);await page.locator('[data-sr-row="issue-2"][data-sr-field="price"]').fill('4.75');
 const d=page.waitForEvent('download');await page.locator('#srExport').click();await d;assert.equal(await page.locator('#srSkipCheckConfirm').isChecked(),false);assert.equal((await page.evaluate(()=>ComicRoxSeriesRunTest.getState())).exports[0].catalogueChecked,false);assert.match(await page.locator('#srExportStatus').textContent(),/check skipped/);
 await page.locator('#srSkipCheckConfirm').check();plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert.equal(plan.ready.length,0);assert.match(plan.held[0].reason,/earlier CSV/);
 await page.reload();await page.waitForFunction(()=>!!window.ComicRoxSeriesRunTest);assert.equal(await page.locator('#srDuplicateModeChecked').isChecked(),true);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('changing duplicate-check mode resets confirmation; skipping ignores a previously loaded catalogue by owner choice',async()=>{
 const {page}=await setup();try{
 await prepare(page,'2');await images(page);const sku=await page.evaluate(()=>ComicRoxSeriesRunTest.skuFor(ComicRoxSeriesRunTest.getState().rows[0]));await load(page,master([['existing','Spawn #2',sku,'active']]));assert.equal((await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan())).existing.length,1);
 await page.locator('#srDuplicateModeSkip').check();await page.locator('#srSkipCheckConfirm').check();assert.equal((await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan())).ready.length,1);
 await page.locator('[data-sr-row="issue-2"][data-sr-field="variant"]').fill('FCBD');assert.equal(await page.locator('#srSkipCheckConfirm').isChecked(),false);
 await page.locator('#srSkipCheckConfirm').check();await page.locator('#srDuplicateModeChecked').check();await page.locator('#srDuplicateModeSkip').check();assert.equal(await page.locator('#srSkipCheckConfirm').isChecked(),false);
 }finally{await page.close();}
});
test('only online covers require edition confirmation; own-photo rows keep image/link validation without that checkbox',async()=>{
 const {page,errors}=await setup();try{
 await prepare(page,'2');await images(page);await load(page);await page.locator('[data-sr-row="issue-2"][data-sr-field="imageConfirmed"]').uncheck();let plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert.match(plan.held[0].reason,/confirm online cover/);
 await page.locator('[data-sr-row="issue-2"][data-sr-field="imageMode"]').selectOption('own');assert.equal(await page.locator('[data-sr-row="issue-2"][data-sr-field="imageConfirmed"]').count(),0);plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert(plan.held.length===1);assert.doesNotMatch(plan.held[0].reason,/confirm.*edition/);assert.match(plan.held[0].reason,/photo links/);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('Prepare Shopify file uploads only assigned local photos and downloads without separate upload steps',async()=>{
 const {page,errors}=await setup();try{
 const uploads=await mockBrowsing(page);await prepare(page,'2');await page.locator('[data-sr-row="issue-2"][data-sr-field="imageMode"]').selectOption('own');await page.locator('[data-sr-browse-row="issue-2"]').setInputFiles(localPhotos().slice(0,2));await page.waitForFunction(()=>ComicRoxSeriesRunTest.getState().rows[0].photos.length===2);await load(page);
 assert.equal(await page.locator('#srUploadUsedPhotos').isVisible(),false);assert.equal(await page.locator('#srExport').isVisible(),true);page.once('dialog',d=>d.accept());const download=page.waitForEvent('download');await page.locator('#srExport').click();const file=await download;assert.equal(uploads.length,1);assert.match(fs.readFileSync(await file.path(),'utf8'),/https:\/\/cdn.test\/a.jpg/);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('starting a new batch retains pending export protection and previous draft photos across reload',async()=>{
 const {page,errors}=await setup();try{
 await prepare(page,'2');await images(page);await load(page);const download=page.waitForEvent('download');await page.locator('#srExport').click();await download;
 const before=await page.evaluate(()=>ComicRoxSeriesRunTest.getState());page.once('dialog',d=>d.accept());await page.locator('#srNewBatch').click();
 let next=await page.evaluate(()=>ComicRoxSeriesRunTest.getState());assert.equal(next.rows.length,0);assert.equal(next.common.series,'');assert.deepEqual(next.exports,before.exports);assert.equal(await page.locator('#srSeries').inputValue(),'');assert.equal(await page.locator('#srPlan').textContent(),'');
 await page.reload();await page.waitForFunction(()=>!!window.ComicRoxSeriesRunTest);await page.locator('[data-tab="seriesRunPane"]').click();await page.locator('#srPreviousBatch').click();next=await page.evaluate(()=>ComicRoxSeriesRunTest.getState());assert.deepEqual(next.rows,before.rows);assert.deepEqual(next.exports,before.exports);await load(page);const plan=await page.evaluate(()=>ComicRoxSeriesRunTest.exportPlan());assert.equal(plan.ready.length,0);assert.match(plan.held[0].reason,/earlier CSV/);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
