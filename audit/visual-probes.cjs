const fs=require('node:fs'),path=require('node:path'),requireTool=require('./deps.cjs');
const {chromium}=requireTool('playwright'),{start}=require('./server.cjs');
const server=start(4383),base='http://127.0.0.1:4383/3m_music-/',results={};
(async()=>{let browser;try{
browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:320,height:568},reducedMotion:'reduce'});const page=await context.newPage();
await context.route('https://yandex.ru/**',r=>r.abort('blockedbyclient'));
await page.goto(base+'teachers.html');
results.heading320=await page.locator('h1').evaluate(el=>({text:el.textContent,scroll:el.scrollWidth,client:el.clientWidth,rect:el.getBoundingClientRect().toJSON(),overflow:getComputedStyle(el).overflow}));
await page.screenshot({path:path.join(__dirname,'screenshots/teachers-320.png'),fullPage:true});
for(const file of ['index.html','teachers.html','admin/']){
await page.setViewportSize({width:195,height:422});await page.goto(base+file);
await page.screenshot({path:path.join(__dirname,'screenshots/zoom200-'+file.replaceAll('/','').replace('.html','')+'.png'),fullPage:true});
}
await page.setViewportSize({width:390,height:844});await page.goto(base+'admin/');
await page.evaluate(()=>localStorage.setItem('3m-releases-demo',JSON.stringify({releases:Array.from({length:12},(_,i)=>({id:'r'+i,title:'Тестовый релиз '+i,artistId:'artist-1',artistName:'Артист 1',photo:'assets/mikhail-grishin.webp',url:'https://example.com/'+i}))})));
await page.locator('#password').fill('6767');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.locator('#teacher-new').click();await page.locator('#teacher-editor [name=name]').focus();
results.occlusion=await page.evaluate(()=>{
const field=document.querySelector('#teacher-editor [name=name]'),r=field.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
return {rect:r.toJSON(),topTag:top?.tagName,topText:top?.textContent?.slice(0,100),fieldOnTop:top===field,scrollY};
});
await page.screenshot({path:path.join(__dirname,'screenshots/admin-12-releases-teacher-edit-390.png')});
await context.close();
}finally{await browser?.close();server.close();fs.writeFileSync(path.join(__dirname,'results/visual-probes.json'),JSON.stringify(results,null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
