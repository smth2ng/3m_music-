const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const requireTool = require('./deps.cjs');
const { chromium, firefox, webkit } = requireTool('playwright');
const AxeBuilder = requireTool('@axe-core/playwright').default;
const { start } = require('./server.cjs');
const origin = 'http://127.0.0.1:4380';
const base = origin + '/3m_music-/';
const output = name => path.join(__dirname, 'results', name);
fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
const sizes = [[320,568],[360,640],[375,667],[390,844],[414,896],[430,932],[600,960],[768,1024],[820,1180],[1024,1366],[1280,720],[1366,768],[1440,900],[1920,1080],[2560,1440]];
const pages = ['index.html','artists.html','teachers.html','contacts.html','admin/','artist.html','artists/artist-1.html','artists/artist-2.html'];
const keyWidths = [390,768,1024,1440];
let results = { started: new Date().toISOString(), base, browsers: [], matrix: [], checks: [], axe: [], links: [], notes: ['External map requests are deliberately aborted in local deterministic tests. External-service availability is recorded separately.'] };
if (process.env.AUDIT_CHECKS_ONLY) {
  results = JSON.parse(fs.readFileSync(output('audit.json'), 'utf8'));
  results.checks = [];
  results.browsers = [];
}
let browser;
const server = start();
const image = 'data:image/webp;base64,' + fs.readFileSync(path.join(__dirname, '../public/assets/mikhail-grishin.webp')).toString('base64');
const sample = { id:'audit-band', name:'Тестовый артист (аудит)', photo:image, logo:'', description:'Тестовое описание музыкального проекта. '.repeat(8), photos:[image,image], video:'https://example.com/video', links:[{label:'Яндекс Музыка',url:'https://music.yandex.ru/artist/1'},{label:'VK Музыка',url:'https://vk.com/music'}] };
async function seed(page, count=3, releaseCount=12) {
  await page.evaluate(({ sample, count, releaseCount }) => {
    localStorage.setItem('3m-artists-demo', JSON.stringify({ artists: Array.from({length:count},(_,i)=>({...sample,id:'audit-band-'+i,name:i ? 'Тестовый артист '+i : sample.name})) }));
    localStorage.setItem('3m-releases-demo', JSON.stringify({ releases:Array.from({length:releaseCount},(_,i)=>({id:'audit-release-'+i,title:'Тестовый релиз '+(i+1),artistId:'audit-band-0',artistName:sample.name,photo:sample.photo,url:'https://example.com/listen/'+i})) }));
  },{sample,count,releaseCount});
}
async function configure(context) {
  await context.route('https://yandex.ru/**', route=>route.abort('blockedbyclient'));
}
function watch(page) {
  const data = { errors:[], console:[], failed:[], badResponses:[] };
  page.on('pageerror', e=>data.errors.push(e.message));
  page.on('console', m=>{if(m.type()==='error')data.console.push(m.text());});
  page.on('requestfailed', req=>data.failed.push({url:req.url(),error:req.failure()?.errorText,intentional:req.url().startsWith('https://yandex.ru/')}));
  page.on('response', response=>{if(response.status()>=400)data.badResponses.push({url:response.url(),status:response.status()});});
  return data;
}
async function inspect(page) {
  return page.evaluate(() => {
    const visible = el => {const s=getComputedStyle(el),r=el.getBoundingClientRect();return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
    const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    const heading=document.querySelector('h1');
    const active=document.querySelector('.artist--active');
    const head=heading?.getBoundingClientRect(), card=active?.getBoundingClientRect();
    return {
      scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
      title:document.title,description:document.querySelector('meta[name=description]')?.content,
      canonical:document.querySelector('link[rel=canonical]')?.href,og:[...document.querySelectorAll('meta[property^="og:"]')].length,
      h1:[...document.querySelectorAll('h1')].map(el=>el.textContent), headings:[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(el=>({tag:el.tagName,text:el.textContent})),
      blankBody:!document.body.innerText.trim(),bodyHeight:document.body.scrollHeight,
      overflowElements:[...document.querySelectorAll('body *')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+1||r.left< -1;}).slice(0,12).map(el=>({tag:el.tagName,class:el.className,rect:rect(el)})),
      clippedText:[...document.querySelectorAll('h1,h2,h3,p,a,button,label')].filter(visible).filter(el=>el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2).slice(0,12).map(el=>({tag:el.tagName,text:el.textContent.slice(0,100),rect:rect(el)})),
      tinyControls:[...document.querySelectorAll('a,button,input,select')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.width<24||r.height<24;}).map(el=>({text:el.textContent,rect:rect(el)})),
      images:[...document.images].map(img=>({src:img.getAttribute('src'),complete:img.complete,naturalWidth:img.naturalWidth,width:img.width,height:img.height,alt:img.getAttribute('alt')})),
      heroOverlap:head&&card?Math.max(0,Math.min(head.bottom,card.bottom)-Math.max(head.top,card.top)):null,
      links:[...document.querySelectorAll('a[href]')].map(el=>({href:el.href,text:el.textContent.trim(),target:el.target,rel:el.rel})),
      fixed:[...document.querySelectorAll('body *')].filter(el=>getComputedStyle(el).position==='fixed').map(el=>({class:el.className,rect:rect(el)}))
    };
  });
}
async function runCheck(name, fn) {
  try { const details=await fn(); results.checks.push({name,status:'passed',details}); }
  catch(error) {results.checks.push({name,status:'failed',error:error.message,stack:error.stack});console.log('FAIL '+name+': '+error.message.slice(0,180));}
  fs.writeFileSync(output('audit.json'),JSON.stringify(results,null,2));
}
async function fresh(options={}) {
  const context=await browser.newContext({ reducedMotion:'reduce',viewport:{width:1440,height:900},...options });
  await configure(context);
  const page=await context.newPage();
  page.setDefaultTimeout(6000);
  const network=watch(page);
  return {context,page,network};
}
(async()=>{
  for(const [name,type] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]) {
    try {
      const instance=await type.launch(name==='chromium'?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}:{});
      results.browsers.push({name,status:'available',version:instance.version()});
      if(name==='chromium')browser=instance;else await instance.close();
    }catch(error){results.browsers.push({name,status:'unavailable',reason:error.message.split('\n')[0]});}
  }
  if(!browser)throw new Error('Chromium unavailable');
  if (!process.env.AUDIT_CHECKS_ONLY) for(const size of sizes) {
    for(const landscape of [false,true]) {
      const [width,height]=landscape?[size[1],size[0]]:size;
      const {context,page,network}=await fresh({viewport:{width,height},hasTouch:width<1100});
      for(const file of pages) {
        const response=await page.goto(base+file,{waitUntil:'domcontentloaded'});
        await page.waitForTimeout(90);
        if(file==='teachers.html')await page.waitForFunction(()=>document.querySelectorAll('.teacher').length===2);
        await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>{img.loading='eager';return img.decode().catch(()=>{});})));
        const data=await inspect(page);
        const entry={page:file,width,height,orientation:landscape?'landscape':'portrait-or-original',status:response.status(),...data};
        if(!landscape&&keyWidths.includes(width)) {
          const shot='screenshots/'+file.replaceAll('/','_').replace('.html','')+'-'+width+'.png';
          await page.screenshot({path:path.join(__dirname,shot),fullPage:true});
          entry.screenshot=shot;
          if(!results.axe.some(result=>result.page===file&&result.width===width)) {
            const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
            results.axe.push({page:file,width,violations:axe.violations,incomplete:axe.incomplete.map(i=>({id:i.id,impact:i.impact,nodes:i.nodes.length})),passes:axe.passes.length});
          }
        }
        results.matrix.push(entry);
      }
      results.matrix.at(-1).network=network;
      await context.close();
      fs.writeFileSync(output('audit.json'),JSON.stringify(results,null,2));
    }
    console.log('Matrix '+size.join('x')+' and landscape complete');
  }
  await runCheck('Internal links and static files under GitHub Pages subpath',async()=>{
    const links=new Set();
    for(const row of results.matrix)for(const link of row.links)if(link.href.startsWith(base))links.add(link.href.split('#')[0]);
    for(const suffix of ['robots.txt','sitemap.xml','no-such-page.html','api/admin/login'])links.add(base+suffix);
    for(const url of links){const response=await fetch(url);results.links.push({url,status:response.status,type:response.headers.get('content-type')});}
    const broken=results.links.filter(r=>r.status>=400&&!/robots.txt|sitemap.xml|no-such-page|api\/admin/.test(r.url));
    assert.deepEqual(broken,[]);return {tested:links.size};
  });
  await runCheck('Navigation, modal buttons, Escape, focus trap and restoration',async()=>{
    const {page,context}=await fresh({viewport:{width:390,height:844}});
    await page.goto(base);
    for(const [label,file]of [['Артисты','artists.html'],['Преподаватели','teachers.html'],['Контакты','contacts.html'],['Главная','index.html']]){
      await page.getByRole('navigation',{name:'Основная навигация'}).getByRole('link',{name:label,exact:true}).click();assert.ok(page.url().endsWith(file));
    }
    const trigger=page.locator('[data-contact]');await trigger.click();
    assert.equal(await page.locator('dialog').evaluate(el=>el.open),true);
    for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement===document.body || !!document.activeElement.closest('dialog')),true,'Focus must not enter background controls');}
    assert.equal(await page.locator('dialog a').getAttribute('href'),'tel:+79109407608');
    await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
    await trigger.click();await page.locator('.dialog-close').click();assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);
    await trigger.click();await page.mouse.click(1,1);assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);
    await context.close();
  });
  await runCheck('Carousel wheel, keyboard, 3 visible artists, momentum, focus and touch swipe',async()=>{
    const {context,page}=await fresh({viewport:{width:390,height:844},hasTouch:true});
    await page.goto(base);await seed(page);await page.reload();
    assert.equal(await page.locator('.artist:visible').count(),3);
    await page.locator('.artists').press('ArrowRight');
    assert.equal(await page.locator('.artist').nth(1).getAttribute('aria-current'),'true');
    await page.locator('.artist').nth(1).dispatchEvent('wheel',{deltaX:100,deltaY:0});
    assert.equal(await page.locator('.artist').nth(2).getAttribute('aria-current'),'true');
    await page.locator('.artist').nth(2).dispatchEvent('wheel',{deltaX:70,deltaY:0});
    assert.equal(await page.locator('.artist').nth(2).getAttribute('aria-current'),'true');
    await page.locator('.artist').nth(2).dispatchEvent('wheel',{deltaX:-100,deltaY:0});
    assert.equal(await page.locator('.artist').nth(1).getAttribute('aria-current'),'true');
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:270,y:350}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y:352}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.locator('.artist').nth(2).getAttribute('aria-current'),'true');
    assert.equal(context.pages().length,1);
    await context.close();
  });
  await runCheck('Carousel focus survives hiding an old card',async()=>{
    const {page,context}=await fresh();await page.goto(base);await seed(page);await page.reload();
    await page.locator('.artist').first().focus();
    for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');
    const active=await page.locator('.artist[aria-current=true]').evaluate(el=>[...document.querySelectorAll('.artist')].indexOf(el));
    const focus=await page.evaluate(()=>document.activeElement.className);
    await context.close();assert.equal(active,3,'focus='+focus);
  });
  await runCheck('200% browser zoom approximation via half CSS viewport, all pages',async()=>{
    const rows=[];
    for(const width of [390,768,1024,1440]){
      const {page,context}=await fresh({viewport:{width:Math.round(width/2),height:450}});
      for(const file of pages.slice(0,5)){
        await page.goto(base+file);const data=await inspect(page);rows.push({physicalWidth:width,cssWidth:Math.round(width/2),page:file,overflow:data.overflow,offscreen:data.overflowElements});
      }await context.close();
    }
    fs.writeFileSync(output('zoom.json'),JSON.stringify(rows,null,2));
    assert.equal(rows.filter(r=>r.overflow).length,0);
  });
  await runCheck('JavaScript disabled baseline and phone access',async()=>{
    const {page,context}=await fresh({javaScriptEnabled:false});
    const rows=[];
    for(const file of pages){await page.goto(base+file);rows.push({file,text:(await page.locator('body').innerText()).slice(0,300),h1:await page.locator('h1').count()});}
    fs.writeFileSync(output('no-js.json'),JSON.stringify(rows,null,2));
    await context.close();
  });
  await runCheck('Populated content screenshots, 12 releases and 3 additional artists',async()=>{
    const {page,context}=await fresh();await page.goto(base);await seed(page);
    for(const width of keyWidths){
      await page.setViewportSize({width,height:width<500?844:1000});
      for(const file of ['index.html','artists.html','artist.html?id=audit-band-0']){
        await page.goto(base+file);await page.waitForTimeout(150);
        if(file==='index.html')await page.waitForFunction(()=>document.querySelectorAll('.release-card').length===12);
        const data=await inspect(page);results.matrix.push({page:file,fixture:true,width,height:width<500?844:1000,...data});
        const shot='screenshots/populated-'+file.split('?')[0].replace('.html','')+'-'+width+'.png';
        await page.screenshot({path:path.join(__dirname,shot),fullPage:true});
      }
    }
    await page.goto(base+'admin/');await page.locator('#password').fill('6767');await page.getByRole('button',{name:'Войти',exact:true}).click();
    await page.locator('#new').click();
    for(const width of keyWidths){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(__dirname,'screenshots/admin-editor-'+width+'.png'),fullPage:true});}
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    results.axe.push({page:'admin/editor',width:1440,violations:axe.violations,passes:axe.passes.length});
    await context.close();
  });
  await runCheck('Admin artist, teacher and release CRUD, URL validation, logout',async()=>{
    const {page,context}=await fresh({viewport:{width:390,height:844}});
    await page.goto(base+'admin/');await page.locator('#password').fill('wrong');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Неверный'));
    await page.locator('#password').fill('6767');await page.getByRole('button',{name:'Войти',exact:true}).click();
    await page.locator('#new').click();await page.locator('#editor [name=name]').fill('QA <b>группа</b>');await page.locator('#editor [name=photo]').setInputFiles({name:'cover.webp',mimeType:'image/webp',buffer:Buffer.from(image.split(',')[1],'base64')});
    await page.locator('#editor [name=links]').fill('Платформа | javascript:alert(1)');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('HTTPS'));
    await page.locator('#editor [name=links]').fill('Платформа | https://example.com/listen');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#editor').hidden);
    await page.getByRole('button',{name:'QA <b>группа</b>',exact:true}).click();await page.locator('#editor [name=description]').fill('Обновлено');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#editor').hidden);
    await page.locator('#teacher-new').click();await page.locator('#teacher-editor [name=name]').fill('QA преподаватель');await page.getByRole('button',{name:'Сохранить преподавателя',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#teacher-editor').hidden);
    await page.locator('#release-new').click();const select=page.locator('#release-editor [name=artist]');const value=await select.locator('option').last().getAttribute('value');await select.selectOption(value);
    await page.locator('#release-editor [name=title]').fill('QA релиз');await page.locator('#release-editor [name=url]').fill('https://example.com/listen');await page.locator('#release-editor [name=photo]').setInputFiles({name:'cover.webp',mimeType:'image/webp',buffer:Buffer.from(image.split(',')[1],'base64')});await page.getByRole('button',{name:'Сохранить релиз',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#release-editor').hidden);
    page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Удалить релиз — QA релиз',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Удалить релиз — QA релиз',exact:true}).count(),1);
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Удалить релиз — QA релиз',exact:true}).click();
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Удалить — QA преподаватель',exact:true}).click();
    await page.getByRole('button',{name:'QA <b>группа</b>',exact:true}).click();page.once('dialog',d=>d.accept());await page.locator('#delete').click();await page.locator('#logout').click();assert.equal(await page.locator('#workspace').isVisible(),false);
    await context.close();
  });
  await runCheck('Malformed localStorage handling',async()=>{
    const {page,context,network}=await fresh();await page.goto(base);
    await page.evaluate(()=>localStorage.setItem('3m-artists-demo','{"artists":[null]}'));
    await page.reload();await page.waitForTimeout(200);
    fs.writeFileSync(output('malformed-storage.json'),JSON.stringify(network,null,2));
    await context.close();assert.deepEqual(network.errors,[]);
  });
  await runCheck('Removing local override restores baseline',async()=>{
    const {page,context}=await fresh();await page.goto(base);await seed(page,1,0);await page.reload();assert.equal(await page.locator('.artist').count(),3);
    await page.evaluate(()=>{localStorage.removeItem('3m-artists-demo');document.dispatchEvent(new Event('visibilitychange'));});
    const count=await page.locator('.artist').count();await context.close();assert.equal(count,2);
  });
  await runCheck('Missing artist must have accessible heading and usable return link',async()=>{
    const {page,context}=await fresh();await page.goto(base+'artist.html?id=missing');await page.waitForFunction(()=>document.querySelector('main').textContent.includes('не найден'));
    const h1=await page.locator('h1').count();await context.close();assert.equal(h1,1);
  });
  await runCheck('Reduced-motion toggle removes animated enhancement',async()=>{
    const {page,context}=await fresh({reducedMotion:'no-preference'});await page.goto(base);await page.waitForFunction(()=>document.documentElement.classList.contains('motion-ready'));
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.documentElement.classList.contains('motion-ready'));assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).scrollSnapType),'none');await context.close();
  });
  await runCheck('Keyboard focus indicators and 200% text zoom overflow probe',async()=>{
    const {page,context}=await fresh();const rows=[];
    for(const file of pages.slice(0,5)){
      await page.goto(base+file);await page.keyboard.press('Tab');
      rows.push({file,focus:await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent,outline:getComputedStyle(document.activeElement).outline}))});
      await page.addStyleTag({content:'html { font-size: 200% !important; }'});
      rows.at(-1).overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    }fs.writeFileSync(output('keyboard.json'),JSON.stringify(rows,null,2));await context.close();
  });
  results.finished=new Date().toISOString();
  if (results.checks.some(check => check.status === 'failed')) process.exitCode = 1;
  fs.writeFileSync(output('audit.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({matrix:results.matrix.length,checks:results.checks.map(x=>({name:x.name,status:x.status})),axe:results.axe.length,browsers:results.browsers},null,2));
})().catch(e=>{results.fatal=e.stack;fs.writeFileSync(output('audit.json'),JSON.stringify(results,null,2));console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
