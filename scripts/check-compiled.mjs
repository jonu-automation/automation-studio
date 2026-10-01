import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=await mkdtemp(path.join(tmpdir(),'automation-compiled-'));
const port=await new Promise((resolve,reject)=>{
  const probe=net.createServer();
  probe.on('error',reject);
  probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(()=>resolve(port));});
});
const child=spawn(process.execPath,['artifacts/api-server/dist/index.mjs'],{
  cwd:root,windowsHide:true,stdio:'inherit',
  env:{...process.env,LOCAL_MODE:'true',NODE_ENV:'development',PORT:String(port),LOCAL_DATA_DIR:path.join(directory,'data'),MIGRATIONS_DIR:path.join(root,'lib/db/migrations')},
});
let startupError;
child.on('error',error=>{startupError=error;});
const closed=new Promise(resolve=>child.on('close',resolve));
const base='http://127.0.0.1:'+port+'/api';
async function request(route,body) {
  const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  assert.ok(response.ok,route+' '+response.status);
  return response.json();
}
try {
  let ready=false;
  const deadline=Date.now()+30000;
  while(Date.now()<deadline) {
    if(startupError) throw startupError;
    if(child.exitCode!==null) throw new Error('Compiled server exited before becoming ready.');
    try { await request('/healthz');ready=true;break; } catch {}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  assert.ok(ready,'Compiled API should become ready');
  const workflow=await request('/workflows',{name:'Compiled API verification',nodes:[{id:'code',type:'transform',label:'Transform',x:0,y:0,config:{code:'const output = { compiled: true, doubled: input.value * 2 };'}}],edges:[]});
  const execution=await request('/workflows/'+workflow.id+'/execute',{inputData:{value:21}});
  assert.equal(execution.status,'success');
  assert.equal(execution.outputData.doubled,42);
  await new Promise((resolve,reject)=>{
    const suite=spawn(process.execPath,['scripts/smoke-local.mjs'],{
      cwd:root,stdio:'inherit',windowsHide:true,
      env:{...process.env,AUTOMATION_VERIFY_API_URL:base},
    });
    suite.on('error',reject);
    suite.on('exit',code=>code===0?resolve():reject(new Error('Compiled API integration suite failed: '+code)));
  });
  console.log('PASS: compiled API startup, fresh migrations, workflow save and actual code execution.');
} finally {
  child.kill();
  await closed;
  const resolved=path.resolve(directory);
  if(path.dirname(resolved)!==path.resolve(tmpdir()) || !path.basename(resolved).startsWith('automation-compiled-')) throw new Error('Unexpected temporary directory; cleanup refused.');
  await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
