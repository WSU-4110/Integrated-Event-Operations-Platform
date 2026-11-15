import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, assertLocalDatabase } from './metrics.mjs';
test('nearest-rank p95 includes slow requests and failures fail the gate', () => {
  assert.deepEqual(summarize(Array.from({length:100}, (_,i)=>({ms:i+1,ok:true})), 95),
    {requests:100,failures:0,p95_ms:95,max_ms:100,limit_ms:95,passed:true});
  assert.equal(summarize([{ms:1,ok:false}],2000).passed,false);
  assert.equal(summarize([],2000).passed,false);
  assert.equal(summarize([{ms:2001,ok:true}],2000).passed,false);
});
test('destructive seed only accepts explicitly acknowledged loopback database', () => {
  for(const url of ['postgres://u@production.example/db','postgres://u@127.0.0.1.evil/db'])
    assert.throws(()=>assertLocalDatabase(url,'yes'));
  assert.throws(()=>assertLocalDatabase('postgres://u@localhost/db',''));
  assert.doesNotThrow(()=>assertLocalDatabase('postgres://u@127.0.0.1/test','yes'));
});
test('refuses URL parameters that override the apparent loopback database host', () => {
  for(const suffix of ['?host=production.example','?hostaddr=203.0.113.1','?sslmode=require','#ignored'])
    assert.throws(()=>assertLocalDatabase('postgres://u@127.0.0.1/test'+suffix,'yes'));
});
