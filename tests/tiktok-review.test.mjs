import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:['/workspace/comicrox-price-checker']}));
const root=path.resolve(new URL('..',import.meta.url).pathname);
test('identity review retains dropdown, shows both identities, and saves only a confirmed candidate',async()=>{
 const server=http.createServer((req,res)=>{const p=path.join(root,req.url.split('?')[0]);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/ComicRox-TikTok.html');
 const headers=['Handle','Title','Published','Status','Variant Price','Variant Inventory Qty','Variant SKU','Variant Grams','Image Src','Option1 Value'];
 const rows=[['stand-a','Comic Stands Made to Order','TRUE','active','8','1','reused','100','https://example.com/a.jpg','Multi'],['stand-b','Comic Stands Made to Order','FALSE','archived','12','0','reused','100','https://example.com/b.jpg','Multi']];
 await page.locator('#shopFile').setInputFiles({name:'shop.csv',mimeType:'text/csv',buffer:Buffer.from([headers,...rows].map(r=>r.map(s=>'"'+s+'"').join(',')).join('\n'))});
 await page.waitForFunction(()=>document.querySelector('#shopStatus').textContent.includes('2 variants'));
 const bytes=await page.evaluate(async()=>{const z=new JSZip(),n='http://schemas.openxmlformats.org/spreadsheetml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';z.file('xl/workbook.xml',`<workbook xmlns="${n}" xmlns:r="${r}"><sheets><sheet name="Template" sheetId="1" r:id="rId1"/></sheets></workbook>`);z.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');const rows=[['product_id','product_name','seller_sku','quantity','price','sku_id'],[],[],[],[],['123456789','Comic Stands (Made to Order) Now available','reused','1','8','987654321']];z.file('xl/worksheets/sheet1.xml',`<worksheet xmlns="${n}"><sheetData>`+rows.map((row,i)=>`<row r="${i+1}">`+row.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>');return Array.from(await z.generateAsync({type:'uint8array'}));});
 await page.locator('#ttFiles').setInputFiles({name:'tiktok.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)});
 await page.waitForFunction(()=>document.querySelector('#sources').textContent.includes('1 rows'));
 await page.locator('#run').click();await page.waitForFunction(()=>window.ComicRoxTikTokTest.getResult()?.review.length===1);
 await page.locator('#view').selectOption('review');const select=page.locator('[data-link="0"]'),button=page.locator('[data-confirm="0"]');assert(await button.isDisabled());
 await select.evaluate(el=>{window.originalReviewSelect=el;el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});await page.waitForTimeout(100);
 assert(await select.evaluate(el=>el===window.originalReviewSelect),'Click must not replace the dropdown');
 await select.selectOption('stand-b|Multi');assert.equal(await select.inputValue(),'stand-b|Multi');assert(await button.isEnabled());
 const details=await page.locator('[data-comparison="0"]').textContent();assert(details.includes('TikTok:'));assert(details.includes('Shopify:'));assert(details.includes('stand-b'));assert(details.includes('archived'));assert(details.includes('Stock: 0'));
 await select.selectOption('');assert(await button.isDisabled());await select.selectOption('stand-a|Multi');
 page.once('dialog',d=>d.dismiss());await button.click();await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.ComicRoxTikTokTest.getState().links),{});
 await page.locator('[data-link="0"]').selectOption('stand-a|Multi');let message='';page.once('dialog',d=>{message=d.message();return d.accept();});await page.locator('[data-confirm="0"]').click();
 await page.waitForFunction(()=>window.ComicRoxTikTokTest.getState().links['123456789|987654321']==='stand-a|Multi');assert(message.includes('TikTok:'));assert(message.includes('Shopify:'));assert(message.includes('stand-a'));
 assert.equal(await page.evaluate(()=>window.ComicRoxTikTokTest.getResult().review.length),0);
 await page.reload();assert.equal(await page.evaluate(()=>window.ComicRoxTikTokTest.getState().links['123456789|987654321']),'stand-a|Multi');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('zero and negative Shopify stock cannot become TikTok additions, including confirmed sold matches',async()=>{
 const server=http.createServer((req,res)=>{const p=path.join(root,req.url.split('?')[0]);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/ComicRox-TikTok.html');
 const checks=await page.evaluate(()=>{
  const api=window.ComicRoxTikTokTest,h=['Handle','Title','Published','Status','Variant Price','Variant Inventory Qty','Variant SKU','Variant Grams','Image Src'];
  const data=[['available','Available comic','true','active',5,2,'a',100,'https://example.com/a.jpg'],['sold','Sold comic','true','active',5,0,'b',100,'https://example.com/b.jpg'],['negative','Negative stock','true','active',5,-1,'c',100,'https://example.com/c.jpg'],['archived','Archived comic','true','archived',5,1,'d',100,'https://example.com/d.jpg'],['unpublished','Unpublished comic','false','active',5,1,'e',100,'https://example.com/e.jpg']];
  const ss=api.shopRows([h,...data].map(r=>r.join(',')).join('\n')),state=api.getState();
  const additions=api.stage(api.compare(ss,[],state)).add.map(x=>x.s.handle);
  const t={product_id:'123',sku_id:'456',product_name:'Sold comic',quantity:'1',price:'5',seller_sku:'b',sourceStatus:'Live'};
  const existing=api.stage(api.compare(ss,[t],state));
  const altered={...t,product_name:'Renamed sold listing'};state.links['123|456']='sold|';
  const confirmed=api.stage(api.compare(ss,[altered],state));
  const direct=[0,-1,2].map(qty=>{const p={id:'p',handle:'selected',title:'Selected comic',status:'ACTIVE',onlineStoreUrl:'https://example.com/product',images:{nodes:[{url:'https://example.com/image.jpg'}]},variants:{nodes:[{id:'v',price:'5',inventoryQuantity:qty,selectedOptions:[{value:'Default Title'}]}]}};const rows=api.directRows(p);return {qty,eligible:rows[0].eligible,added:api.stage({proposed:rows,prior:new Map()}).add.length};});
  return {additions,removed:existing.removed.map(x=>({handle:x.s.handle,reason:x.reason})),confirmedRemoved:confirmed.removed.map(x=>x.s.handle),direct};
 });
 assert.deepEqual(checks.additions,['available']);assert.equal(checks.removed[0].handle,'sold');assert.match(checks.removed[0].reason,/zero or negative/);assert.deepEqual(checks.confirmedRemoved,['sold']);assert.deepEqual(checks.direct.map(x=>[x.qty,x.eligible,x.added]),[[0,false,0],[-1,false,0],[2,true,1]]);
 const matching=await page.evaluate(()=>{
 const a=window.ComicRoxTikTokTest,state=a.getState(),base={title:'Harley Quinn Scientist CGC 9.9 Artist Alley',key:'a|',handle:'a',sku:'',qty:0,price:150,eligible:false,status:'archived',published:'false'};
 const t={product_id:'100',sku_id:'200',product_name:base.title,price:'150',quantity:'0',seller_sku:''};
 const b={...base,key:'b|',handle:'b',qty:1},wrong={...base,key:'wrong|',handle:'wrong',title:'Harley Quinn #53 CGC 9.8 Artist Alley',qty:1,eligible:true,status:'active',published:'true'};
 const grouped=a.compare([base,b,wrong],[t],state),mixed=a.compare([base,{...b,eligible:true,status:'active',published:'true'},wrong],[t],state);
 const mappedState={...state,links:{'100|200':'b|'}},mapped=a.compare([base,{...b,eligible:true,status:'active',published:'true'},wrong],[t],mappedState);
 const conflictTitles=['Nectar #1 CGC 9.8 2026 Cover A','Nectar #3 CGC 9.9 2026 Cover A','Nectar #1 CGC 9.9 2025 Cover A','Nectar #1 CGC 9.9 2026 Cover B'];
 const conflictT={...t,product_name:'Nectar #1 CGC 9.9 2026 Cover A',seller_sku:'reused'};
 const conflicts=a.compare(conflictTitles.map((title,i)=>({...base,title,key:'c'+i,handle:'c'+i,sku:'reused'})),[conflictT],state);
 return {groupedReview:grouped.review.length,groupedHandles:grouped.removed[0].duplicateHandles,mixedCandidates:mixed.review[0].candidates.map(x=>x.handle),mappedReview:mapped.review.length,mappedProposed:mapped.proposed.map(x=>x.handle),conflicts:conflicts.review[0].candidates.length};
 });
 assert.equal(matching.groupedReview,0);assert.deepEqual(matching.groupedHandles,['a','b']);assert.deepEqual(matching.mixedCandidates,['a','b']);assert.equal(matching.mappedReview,0);assert(!matching.mappedProposed.includes('a'));assert(!matching.mappedProposed.includes('b'));assert.equal(matching.conflicts,0);
 if(process.env.COMICROX_PRIVATE_SHOPIFY){const csv=fs.readFileSync(process.env.COMICROX_PRIVATE_SHOPIFY,'utf8');const evidence=await page.evaluate(csv=>{const a=window.ComicRoxTikTokTest,ss=a.shopRows(csv),r=a.stage(a.compare(ss,[],a.getState()));return {variants:ss.length,zero:ss.filter(s=>s.qty===0).length,nonpositiveInAdditions:r.add.filter(x=>x.s.qty<=0).length,example:ss.filter(s=>s.handle==='batman-death-and-the-maidens-1-9-2003-dc-comics-full-set-all-nm').map(s=>({qty:s.qty,eligible:s.eligible}))};},csv);assert.equal(evidence.nonpositiveInAdditions,0);assert(evidence.zero>0);assert(evidence.example.every(x=>x.qty===0&&!x.eligible));console.log('Private Shopify export stock check:',JSON.stringify(evidence));}
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('record outcome button saves valid SKUs and shows mismatches beside the button without partial changes',async()=>{
 const server=http.createServer((req,res)=>{const p=path.join(root,req.url.split('?')[0]);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.addInitScript(()=>{if(localStorage.getItem('comicrox_tiktok_sync_v1'))return;localStorage.setItem('comicrox_tiktok_sync_v1',JSON.stringify({version:1,links:{},skus:{},overrides:{},profiles:{single:{weight:145,length:33,width:21,height:.5},graded:{},bundle:{}},history:[{id:'older',at:'2026-10-19',rows:[{key:'a',sku:'CR-TT-A',status:'pending'},{key:'b',sku:'CR-TT-B',status:'pending'}]},{id:'latest',at:'2026-10-20',rows:[{key:'c',sku:'CR-TT-C',status:'pending'}]}]}));});await page.goto('http://127.0.0.1:'+server.address().port+'/ComicRox-TikTok.html');
 await page.locator('#runSelect').selectOption('older');await page.locator('#outcomeSkus').fill('CR-TT-A\n1729940835050887242');await page.locator('#success').click();
 await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('1729940835050887242'));assert.match(await page.locator('#historyStatus').textContent(),/No outcomes were changed/);assert.equal(await page.evaluate(()=>window.ComicRoxTikTokTest.getState().history[0].rows[0].status),'pending');
 await page.locator('#outcomeSkus').fill('\uFEFF"CR-TT-A"\nCR-TT-B\nCR-TT-A');await page.locator('#success').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('2 successful'));assert.equal(await page.locator('#runSelect').inputValue(),'older');assert.equal(await page.evaluate(()=>window.ComicRoxTikTokTest.getState().history[0].rows.filter(x=>x.status==='success').length),2);
 page.once('dialog',d=>d.accept());await page.locator('#release').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('Cannot release'));assert.equal(await page.evaluate(()=>window.ComicRoxTikTokTest.getState().history[0].rows.filter(x=>x.status==='success').length),2);
 await page.reload();assert.equal(await page.evaluate(()=>window.ComicRoxTikTokTest.getState().history[0].rows.filter(x=>x.status==='success').length),2);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('cleanup download edits only confirmed unavailable variants and protects mixed-stock products',async()=>{
 const server=http.createServer((req,res)=>{const p=path.join(root,req.url.split('?')[0]);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/ComicRox-TikTok.html');
 const h=['Handle','Title','Published','Status','Variant Price','Variant Inventory Qty','Variant SKU','Variant Grams','Image Src','Option1 Value'];
 const rows=[['mixed','Test comic','true','active',5,0,'sold',100,'https://example.com/a.jpg','Sold variant'],['mixed','','true','active',5,2,'available',100,'https://example.com/a.jpg','Available variant'],['withdrawn','Withdrawn comic','false','archived',10,1,'withdrawn',100,'https://example.com/b.jpg','Default Title']];
 await page.locator('#shopFile').setInputFiles({name:'shop.csv',mimeType:'text/csv',buffer:Buffer.from([h,...rows].map(r=>r.map(s=>'"'+s+'"').join(',')).join('\n'))});await page.waitForFunction(()=>document.querySelector('#shopStatus').textContent.includes('3 variants'));
 const bytes=await page.evaluate(async()=>{const z=new JSZip(),n='http://schemas.openxmlformats.org/spreadsheetml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';z.file('xl/workbook.xml',`<workbook xmlns="${n}" xmlns:r="${r}"><sheets><sheet name="Template" sheetId="1" r:id="rId1"/></sheets></workbook>`);z.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');const data=[['product_id','product_name','seller_sku','quantity','price','sku_id','product_status','product_description'],[],[],[],[],['1729940000000000001','Test comic','sold','1','5','1729940000000000002','Live(1)','Original description'],['1729940000000000001','Test comic','available','2','5','1729940000000000003','Live(1)','Original description'],['1729940000000000004','Withdrawn comic','withdrawn','1','10','1729940000000000005','Live(1)','Keep description'],['1729940000000000006','Unmatched item','unknown','1','12','1729940000000000007','Live(1)','Do not alter']];z.file('xl/worksheets/sheet1.xml',`<worksheet xmlns="${n}"><sheetData>`+data.map((row,i)=>`<row r="${i+1}">`+row.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>');return Array.from(await z.generateAsync({type:'uint8array'}));});
 await page.locator('#ttFiles').setInputFiles({name:'live.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)});await page.waitForFunction(()=>document.querySelector('#sources').textContent.includes('4 rows'));await page.locator('#run').click();await page.waitForFunction(()=>window.ComicRoxTikTokTest.getResult()?.removed.length===2);
 assert(await page.locator('#downloadCleanup').isDisabled());for(const key of ['Live','Failed','Deactivated','Draft'])await page.locator('#cover'+key).check();assert(await page.locator('#downloadCleanup').isDisabled());await page.locator('#cleanupConfirm').check();assert(await page.locator('#downloadCleanup').isEnabled());
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadCleanup').click()]);const data=Array.from(fs.readFileSync(await download.path()));
 const output=await page.evaluate(async data=>{const w=await window.ComicRoxTikTokTest.workbook(Uint8Array.from(data).buffer),h=w.rows[0];return w.rows.slice(5).filter(Boolean).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));},data);
 assert.equal(output.length,2);assert.equal(output[0].product_id,'1729940000000000001');assert.equal(output[0].sku_id,'1729940000000000002');assert.equal(output[0].quantity,'0');assert.equal(output[0].product_status,'Live(1)');assert.equal(output[0].product_description,'Original description');assert.equal(output[1].product_status,'Deactivated(2)');assert.equal(output[1].quantity,'0');assert.equal(output[1].product_description,'Keep description');
 assert.match(await page.locator('#cleanupStatus').textContent(),/Nothing has changed on TikTok yet/);assert.equal(await page.evaluate(()=>window.ComicRoxTikTokTest.getState().history.length),0);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
