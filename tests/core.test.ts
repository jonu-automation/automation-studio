import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutionOrder, inputForNode } from '../artifacts/api-server/src/lib/graph.ts';
import { sealCredential, openCredential } from '../artifacts/api-server/src/lib/vault.ts';
import { evaluate } from '../artifacts/api-server/src/lib/evaluate.ts';
const node = (id: string, type = 'transform') => ({ id, type, label: id, x: 0, y: 0 });
test('DAG joins run after every predecessor', () => {
  const nodes = ['a','b','c','d'].map(id=>node(id));
  const edges = [{id:'ab',source:'a',target:'b'},{id:'ad',source:'a',target:'d'},{id:'dc',source:'d',target:'c'},{id:'bc',source:'b',target:'c'}];
  const order = buildExecutionOrder(nodes,edges).map(n=>n.id);
  assert.ok(order.indexOf('c') > order.indexOf('b'));
  assert.ok(order.indexOf('c') > order.indexOf('d'));
  assert.throws(()=>buildExecutionOrder(nodes,[...edges,{id:'ca',source:'c',target:'a'}]),/cycle/);
});
test('Only the chosen branch supplies data, and skipped nodes do not activate downstream actions',()=> {
  const nodes = [node('if','if_else'),node('yes'),node('no'),node('after')];
  const edges = [{id:'y',source:'if',target:'yes',sourceHandle:'true'},{id:'n',source:'if',target:'no',sourceHandle:'false'},{id:'a',source:'no',target:'after'}];
  const outputs = new Map([['if',{branch:'true',value:42}]]);
  assert.equal(inputForNode(nodes[1],nodes,edges,outputs,{} )?.value,42);
  assert.equal(inputForNode(nodes[2],nodes,edges,outputs,{}),null);
  assert.equal(inputForNode(nodes[3],nodes,edges,outputs,{}),null);
});
test('Expressions transform JSON without access to server process or infinite execution',async()=> {
  assert.deepEqual(await evaluate('const output = { doubled: input.value * 2 };',{value:21}),{doubled:42});
  assert.deepEqual(await evaluate('input.value === 21',{value:21},true),{result:true});
  await assert.rejects(evaluate('const output = process.env;',{}),/process is not defined/);
  await assert.rejects(evaluate('while (true) {}',{}),/timed out/);
  await assert.rejects(evaluate('const output = input.constructor.constructor("return process")();',{}),/Code generation/);
});

test('Stored integration secrets are encrypted and reject tampering',async()=> {
  const original = process.env.CREDENTIAL_ENCRYPTION_KEY;
  process.env.CREDENTIAL_ENCRYPTION_KEY = '42'.repeat(32);
  try {
    const sealed = await sealCredential({apiKey:'fake-key-for-verification'});
    assert.ok(!JSON.stringify(sealed).includes('fake-key-for-verification'));
    assert.deepEqual(await openCredential(sealed),{apiKey:'fake-key-for-verification'});
    await assert.rejects(openCredential({...sealed,tag:Buffer.alloc(16).toString('base64')}));
    await assert.rejects(openCredential({apiKey:'legacy-plaintext'}),/Legacy plaintext/);
  } finally {
    if (original === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY; else process.env.CREDENTIAL_ENCRYPTION_KEY = original;
  }
});
