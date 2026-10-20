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
 if(process.env.COMICROX_PRIVATE_SHOPIFY){const csv=fs.readFileSync(process.env.COMICROX_PRIVATE_SHOPIFY,'utf8');const evidence=await page.evaluate(csv=>{const a=window.ComicRoxTikTokTest,ss=a.shopRows(csv),r=a.stage(a.compare(ss,[],a.getState()));return {variants:ss.length,zero:ss.filter(s=>s.qty===0).length,nonpositiveInAdditions:r.add.filter(x=>x.s.qty<=0).length,example:ss.filter(s=>s.handle==='batman-death-and-the-maidens-1-9-2003-dc-comics-full-set-all-nm').map(s=>({qty:s.qty,eligible:s.eligible}))};},csv);assert.equal(evidence.nonpositiveInAdditions,0);assert(evidence.zero>0);assert(evidence.example.every(x=>x.qty===0&&!x.eligible));console.log('Private Shopify export stock check:',JSON.stringify(evidence));}
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
