const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const requireTool = require('./deps.cjs');
const { chromium } = requireTool('playwright');
const { start } = require('./server.cjs');
const server = start(4381);
const base = 'http://127.0.0.1:4381/3m_music-/';
const out = path.join(__dirname,'results');
const lighthouseCli = path.join(path.dirname(requireTool.resolve('lighthouse/package.json')), 'cli/index.js');
let results = {labOnly:true,base,runs:[],custom:[],notes:['Local server without CDN. External map is blocked explicitly in Lighthouse and Playwright; actual map latency/bytes excluded. No field INP or CrUX measurements. Single run per route/profile.']};
if (process.env.AUDIT_PERF_CUSTOM_ONLY) { results = JSON.parse(fs.readFileSync(path.join(out,'performance-summary.json'),'utf8')); results.custom = []; delete results.fatal; }
function runProcess(args) {
  return new Promise(resolve=>{
    const child=spawn(process.execPath,args,{env:{...process.env,CHROME_PATH:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}});
    let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
    child.on('exit',code=>resolve({code,log}));
  });
}
(async()=>{
  if (!process.env.AUDIT_PERF_CUSTOM_ONLY) for(const file of ['index.html','artists.html','teachers.html','contacts.html','admin/']){
    for(const profile of ['mobile','desktop']){
      const slug=file.replaceAll('/','').replace('.html','');
      const output=path.join(out,'lighthouse-'+slug+'-'+profile+'.json');
      const args=[lighthouseCli,base+file,'--output=json','--output-path='+output,'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--only-categories=performance,accessibility,best-practices,seo','--blocked-url-patterns=https://yandex.ru/*','--quiet'];
      if(profile==='desktop')args.push('--preset=desktop');
      const processResult=await runProcess(args);
      fs.writeFileSync(path.join(out,'lighthouse-'+slug+'-'+profile+'.log'),processResult.log);
      if(processResult.code!==0){results.runs.push({file,profile,error:processResult.log.slice(-1500)});}
      else{
        const lhr=JSON.parse(fs.readFileSync(output,'utf8'));
        const keys=['first-contentful-paint','largest-contentful-paint','cumulative-layout-shift','total-blocking-time','speed-index','interactive','total-byte-weight','network-requests','unused-css-rules','unused-javascript','render-blocking-resources','font-display','uses-long-cache-ttl','errors-in-console','document-title','meta-description'];
        results.runs.push({file,profile,categories:Object.fromEntries(Object.entries(lhr.categories).map(([k,v])=>[k,v.score])),audits:Object.fromEntries(keys.map(k=>[k,lhr.audits[k]])),runtimeError:lhr.runtimeError,warnings:lhr.runWarnings,environment:lhr.environment,configSettings:lhr.configSettings,failedAudits:Object.values(lhr.audits).filter(a=>a.score!==null&&a.score<1).map(a=>({id:a.id,score:a.score,title:a.title,displayValue:a.displayValue}))});
      }
      fs.writeFileSync(path.join(out,'performance-summary.json'),JSON.stringify(results,null,2));
      console.log('Lighthouse '+file+' '+profile+' exit '+processResult.code);
    }
  }
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    for(const mode of ['desktop','slow-mobile','slow-mobile-12-releases']){
      const context=await browser.newContext({viewport:mode==='desktop'?{width:1440,height:900}:{width:390,height:844}});
      await context.route('https://yandex.ru/**',r=>r.abort('blockedbyclient'));
      const page=await context.newPage();
      const cdp=await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      if(mode!=='desktop'){
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
        await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
      }
      if(mode.endsWith('12-releases')){
        await page.goto(base,{waitUntil:'domcontentloaded'});
        const image='data:image/webp;base64,'+fs.readFileSync(path.join(__dirname,'../public/assets/mikhail-grishin.webp')).toString('base64');
        await page.evaluate(image=>localStorage.setItem('3m-releases-demo',JSON.stringify({releases:Array.from({length:12},(_,i)=>({id:'r'+i,title:'Тестовый релиз '+i,artistId:'artist-1',artistName:'Артист 1',photo:image,url:'https://example.com/'+i}))})),image);
      }
      await page.addInitScript(()=>{
        window.auditMetrics={lcp:0,cls:0,events:[]};
        new PerformanceObserver(list=>{for(const entry of list.getEntries())window.auditMetrics.lcp=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.auditMetrics.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});
        new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.interactionId)window.auditMetrics.events.push({name:entry.name,duration:entry.duration,interactionId:entry.interactionId});}).observe({type:'event',durationThreshold:16,buffered:true});
      });
      await page.coverage.startJSCoverage();
      await page.coverage.startCSSCoverage();
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(mode==='desktop'?1500:6000);
      await page.locator('[data-contact]').click();
      await page.keyboard.press('Escape');
      const metrics=await page.evaluate(()=>({
        ...window.auditMetrics,
        paints:performance.getEntriesByType('paint').map(e=>({name:e.name,startTime:e.startTime})),
        navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),
        resources:performance.getEntriesByType('resource').map(e=>({name:e.name,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize,duration:e.duration,initiatorType:e.initiatorType}))
      }));
      for(const selector of ['#about','#releases','#services','#contacts']){await page.locator(selector).scrollIntoViewIfNeeded();await page.waitForTimeout(300);}
      const js=await page.coverage.stopJSCoverage(),css=await page.coverage.stopCSSCoverage();
      fs.writeFileSync(path.join(out,'coverage-'+mode+'.json'),JSON.stringify({js,css},null,2));
      const coverage=entries=>entries.map(e=>({url:e.url,totalBytes:typeof (e.text ?? e.source) === 'string' ? Buffer.byteLength(e.text ?? e.source) : null,usedCharacters:e.ranges ? e.ranges.reduce((sum,r)=>sum+r.end-r.start,0) : null,functions:e.functions?.length,totalCharacters:(e.text ?? e.source)?.length ?? null}));
      const first=metrics.resources.reduce((sum,r)=>sum+r.transferSize,0);
      results.custom.push({mode,cpuRate:mode==='desktop'?1:4,network:mode==='desktop'?'local unthrottled':{latencyMs:150,downloadBytesPerSecond:200000,uploadBytesPerSecond:93750},metrics,resourceTransferBytes:first,coverage:{js:coverage(js),css:coverage(css)}});
      await page.screenshot({path:path.join(__dirname,'screenshots/performance-'+mode+'.png'),fullPage:true});
      await context.close();
      fs.writeFileSync(path.join(out,'performance-summary.json'),JSON.stringify(results,null,2));
    }
  }finally{await browser.close();}
})().catch(error=>{results.fatal=error.stack;console.error(error);process.exitCode=1;}).finally(()=>{fs.writeFileSync(path.join(out,'performance-summary.json'),JSON.stringify(results,null,2));server.close();});
