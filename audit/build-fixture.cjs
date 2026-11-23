const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
(async()=>{
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'3m-build-audit-')),result={};
try {
await fs.cp(path.join(__dirname,'../public'),path.join(temp,'public'),{recursive:true});
await fs.cp(path.join(__dirname,'../scripts'),path.join(temp,'scripts'),{recursive:true});
await fs.mkdir(path.join(temp,'public/assets/uploads'),{recursive:true});
await fs.copyFile(path.join(temp,'public/assets/mikhail-grishin.webp'),path.join(temp,'public/assets/uploads/audit.webp'));
const artist={id:'audit-static',name:'Группа <аудит>',description:'Описание "тест"',photo:'assets/uploads/audit.webp',photos:[],links:[{label:'Музыка',url:'https://example.com/listen'}]};
await fs.writeFile(path.join(temp,'public/data/artists.json'),JSON.stringify({artists:[artist]}));
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:temp});
const html=await fs.readFile(path.join(temp,'dist/artists/audit-static.html'),'utf8');
await fs.writeFile(path.join(__dirname,'results/generated-artist.html'),html);
result.validBuild=true;result.escapedName=html.includes('Группа &lt;аудит&gt;');result.relativeHomeLink=html.includes('href="../index.html"');
artist.links[0].url='javascript:alert(1)';
await fs.writeFile(path.join(temp,'public/data/artists.json'),JSON.stringify({artists:[artist]}));
try {execFileSync(process.execPath,['scripts/build.mjs'],{cwd:temp,stdio:'pipe'});result.unsafeUrlRejected=false;}catch{result.unsafeUrlRejected=true;}
}finally {await fs.rm(temp,{recursive:true,force:true});await fs.writeFile(path.join(__dirname,'results/build-fixture.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
