const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const requireTool = require('./deps.cjs');
const { chromium } = requireTool('playwright');
const { start } = require('./server.cjs');
const root = path.join(__dirname, '..');
const results = { checks: [], realGitHubWrites: false };
const base = 'http://127.0.0.1:4386/3m_music-/';
const server = start(4386);
const password = randomBytes(24).toString('hex');
const backendOrigin = 'http://127.0.0.1:4387';
const backend = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT:'4387', SERVE_DIST:'1', ADMIN_PASSWORD:password, ADMIN_GITHUB_TOKEN:'unused-audit-placeholder', ADMIN_ORIGIN:backendOrigin } });
const imageBytes = fs.readFileSync(path.join(root,'public/assets/mikhail-grishin.webp'));
const image = 'data:image/webp;base64,' + imageBytes.toString('base64');
let browser;
async function check(name, fn) {
  try { results.checks.push({name,status:'passed',details:await fn()}); }
  catch(error) { results.checks.push({name,status:'failed',error:error.stack}); process.exitCode=1; console.error(name,error.message); }
  fs.writeFileSync(path.join(__dirname,'retest-results/fix-regressions.json'),JSON.stringify(results,null,2));
}
async function login(page, url=base+'admin/', value='6767') {
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#password').fill(value);
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#workspace').hidden);
}
async function context() {
  const context=await browser.newContext();
  await context.route('https://yandex.ru/**',r=>r.abort('blockedbyclient'));
  return context;
}
(async()=>{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  await check('Local two-tab conflict preserves first teacher edit',async()=>{
    const ctx=await context(),a=await ctx.newPage(),b=await ctx.newPage();
    await login(a);await login(b);
    for(const p of [a,b])await p.locator('#teacher-new').click();
    await a.locator('#teacher-editor [name=name]').fill('Вкладка A');
    await a.getByRole('button',{name:'Сохранить преподавателя',exact:true}).click();await a.waitForFunction(()=>document.querySelector('#teacher-editor').hidden);
    await b.locator('#teacher-editor [name=name]').fill('Вкладка B');
    await b.getByRole('button',{name:'Сохранить преподавателя',exact:true}).click();await b.waitForFunction(()=>document.querySelector('#status').textContent.includes('другой вкладке'));
    const data=await b.evaluate(()=>JSON.parse(localStorage.getItem('3m-teachers-demo')).teachers.map(t=>t.name));
    assert.ok(data.includes('Вкладка A'));assert.ok(!data.includes('Вкладка B'));
    await ctx.close();
  });
  await check('Photo/video previews obey hidden and action bar is in normal flow',async()=>{
    const ctx=await context(),p=await ctx.newPage();await login(p);await p.locator('#new').click();
    for(const selector of ['#photo-preview','#logo-preview','#video-preview'])assert.equal(await p.locator(selector).isVisible(),false);
    const positions=await p.locator('.admin-actions').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).position));
    assert.ok(positions.every(position=>position!=='sticky'));
    await ctx.close();
  });
  await check('Malformed JSON falls back with visible admin warning; null entries are skipped',async()=>{
    const ctx=await context(),p=await ctx.newPage();await p.goto(base);
    await p.evaluate(()=>{localStorage.setItem('3m-artists-demo','{');localStorage.setItem('3m-teachers-demo','{"teachers":[null]}');});
    await login(p);
    assert.ok((await p.locator('#storage-warning').innerText()).includes('поврежден'));
    assert.equal(await p.locator('#workspace').isVisible(),true);
    const accepted = await p.evaluate(async image => {
      const module = await import('../content-store.js');
      return module.normalizeCollection('artists', [null, {}, { name:'Без ID', photo:image }, { id:123, name:'Число', photo:image }, { id:['array'], name:'Массив', photo:image }, { id:'valid', name:'Корректный', photo:image }]).map(record=>record.id);
    }, image);
    assert.deepEqual(accepted, ['valid']);
    await ctx.close();
  });
  await check('Backup export and collection restore preserve Unicode and validate before writing',async()=>{
    const ctx=await context(),p=await ctx.newPage();await login(p);
    const downloadPromise=p.waitForEvent('download');await p.locator('#backup-data').click();
    const download=await downloadPromise;const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(data.version,1);assert.equal(JSON.parse(data.data.teachers).teachers.length,2);
    data.data.teachers=JSON.stringify({teachers:[{id:'restored',name:'Восстановленный преподаватель',description:'Описание',photo:''}]});
    await p.locator('summary').click();await p.locator('#restore-collection').selectOption('teachers');
    await p.locator('#restore-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    p.once('dialog',d=>d.accept());await p.locator('#restore-data').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('восстановлен'));
    assert.equal(await p.getByRole('button',{name:'Редактировать — Восстановленный преподаватель',exact:true}).count(),1);
    data.data.teachers='{"teachers":[null]}';
    await p.locator('#restore-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    p.once('dialog',d=>d.accept());await p.locator('#restore-data').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('некорректные'));
    assert.ok(await p.evaluate(()=>localStorage.getItem('3m-teachers-demo').includes('Восстановленный')));
    await ctx.close();
  });
  await check('Static metadata, robots, sitemap and visible placeholders',async()=>{
    for(const file of ['index.html','artists.html','teachers.html','contacts.html']){
      const html=await (await fetch(base+file)).text();
      assert.ok(html.includes('rel="canonical"'));assert.ok(html.includes('og:title'));assert.ok(html.includes('meta name="description"'));
    }
    assert.equal((await fetch(base+'robots.txt')).status,200);
    const sitemap=await (await fetch(base+'sitemap.xml')).text();
    assert.ok(sitemap.includes('https://smth2ng.github.io/3m_music-/contacts.html'));assert.ok(!sitemap.includes('admin/'));
    const p=await browser.newPage();
    for(const id of [1,2]){await p.goto(base+'artists/artist-'+id+'.html');assert.equal(await p.locator('h1').count(),1);assert.equal(await p.locator('.artist-main-photo').count(),1);assert.ok((await p.locator('body').innerText()).includes('готовится'));}
    await p.close();
  });
  await check('Responsive images load smaller source on mobile',async()=>{
    const ctx=await context(),p=await ctx.newPage();
    await p.setViewportSize({width:390,height:844});
    await p.goto(base);await p.locator('.hero img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
    const sources=await p.locator('.artist img').evaluateAll(images=>images.map(img=>({src:img.currentSrc,width:img.naturalWidth})));
    assert.ok(sources.every(item=>item.width<=480));
    await ctx.close();return sources;
  });
  await check('200 percent narrow viewport has no header, title or carousel overlaps',async()=>{
    const ctx=await context(),p=await ctx.newPage();
    await p.setViewportSize({width:195,height:422});
    await p.goto(base);
    const bounds=await p.evaluate(()=>Object.fromEntries(['.site-header','.hero-heading','.artist--active','.hero>.cta'].map(selector=>{
      const r=document.querySelector(selector).getBoundingClientRect();return [selector,{top:r.top,bottom:r.bottom}];
    })));
    assert.ok(bounds['.site-header'].bottom<=bounds['.hero-heading'].top);
    assert.ok(bounds['.hero-heading'].bottom<=bounds['.artist--active'].top);
    assert.ok(bounds['.artist--active'].bottom<=bounds['.hero>.cta'].top);
    await ctx.close();
  });
  await check('Server login, logout, invalid JSON, oversized body and route validation',async()=>{
    for(let i=0;i<50;i++){try{await fetch(backendOrigin);break;}catch{await new Promise(r=>setTimeout(r,100));}}
    const post=(body,origin=backendOrigin)=>fetch(backendOrigin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
    assert.equal((await post('{')).status,400);
    assert.equal((await post('null')).status,400);
    assert.equal((await post(JSON.stringify({password:'incorrect'}))).status,401);
    assert.equal((await post(JSON.stringify({password}),'https://wrong.example')).status,403);
    const config=await (await fetch(backendOrigin+'/admin/config.js')).text();assert.ok(config.includes('serverMode = true'));
    const response=await post(JSON.stringify({password}));assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));
    assert.equal((await fetch(backendOrigin+'/api/admin/media?path=../package.json',{headers:{Cookie:cookie}})).status,400);
    const tooBig=JSON.stringify({password:'x'.repeat(13*1024*1024)});
    assert.equal((await post(tooBig)).status,413);
    assert.equal((await fetch(backendOrigin+'/api/admin/logout',{method:'POST',headers:{Origin:backendOrigin,Cookie:cookie}})).status,200);
    assert.equal((await fetch(backendOrigin+'/api/admin/github/git/ref/heads/main',{headers:{Cookie:cookie}})).status,401);
  });
  await check('Server-backed publishing for artists, teachers and releases with mock GitHub and conflict protection',async()=>{
    const ctx=await browser.newContext(),p=await ctx.newPage();
    const state={version:1,files:Object.fromEntries(['artists','teachers','releases'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'public/data/'+name+'.json'),'utf8'))]))};
    const trees=new Map(),commits=new Map();let serial=10,blobCount=0;
    const hash=value=>createHash('sha1').update(JSON.stringify(value)).digest('hex');
    const head=()=>String(state.version).padStart(40,'0');
    await p.route(backendOrigin+'/api/admin/media?**',r=>r.fulfill({body:imageBytes,contentType:'image/webp'}));
    await p.route(backendOrigin+'/api/admin/github/**',async route=>{
      const req=route.request(),url=new URL(req.url()),endpoint=url.pathname.slice('/api/admin/github'.length),body=req.postDataJSON();
      let data={};
      if(endpoint==='/git/ref/heads/main')data={object:{sha:head()}};
      else if(endpoint.startsWith('/contents/')){
        const name=endpoint.split('/').at(-1).replace('.json','');
        data={sha:hash(state.files[name]),content:Buffer.from(JSON.stringify(state.files[name])).toString('base64')};
      }else if(endpoint.startsWith('/git/commits/')&&req.method()==='GET')data={tree:{sha:'base-tree'}};
      else if(endpoint==='/git/blobs'){blobCount++;data={sha:String(++serial).padStart(40,'0')};}
      else if(endpoint==='/git/trees'){const id=String(++serial).padStart(40,'0');trees.set(id,body.tree);data={sha:id};}
      else if(endpoint==='/git/commits'){const id=String(++serial).padStart(40,'0');commits.set(id,body);data={sha:id};}
      else if(endpoint==='/git/refs/heads/main'){
        assert.equal(body.force,false);
        const commit=commits.get(body.sha);
        if(commit.parents[0]!==head()){await route.fulfill({status:422,json:{message:'Conflict'}});return;}
        for(const entry of trees.get(commit.tree)){
          if(entry.path.startsWith('public/data/'))state.files[entry.path.split('/').at(-1).replace('.json','')]=JSON.parse(entry.content);
        }
        state.version=Number(body.sha);
        data={object:{sha:body.sha}};
      } else throw new Error('Unexpected mocked endpoint '+endpoint);
      await route.fulfill({json:data});
    });
    await login(p,backendOrigin+'/admin/',password);
    assert.equal(await p.getByRole('link',{name:'На сайт',exact:true}).getAttribute('href'),'https://smth2ng.github.io/3m_music-/');
    await p.locator('#teacher-new').click();await p.locator('#teacher-editor [name=name]').fill('Серверный преподаватель');await p.getByRole('button',{name:'Сохранить преподавателя',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#teacher-editor').hidden);
    assert.equal(state.files.teachers.teachers.length,3);
    await p.locator('#new').click();await p.locator('#editor [name=name]').fill('Серверный артист');await p.locator('#editor [name=photo]').setInputFiles({name:'a.webp',mimeType:'image/webp',buffer:imageBytes});await p.getByRole('button',{name:'Сохранить',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#editor').hidden);
    assert.ok(state.files.artists.artists[0].photo.startsWith('assets/uploads/'));
    await p.locator('#release-new').click();await p.locator('#release-editor [name=artist]').selectOption(state.files.artists.artists[0].id);await p.locator('#release-editor [name=title]').fill('Серверный релиз');await p.locator('#release-editor [name=url]').fill('https://example.com/listen');await p.locator('#release-editor [name=photo]').setInputFiles({name:'cover.webp',mimeType:'image/webp',buffer:imageBytes});await p.getByRole('button',{name:'Сохранить релиз',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#release-editor').hidden);
    assert.equal(state.files.releases.releases.length,1);assert.equal(blobCount,2);
    await p.locator('#teacher-new').click();await p.locator('#teacher-editor [name=name]').fill('Устаревшая правка');
    state.files.teachers.teachers.push({id:'other-editor',name:'Из другой вкладки',description:'',photo:''});state.version++;
    await p.getByRole('button',{name:'Сохранить преподавателя',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('другой вкладке'));
    assert.ok(!state.files.teachers.teachers.some(t=>t.name==='Устаревшая правка'));
    assert.ok((await p.locator('#admin-mode').innerText()).includes('Серверный'));
    await ctx.close();return {photoBlobs:blobCount,collections:Object.keys(state.files),commits:commits.size};
  });
})().catch(error=>{results.fatal=error.stack;process.exitCode=1;console.error(error);}).finally(async()=>{
  await browser?.close();server.close();backend.kill();
  fs.writeFileSync(path.join(__dirname,'retest-results/fix-regressions.json'),JSON.stringify(results,null,2));
  console.log(results.checks.map(item=>item.status+' '+item.name).join('\n'));
});
