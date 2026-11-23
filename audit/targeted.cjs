const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const requireTool=require('./deps.cjs');
const {chromium}=requireTool('playwright');
const {start}=require('./server.cjs');
const base='http://127.0.0.1:4382/3m_music-/';
const server=start(4382),results={checks:[]};
const image='data:image/webp;base64,'+fs.readFileSync(path.join(__dirname,'../public/assets/mikhail-grishin.webp')).toString('base64');
(async()=>{let browser;try{
browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
await context.route('https://yandex.ru/**',r=>r.abort('blockedbyclient'));
const page=await context.newPage();page.setDefaultTimeout(6000);
await page.goto(base+'admin/');
await page.locator('#password').fill('6767');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.locator('#new').click();
results.hiddenPreviews=await page.locator('#photo-preview,#logo-preview,#video-preview').evaluateAll(elements=>elements.map(el=>({id:el.id,hiddenAttribute:el.hidden,display:getComputedStyle(el).display,visible:el.getBoundingClientRect().height>0,src:el.getAttribute('src')})));
await page.locator('#editor [name=description]').focus();
results.adminOverlaps=await page.evaluate(()=>{
const actions=[...document.querySelectorAll('.admin-actions')].filter(el=>el.getBoundingClientRect().height>0);
const focus=document.activeElement.getBoundingClientRect();
return {focus:{top:focus.top,bottom:focus.bottom},actions:actions.map(el=>({id:el.id,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,height:el.getBoundingClientRect().height})),viewport:innerHeight};
});
await page.screenshot({path:path.join(__dirname,'screenshots/admin-sticky-overlap-390.png')});
await page.goto(base+'index.html');
results.modalFocus=[];
await page.locator('[data-contact]').click();
for(let i=0;i<8;i++){await page.keyboard.press('Tab');results.modalFocus.push(await page.evaluate(()=>({tag:document.activeElement.tagName,class:document.activeElement.className,text:document.activeElement.textContent?.slice(0,80),insideDialog:!!document.activeElement.closest('dialog')})));}
await page.keyboard.press('Escape');
results.restoredFocus=await page.evaluate(()=>({tag:document.activeElement.tagName,contact:document.activeElement.hasAttribute('data-contact')}));
await page.evaluate(image=>localStorage.setItem('3m-artists-demo',JSON.stringify({artists:Array.from({length:3},(_,i)=>({id:'audit-'+i,name:'Тест '+i,photo:image,description:'<img src=x onerror=alert(1)>',links:[]}))})),image);
await page.reload();
await page.locator('.artist').first().focus();
results.carouselFocus=[];
for(let i=0;i<4;i++){
await page.keyboard.press('ArrowRight');
results.carouselFocus.push(await page.evaluate(()=>({active:[...document.querySelectorAll('.artist')].findIndex(el=>el.hasAttribute('aria-current')),focus:document.activeElement.className,tag:document.activeElement.tagName})));
}
await page.screenshot({path:path.join(__dirname,'screenshots/carousel-focus-loss-390.png')});
await page.goto(base+'artist.html?id=audit-0');
await page.waitForSelector('.artist-description');results.xss={text:await page.locator('.artist-description').innerText(),injectedImages:await page.locator('.artist-description img').count()};
await page.goto(base+'index.html');
await page.evaluate(()=>localStorage.setItem('3m-releases-demo',JSON.stringify({releases:Array.from({length:12},(_,i)=>({id:'r'+i,title:'Тестовый релиз '+i,artistId:'artist-1',artistName:'Артист 1',photo:'assets/mikhail-grishin.webp',url:'https://example.com/'+i}))})));
await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.release-card').length===12);
results.releaseLayout=[];
for(const width of [390,768,1024,1440]){
await page.setViewportSize({width,height:900});
results.releaseLayout.push(await page.locator('.release-grid').evaluate(el=>({width:innerWidth,columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,height:el.getBoundingClientRect().height,cards:el.children.length})));
}
await context.close();

// A visitor in a new browser context cannot see data stored by another visitor.
const clean=await browser.newContext();await clean.route('https://yandex.ru/**',r=>r.abort('blockedbyclient'));const visitor=await clean.newPage();
await visitor.goto(base+'index.html');await visitor.waitForTimeout(200);results.newVisitor={releases:await visitor.locator('.release-card').count(),artistCards:await visitor.locator('.artist').count()};await clean.close();

// Corrupt artist data must not silently take the release section down.
const bad=await browser.newContext();await bad.route('https://yandex.ru/**',r=>r.abort('blockedbyclient'));const invalid=await bad.newPage();await invalid.goto(base);
await invalid.evaluate(image=>{localStorage.setItem('3m-artists-demo','{"artists":null}');localStorage.setItem('3m-releases-demo',JSON.stringify({releases:[{id:'r',title:'Релиз',artistId:'artist-1',artistName:'Артист 1',photo:image,url:'https://example.com/'}]}));},image);
await invalid.reload();await invalid.waitForTimeout(200);results.invalidData={releaseMessage:await invalid.locator('#releases-empty').innerText(),releaseCards:await invalid.locator('.release-card').count()};
await bad.close();
}finally{await browser?.close();server.close();fs.writeFileSync(path.join(__dirname,'results/targeted.json'),JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
