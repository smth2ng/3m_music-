const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
const origin='http://127.0.0.1:4385',password=randomBytes(24).toString('hex');
const server=spawn(process.execPath,['server.mjs'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'4385',ADMIN_PASSWORD:password,ADMIN_GITHUB_TOKEN:'audit-placeholder-unused',ADMIN_ORIGIN:origin}});
const results={scope:'Local Node server only, dummy credential, no GitHub write or external API request'};
(async()=>{try{
for(let i=0;i<50;i++){try{await fetch(origin);break;}catch{await new Promise(r=>setTimeout(r,100));}}
const post=(endpoint,payload,cookie,source=origin)=>fetch(origin+endpoint,{method:'POST',headers:{Origin:source,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(payload)});
results.unauthenticated=(await fetch(origin+'/api/admin/github/git/ref/heads/main')).status;
results.badOrigin=(await post('/api/admin/login',{password},null,'https://other.example')).status;
results.wrongPassword=(await post('/api/admin/login',{password:'incorrect'})).status;
const login=await post('/api/admin/login',{password});results.correctPassword=login.status;
const cookie=login.headers.get('set-cookie');results.cookie={httpOnly:cookie.includes('HttpOnly'),sameSiteStrict:cookie.includes('SameSite=Strict'),pathScoped:cookie.includes('Path=/api/admin'),secure:cookie.includes('; Secure'),localHttp:true};
results.unapprovedRoute=(await fetch(origin+'/api/admin/github/unapproved',{headers:{Cookie:cookie}})).status;
results.logout=(await post('/api/admin/logout',{},cookie)).status;
results.expiredCookie=(await fetch(origin+'/api/admin/github/git/ref/heads/main',{headers:{Cookie:cookie}})).status;
results.malformedJson=(await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{'})).status;
const response=await fetch(origin+'/../package.json');results.traversalStatus=response.status;results.sourceExposed=(await response.text()).includes('"devDependencies"');
}finally{server.kill();fs.writeFileSync(path.join(__dirname,'results/security.json'),JSON.stringify(results,null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
