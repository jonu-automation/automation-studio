import { readFile } from 'node:fs/promises';
const base='http://127.0.0.1:8080/api';
async function request(route,method='GET',body) {
 const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok) throw new Error(method+' '+route+' '+response.status+' '+await response.text());
 return response.json();
}
const list=await request('/workflows');
const existing=Array.isArray(list)?list:list.workflows;
for(const file of ['lead-qualification.json','report-approval.json']) {
 const data=JSON.parse(await readFile(new URL('../examples/'+file,import.meta.url),'utf8'));
 const present=existing.find(w=>w.name===data.name);
 if(present) { console.log('Already available: '+data.name+' /workflows/'+present.id); continue; }
 const created=await request('/workflows','POST',data);
 console.log('Added '+created.name+' /workflows/'+created.id);
}
