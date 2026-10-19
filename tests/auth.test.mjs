import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import handler from '../api/index.mjs';
const long='a'.repeat(43), short='TOC-ABCD-EFGH-JKLM';
const hash=x=>createHash('sha256').update(x).digest('hex');
process.env.AIRTABLE_API_KEY='test';process.env.CHALLENGE_AIRTABLE_BASE_ID='test-challenge';process.env.AIRTABLE_BASE_ID='test-world';
let active=true, calls=[];
global.fetch=async url=>{const u=new URL(url);calls.push(u);const filter=u.searchParams.get('filterByFormula')||'';let records=[];
 if(u.pathname.includes('test-challenge')) {
  const ok=filter.includes(hash(long))||filter.includes(hash(short));
  if(ok)records=[{id:'applicant',fields:{'TOC월드 입주 코드 해시':hash(long),'TOC월드 간편 코드 해시':hash(short),'진행 상태':active?'접수':'취소'}}];
 }else if(decodeURI(u.pathname).endsWith('이웃')) {
  if(filter.includes('applicant'))records=[{id:'resident',fields:{'신청 레코드 ID':'applicant','이웃 ID':'N001','집 ID':'T-H001','별명':'주민','아바타':'🌱'}}];
 }
 return new Response(JSON.stringify({records}),{status:200});
};
async function request(op,method='GET',body,headers={}){
 const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url=`/api?op=${op}`;req.method=method;req.headers=headers;
 let result;const res={setHeader(){},end(text){result={status:this.statusCode,body:JSON.parse(text)}}};await handler(req,res);return result;
}
test('unauthenticated map request denied before DB reads',async()=>{calls=[];assert.equal((await request('state')).status,401);assert.equal(calls.length,0)});
test('invalid code cannot enter',async()=>{assert.equal((await request('enter','POST',{code:'TOC-BAD'})).status,403)});
test('old long code and new short code both enter',async()=>{for(const code of [long,short,short.toLowerCase()]){const r=await request('enter','POST',{code});assert.equal(r.status,200);assert.equal(r.body.resident.houseId,'T-H001');assert.equal(JSON.stringify(r.body).includes('해시'),false)}});
test('short code uses separate hash field',async()=>{calls=[];await request('enter','POST',{code:short});assert.match(calls[0].searchParams.get('filterByFormula'),/간편 코드 해시/)});
test('home is scoped to authenticated applicant resident',async()=>{calls=[];assert.equal((await request('home','GET',null,{'x-world-code':short})).status,200);const privateCalls=calls.filter(u=>/풀이|질문/.test(decodeURI(u.pathname)));assert.equal(privateCalls.length,2);for(const u of privateCalls)assert.match(u.searchParams.get('filterByFormula'),/N001/)});
test('cancelled application denied on entry and map',async()=>{active=false;assert.equal((await request('enter','POST',{code:short})).status,403);assert.equal((await request('state','GET',null,{'x-world-code':short})).status,403);active=true});
