const fs=require('node:fs'),path=require('node:path'),requireTool=require('./deps.cjs');
const {chromium}=requireTool('playwright'),{start}=require('./server.cjs');
const server=start(4384),base='http://127.0.0.1:4384/3m_music-/',result={};
(async()=>{let browser;try{
browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const context=await browser.newContext();
const pages=[await context.newPage(),await context.newPage()];
for(const page of pages){await page.goto(base+'admin/');await page.locator('#password').fill('6767');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.locator('#teacher-new').click();}
await pages[0].locator('#teacher-editor [name=name]').fill('Преподаватель из вкладки A');await pages[0].getByRole('button',{name:'Сохранить преподавателя',exact:true}).click();await pages[0].waitForFunction(()=>document.querySelector('#teacher-editor').hidden);
await pages[1].locator('#teacher-editor [name=name]').fill('Преподаватель из вкладки B');await pages[1].getByRole('button',{name:'Сохранить преподавателя',exact:true}).click();await pages[1].waitForFunction(()=>document.querySelector('#teacher-editor').hidden);
result.finalTeachers=await pages[1].evaluate(()=>JSON.parse(localStorage.getItem('3m-teachers-demo')).teachers.map(t=>t.name));
result.lostFirstEdit=!result.finalTeachers.includes('Преподаватель из вкладки A');
const publicPage=await context.newPage();await publicPage.goto(base+'teachers.html');await publicPage.screenshot({path:path.join(__dirname,'screenshots/teacher-concurrent-edit-loss.png'),fullPage:true});
}finally{await browser?.close();server.close();fs.writeFileSync(path.join(__dirname,'results/concurrency.json'),JSON.stringify(result,null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
