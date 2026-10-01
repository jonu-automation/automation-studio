import assert from 'node:assert/strict';
const base = process.env.AUTOMATION_VERIFY_API_URL ?? 'http://127.0.0.1:8080/api';
async function request(route, method='GET', body) {
  const response = await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const text = await response.text();
  assert.ok(response.ok, method+' '+route+' '+response.status+' '+text);
  return text ? JSON.parse(text) : null;
}
const created=[];
const checks=[];
const pass = name => { checks.push(name); console.log('PASS: '+name); };
const node=(id,type,config={})=>({id,type,label:id,x:0,y:0,config});
const edge=(source,target,sourceHandle)=>({id:source+'-'+target,source,target,...(sourceHandle?{sourceHandle}: {})});
try {
  const before=await request('/auth/me');
  const workflow=await request('/workflows','POST',{name:'[verification] Branch execution',nodes:[node('start','manual'),node('condition','if_else',{condition:'input.data.score >= 50'}),node('yes','transform',{code:'const output = { choice: "yes" };'}),node('no','transform',{code:'const output = { choice: "no" };'})],edges:[edge('start','condition'),edge('condition','yes','true'),edge('condition','no','false')]});
  created.push(workflow.id);
  for (const [score,expected,skipped] of [[80,'yes','no'],[20,'no','yes']]) {
    const result=await request('/workflows/'+workflow.id+'/execute','POST',{inputData:{score}});
    assert.equal(result.status,'success');
    assert.equal(result.nodeResults.find(r=>r.nodeId===expected).status,'success');
    assert.equal(result.nodeResults.find(r=>r.nodeId===skipped).status,'skipped');
  }
  const after=await request('/auth/me');
  assert.equal(after.runsThisMonth-before.runsThisMonth,2);
  pass('Conditional true/false routing and execution counters');
  await request('/workflows/'+workflow.id,'PUT',{nodes:[node('replacement','manual')],edges:[]});
  const versions=await request('/workflows/'+workflow.id+'/versions');
  assert.ok(versions.length>=2);
  await request('/workflows/'+workflow.id+'/versions/1/restore','POST',{});
  assert.equal((await request('/workflows/'+workflow.id)).nodes.length,4);
  pass('Workflow version saving and restoration');
  const approvalWorkflow=await request('/workflows','POST',{name:'[verification] Approval resume',nodes:[node('start','manual'),node('approval','approval',{title:'Local verification',approvalMode:'any'}),node('finish','transform',{code:'const output = { finished: true };'})],edges:[edge('start','approval'),edge('approval','finish')]});
  created.push(approvalWorkflow.id);
  const paused=await request('/workflows/'+approvalWorkflow.id+'/execute','POST',{inputData:{}});
  const pending=(await request('/approvals')).find(a=>a.executionId===paused.id);
  assert.ok(pending,'Approval record created');
  await request('/approvals/'+pending.id+'/respond','POST',{decision:'approved',deciderEmail:'owner@localhost'});
  const resumed=await request('/executions/'+paused.id);
  assert.equal(resumed.status,'success');
  assert.equal(resumed.nodeResults.find(r=>r.nodeId==='finish').output.finished,true);
  pass('Human approval pause and resume');
  const pausedAgain=await request('/workflows/'+approvalWorkflow.id+'/execute','POST',{inputData:{}});
  const rejection=(await request('/approvals')).find(a=>a.executionId===pausedAgain.id);
  await request('/approvals/'+rejection.id+'/respond','POST',{decision:'rejected',deciderEmail:'owner@localhost'});
  assert.equal((await request('/executions/'+pausedAgain.id)).status,'rejected');
  pass('Human rejection stops the execution');
  const missing=await request('/workflows','POST',{name:'[verification] Missing integration',nodes:[node('email','email',{to:'example@example.invalid',subject:'No real send'})],edges:[]});
  created.push(missing.id);
  const failed=await request('/workflows/'+missing.id+'/execute','POST',{inputData:{}});
  assert.equal(failed.status,'error');
  pass('Missing integration credentials report a real error');
  const filteredHistory=await request('/executions?workflowId='+workflow.id+'&status=success');
  assert.ok(filteredHistory.length>0);
  assert.ok(filteredHistory.every(e=>e.workflowId===workflow.id && e.status==='success'));
  pass('Execution history combines workflow and status filters');
  const credential=await request('/credentials','POST',{name:'[verification] fake key',credentialType:'resend',data:{apiKey:'fake-test-secret-not-a-provider-key'}});
  try {
    assert.ok(!JSON.stringify(await request('/credentials')).includes('fake-test-secret'));
    assert.ok(!('data' in credential));
  } finally { await request('/credentials/'+credential.id,'DELETE'); }
  pass('Credential creation/listing never returns stored secrets');
  const filter=await request('/workflows','POST',{name:'[verification] Filter skip',nodes:[node('gate','filter',{condition:'input.allowed === true'}),node('next','transform',{code:'const output = { ran: true };'})],edges:[edge('gate','next')]});
  created.push(filter.id);
  const filtered=await request('/workflows/'+filter.id+'/execute','POST',{inputData:{allowed:false}});
  assert.ok(filtered.nodeResults.every(r=>r.status==='skipped'));
  const allowed=await request('/workflows/'+filter.id+'/execute','POST',{inputData:{allowed:true}});
  assert.equal(allowed.nodeResults.find(r=>r.nodeId==='next').output.ran,true);
  pass('Filters block or activate downstream steps');
  const hook=await request('/workflows','POST',{name:'[verification] Webhook',nodes:[node('hook','webhook'),node('result','transform',{code:'const output = { received: input.data.message };'})],edges:[edge('hook','result')]});
  created.push(hook.id);
  assert.equal((await fetch(base+'/webhooks/'+hook.webhookToken,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,409);
  await request('/workflows/'+hook.id+'/toggle','POST',{});
  const hookRun=await request('/webhooks/'+hook.webhookToken,'POST',{message:'portfolio-check'});
  assert.equal(hookRun.outputData.received,'portfolio-check');
  await request('/workflows/'+hook.id+'/toggle','POST',{});
  pass('Inactive webhooks reject requests; active webhooks execute');
  const stream=await fetch(base+'/executions/'+hookRun.id+'/stream',{signal:AbortSignal.timeout(5000)});
  assert.ok(stream.headers.get('content-type').includes('text/event-stream'));
  assert.ok((await stream.text()).includes('workflow:done'));
  pass('Execution event stream replays completed node activity');
  const imported=await request('/workflows/import','POST',{name:'[verification] Import',nodes:[node('start','manual',{apiKey:'must-be-removed'})],edges:[]});
  created.push(imported.id);
  assert.equal(imported.nodes[0].config.apiKey,undefined);
  assert.equal(imported.importWarnings.credentialsStripped,true);
  pass('Native workflow import strips direct credential fields');
  for (const type of ['database_query','not_a_real_node']) {
    const unsupported=await request('/workflows','POST',{name:'[verification] Unsupported '+type,nodes:[node('bad',type)],edges:[]});
    created.push(unsupported.id);
    assert.equal((await request('/workflows/'+unsupported.id+'/execute','POST',{inputData:{}})).status,'error');
  }
  pass('Unimplemented and unknown nodes fail explicitly');
  const rpc=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  assert.equal(rpc.status,401);
  pass('MCP endpoint rejects unauthenticated calls');
  const priorKey=(await request('/mcp/key')).key;
  const key=priorKey??(await request('/mcp/key','POST',{})).key;
  try {
    async function callRpc(method,params={}) {
      const response=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(30000)});
      assert.ok(response.ok);
      const data=await response.json();
      assert.ok(!data.error,JSON.stringify(data.error));
      return data.result;
    }
    assert.equal((await callRpc('initialize')).serverInfo.name,'automation-studio');
    const tools=(await callRpc('tools/list')).tools;
    const tool=tools.find(t=>t.name.startsWith('workflow_'+workflow.id+'_'));
    assert.ok(tool);
    const run=await callRpc('tools/call',{name:tool.name,arguments:{inputData:{score:80}}});
    assert.equal(JSON.parse(run.content[0].text).status,'success');
    pass('Authenticated MCP initialize/list/call over HTTP JSON-RPC');
  } finally { if(!priorKey) await request('/mcp/key','DELETE'); }
  const http=await request('/workflows','POST',{name:'[verification] HTTP request',nodes:[node('request','http_request',{method:'GET',url:base+'/healthz'})],edges:[]});
  created.push(http.id);
  const httpResult=await request('/workflows/'+http.id+'/execute','POST',{inputData:{}});
  assert.equal(httpResult.status,'success');
  pass('HTTP request node receives a real local API response');
  const scheduled=await request('/workflows','POST',{name:'[verification] Scheduled run',nodes:[node('timer','schedule',{cron:'*/2 * * * * *'}),node('finish','transform',{code:'const output = { scheduled: true };'})],edges:[edge('timer','finish')]});
  created.push(scheduled.id);
  await request('/workflows/'+scheduled.id+'/toggle','POST',{});
  try {
    let complete;
    const deadline=Date.now()+8000;
    while(Date.now()<deadline) {
      complete=(await request('/executions?workflowId='+scheduled.id)).find(e=>e.status==='success');
      if(complete) break;
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    assert.ok(complete,'Cron scheduler should run the active workflow');
    assert.equal(complete.outputData.scheduled,true);
  } finally { await request('/workflows/'+scheduled.id+'/toggle','POST',{}); }
  pass('Cron scheduler executes an activated workflow');
  const hostile=await fetch(base+'/auth/me',{headers:{Origin:'https://untrusted.example'}});
  assert.equal(hostile.status,403);
  pass('Foreign-origin requests are rejected in local mode');
  const leadTemplate=await request('/templates/portfolio-lead-routing/use','POST',{});
  created.push(leadTemplate.id);
  const leadDemo=await request('/workflows/'+leadTemplate.id+'/execute','POST',{inputData:{}});
  assert.equal(leadDemo.status,'success');
  assert.equal(leadDemo.outputData.route,'qualified');
  const editedLead=await request('/workflows/'+leadTemplate.id);
  editedLead.nodes.find(n=>n.id==='lead').config.code='const output = { name: "Alex", score: 20 };';
  await request('/workflows/'+leadTemplate.id,'PUT',{nodes:editedLead.nodes,edges:editedLead.edges});
  const alternateDemo=await request('/workflows/'+leadTemplate.id+'/execute','POST',{inputData:{}});
  assert.equal(alternateDemo.outputData.route,'nurture');
  pass('Local lead template executes both routes after editing');
  const reportTemplate=await request('/templates/portfolio-approval/use','POST',{});
  created.push(reportTemplate.id);
  const reportPause=await request('/workflows/'+reportTemplate.id+'/execute','POST',{inputData:{}});
  assert.equal(reportPause.status,'waiting_approval');
  const reportDecision=(await request('/approvals')).find(a=>a.executionId===reportPause.id);
  await request('/approvals/'+reportDecision.id+'/respond','POST',{decision:'approved',deciderEmail:'owner@localhost'});
  const reportDone=await request('/executions/'+reportPause.id);
  assert.equal(reportDone.status,'success');
  assert.equal(reportDone.outputData.approved,true);
  assert.equal(reportDone.outputData.report.leads,12);
  pass('Local approval template preserves report data after resume');
  console.log('Completed '+checks.length+' integration checks.');
} finally {
  for (const id of created) await request('/workflows/'+id,'DELETE');
}
