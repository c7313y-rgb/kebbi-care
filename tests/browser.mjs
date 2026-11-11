import {chromium} from 'playwright';import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');fs.mkdirSync(path.join(root,'qa'),{recursive:true});
const server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root+'/')){res.writeHead(403).end();return;}try{const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));}catch(e){res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1380,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/db-demo/`);await page.screenshot({path:path.join(root,'qa/入口.png'),fullPage:false});
 await page.fill('#productionUrl','https://evil.example/exec');await page.click('#productionOpen');assert.match(await page.locator('#productionStatus').textContent(),/Google Apps Script/);
 await page.goto(`http://127.0.0.1:${port}/db-demo/admin.html#mail`);await page.fill('#key','demo-admin');await page.click('#loginForm button');await page.waitForSelector('#mailDemoArea:not(.hidden)');
 assert.ok(await page.locator('#mailSave').isDisabled());await page.click('#mailDemoRun');await page.waitForFunction(()=>document.querySelector('#mailMsg').textContent.includes('新規 1 件'));
 await page.click('#mailDemoRun');await page.waitForFunction(()=>document.querySelector('#mailMsg').textContent.includes('新規 0 件'));
 await page.waitForTimeout(250);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(root,'qa/メール取込デモ.png'),fullPage:true});
 await page.click('a[data-v="records"]');await page.waitForTimeout(150);assert.ok(await page.locator('#recTbl').getByText('朝食を8割摂取').count());
 // A production-like preview of the same code with a mock Gmail service, for UI integration.
 const prod=await browser.newContext({viewport:{width:1380,height:1000}});
 const init=['sheets.js','gas-code.js','runtime.js','mail-import.js'].map(f=>fs.readFileSync(path.join(root,'db-demo',f),'utf8')).join('\n');
 const exports=[...init.matchAll(/function (admin[A-Za-z]+)\(/g)].map(m=>m[1]);
 await prod.addInitScript({content:init+'\nObject.assign(window,{'+exports.join(',')+'});'+"\nwindow.Gmail={Users:{getProfile:()=>({emailAddress:'generousadmin@gmail.com'}),Messages:{list:()=>({messages:[]})}}};window.ScriptApp.getProjectTriggers=()=>[];window.KC3_DEMO=undefined;"});
 await prod.route('https://c7313y-rgb.github.io/kebbi-care/db-demo/lib/xlsx.full.min.js',r=>r.fulfill({path:path.join(root,'db-demo/lib/xlsx.full.min.js'),contentType:'text/javascript'}));
 const prodPage=await prod.newPage();prodPage.on('pageerror',e=>errors.push(e.message));
 await prodPage.goto(`http://127.0.0.1:${port}/db-demo/production/Index.html#mail`);await prodPage.fill('#key','demo-admin');await prodPage.click('#loginForm button');await prodPage.waitForTimeout(700);await prodPage.waitForFunction(()=>!document.querySelector('#mailSave').disabled&&document.querySelector('#mailConnection').textContent.includes('接続済み'),null,{timeout:5000});
 await prodPage.fill('#mailSenders','kebbi@example.com');await prodPage.fill('#mailSubject','Kebbi');await prodPage.fill('#mailStart','2026-11-11');await prodPage.click('#mailSave');await prodPage.waitForFunction(()=>document.querySelector('#mailMsg').textContent.includes('設定を保存'));
 await prodPage.click('#mailSync');await prodPage.waitForFunction(()=>document.querySelector('#mailMsg').textContent.includes('確認完了'));
 await prodPage.waitForTimeout(250);await prodPage.evaluate(()=>scrollTo(0,0));await prodPage.screenshot({path:path.join(root,'qa/メール設定画面例.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto(`http://127.0.0.1:${port}/db-demo/`);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await page.goto(`http://127.0.0.1:${port}/db-demo/admin.html#mail`);await page.waitForSelector('#v-mail:not(.hidden)');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await page.screenshot({path:path.join(root,'qa/mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Browser PASS: launcher URL validation, demo import, deduplication, production settings + sync, mobile layout; no page errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
