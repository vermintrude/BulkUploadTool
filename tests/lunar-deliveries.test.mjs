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
const code='0726DE0694';
const shipment=(id='905695',qty=4,date='11/4/2026',extras=[])=>[id,'10/23/2026 9:01:27 PM','28929','','Code,Title,Qty,Retail,Discount,Discounted Price,Total,UPC,PO Number,In-Store Date,Item Category,Country of Origin',[code,'ALADDIN #4 CVR A',qty,'4.99','50','2.4950','9.9800','72513036400504011','',date,'1','CA'].join(','),...extras].join('\r\n');
const adjustment=qty=>['0826IM0308','GI JOE TOMB RAIDER',qty,'5.99','55','2.6955','2.6955','70985304886200131','','10/7/2026','1','CA'].join(',');
async function importShipment(page,text=shipment(),name='Shipment_905695.csv'){return page.evaluate(({text,name})=>lunarImportShipment(text,name),{text,name});}
test('shipment import never implies receipt; repeat import preserves checks; amendment is blocked',async()=>{
 const {page,errors}=await setup();try{
 const result=await importShipment(page);assert.equal(result.shipment.receipt,null);assert.equal(result.shipment.items[0].qty,4);
 await page.evaluate(()=>lunarSaveReceipt('905695',lunarDateToday(),{'0726DE0694':{good:3,damaged:1}},'One damaged'));
 assert.equal((await importShipment(page)).reopened,true);assert.equal((await importShipment(page)).shipment.receipt.counts[code].good,3);
 const before=await page.evaluate(()=>localStorage.getItem(lunarWorkflowKey));await assert.rejects(importShipment(page,shipment('905695',5)),/different contents/);assert.equal(await page.evaluate(()=>localStorage.getItem(lunarWorkflowKey)),before);
 assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('opposite adjustment lines cancel; duplicates, wrong file, conflicts and invalid quantities fail atomically',async()=>{
 const {page}=await setup();try{
 const result=await importShipment(page,shipment('905695',4,'11/4/2026',[adjustment(1),adjustment(-1)]));assert.equal(result.shipment.items.length,1);assert.equal(result.shipment.adjustments[0].qty,0);assert.equal(result.shipment.lines.length,3);
 for(const [text,name]of [[shipment(),'Invoice_905695.csv'],[shipment('111111'),'Shipment_222222.csv'],[shipment('111111',1.5),'Shipment_111111.csv'],[shipment('111111',4,'invalid'),'Shipment_111111.csv'],[shipment('111111',4,'11/4/2026',[shipment().split('\r\n').at(-1)]),'Shipment_111111.csv']])await assert.rejects(importShipment(page,text,name));
 assert.equal(await page.evaluate(()=>Object.keys(lunarReadState().shipments).length),1);
 }finally{await page.close();}
});
test('receipt counts replace rather than add; shortages/damage are held and edits invalidate listing checks',async()=>{
 const {page}=await setup();try{
 await importShipment(page,shipment('905695',4,'10/28/2026'));
 await page.evaluate(()=>lunarSaveReceipt('905695',lunarDateToday(),{'0726DE0694':{good:2,damaged:1}},''));
 const row=await page.evaluate(()=>lunarDeliveryRows()[0]);assert.equal(row.good,2);assert.equal(row.missing,1);assert.equal(row.damaged,1);assert.equal(row.status,'ready');
 await page.evaluate(()=>lunarCompleteDelivery('905695','0726DE0694'));assert.equal(await page.evaluate(()=>lunarDeliveryRows()[0].status),'done');
 await page.evaluate(()=>lunarSaveReceipt('905695',lunarDateToday(),{'0726DE0694':{good:3,damaged:1}},''));assert.equal(await page.evaluate(()=>lunarDeliveryRows()[0].status),'ready');assert.equal(await page.evaluate(()=>lunarReadState().shipments['905695'].receiptHistory.length),1);
 await assert.rejects(page.evaluate(()=>lunarSaveReceipt('905695',lunarDateToday(),{'0726DE0694':{good:5,damaged:0}},'')),/exceed/);
 await assert.rejects(page.evaluate(()=>lunarSaveReceipt('905695','2099-01-01',{'0726DE0694':{good:0,damaged:0}},'')),/no later/);
 }finally{await page.close();}
});
test('future dates and revised delays cannot be marked listed; weekly totals distinguish plans from receipts',async()=>{
 const {page}=await setup();try{
 await importShipment(page,shipment('905695',4,'12/30/2026'));
 await page.evaluate(()=>lunarSaveReceipt('905695',lunarDateToday(),{'0726DE0694':{good:4,damaged:0}},''));assert.equal(await page.evaluate(()=>lunarDeliveryRows()[0].status),'waiting_date');await assert.rejects(page.evaluate(()=>lunarCompleteDelivery('905695','0726DE0694')),/Only received/);
 const week=await page.evaluate(()=>lunarWeeklyRows('2026-12-28'));assert.equal(week[0].shipped,4);assert.equal(week[0].good,4);assert.equal(week[0].ordered,null);assert.equal(week[0].billed,null);
 const same=await importShipment(page,shipment('905695',4,'12/30/2026'));assert.equal(same.reopened,true);
 }finally{await page.close();}
});
test('shipping and credit-only invoices are archived, not turned into merchandise or received stock',async()=>{
 const {page,errors}=await setup();try{
 const text='Lunar Distribution Invoice\nInvoice #965400\nInvoice Date: 10/27/2026\nCode,Title,Qty,Retail,Discount,Discounted Price,Total,UPC,PO Number,In-Store Date,Item Category,Country of Origin\n'+adjustment(-1)+'\nShipping Charges\nShipment,Tracking,Date,Weight,,,Cost\nFedEx,879301009589,10/23/2026,18.60 lbs,,,64.28\n,,,,,Pay this amount:,$61.58';
 await page.locator('#lunarFile').setInputFiles({name:'Invoice_965400.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
 await page.waitForFunction(()=>lunarReadState().billingDocuments?.['965400']);assert.match(await page.locator('#lunarInvoiceMessage').textContent(),/shipping \/ credit only/);assert.equal(await page.evaluate(()=>loadLunarBatches().length),0);assert.equal(await page.evaluate(()=>lunarDeliveryRows().length),0);
 await page.locator('#lunarFile').setInputFiles({name:'Invoice_965400.csv',mimeType:'text/csv',buffer:Buffer.from(text)});assert.equal(await page.evaluate(()=>Object.keys(lunarReadState().billingDocuments).length),1);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('simple navigation and parcel UI require a physical count; saved delivery is included in backup and survives reload',async()=>{
 const {page,errors}=await setup();try{
 assert.equal(await page.locator('[data-lunar-page="overview"]').evaluate(e=>e.classList.contains('active')),true);
 await page.evaluate(()=>{document.querySelector('[data-tab="wholesalePane"]').click();showLunarPage('deliveries');});
 await page.locator('#lunarShipmentFile').setInputFiles({name:'Shipment_905695.csv',mimeType:'text/csv',buffer:Buffer.from(shipment())});await page.waitForSelector('#lunarSaveReceipt');
 await page.locator('#lunarSaveReceipt').click();assert.match(await page.locator('#lunarShipmentMessage').textContent(),/tick/);
 await page.locator('#lunarReceiptConfirmed').check();await page.locator('#lunarSaveReceipt').click();assert.match(await page.locator('#lunarShipmentMessage').textContent(),/every book/);
 await page.locator('[data-receipt-good]').fill('4');await page.locator('#lunarSaveReceipt').click();assert.match(await page.locator('#lunarShipmentMessage').textContent(),/saved/);
 const download=page.waitForEvent('download');await page.evaluate(()=>$('lunarBackup').click());const file=await download;const backup=JSON.parse(fs.readFileSync(await file.path(),'utf8'));const state=JSON.parse(backup.values.comicrox_lunar_workflow_v2);assert.equal(state.shipments['905695'].receipt.counts[code].good,4);
 await page.reload();await page.waitForFunction(()=>typeof lunarDeliveryRows==='function');assert.equal(await page.evaluate(()=>lunarDeliveryRows()[0].good),4);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('invalid delivery backup is rejected before it can overwrite existing state',async()=>{
 const {page,errors}=await setup();try{
 await importShipment(page);const before=await page.evaluate(()=>localStorage.getItem(lunarWorkflowKey));const bad=JSON.parse(before);bad.shipments['905695'].items[0].qty=-4;
 const backup={schema:1,values:{comicrox_lunar_workflow_v2:JSON.stringify(bad)}};
 const dialog=page.waitForEvent('dialog');const upload=page.locator('#lunarRestore').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});const prompt=await dialog;assert.match(prompt.message(),/Invalid saved shipment product/);await prompt.dismiss();await upload;assert.equal(await page.evaluate(()=>localStorage.getItem(lunarWorkflowKey)),before);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('weekly navigation retains expected order weeks and invoice/dispatch/receipt quantities independently',async()=>{
 const {page}=await setup();try{
 await page.evaluate(()=>{
 localStorage.setItem(PLANNER_ORDERS_KEY,JSON.stringify({version:3,orders:{'2119001':{items:[{code:'0726DE0694',title:'Aladdin #4',qty:4,instore:'2026-11-04'},{code:'0526DE0754',title:'Lilo & Stitch #3',qty:5,instore:'2026-11-11'}]}}}));
 saveLunarBatches([{id:'invoice-a',invoiceId:'964440',weekKey:'2026-11-02',records:[{code:'0726DE0694',rawTitle:'Aladdin #4',release:'2026-11-04',invoiceQty:4,qty:4}]}]);
 });
 await importShipment(page);const rows=await page.evaluate(()=>lunarWeeklyRows('2026-11-02'));assert.equal(rows[0].ordered,4);assert.equal(rows[0].billed,4);assert.equal(rows[0].shipped,4);assert.equal(rows[0].good,0);
 assert.match(await page.evaluate(()=>lunarShipmentInvoiceSummary(lunarReadState().shipments['905695'])),/match merchandise invoice 964440/);
 assert.equal((await page.evaluate(()=>lunarWeeklyRows('2026-11-09')))[0].ordered,5);
 await page.evaluate(()=>{showLunarPage('overview');$('lunarWeekChoice').value='2026-11-02';lunarRenderDashboard();$('lunarNextWeek').click();});assert.equal(await page.locator('#lunarWeekChoice').inputValue(),'2026-11-09');assert.match(await page.locator('#lunarWeeklyList').textContent(),/Lilo/);
 const download=page.waitForEvent('download');await page.evaluate(()=>$('lunarDownloadWeek').click());const file=await download;assert.match(fs.readFileSync(await file.path(),'utf8'),/Lilo/);
 }finally{await page.close();}
});
test('fresh supplier delays survive importing an older invoice while billed date audit stays original',async()=>{
 const {page}=await setup();try{
 const result=await page.evaluate(()=>lunarInvoiceReleaseFields({release:'2026-11-04'},{release:'2026-11-11',releaseDateObservedAt:'2026-10-28T15:00:00Z'},'2026-10-23'));
 assert.equal(result.release,'2026-11-11');assert.equal(result.releaseDateObservedAt,'2026-10-28T15:00:00Z');
 }finally{await page.close();}
});
