const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const context={window:{}};vm.createContext(context);
const root=path.join(__dirname,'..');
vm.runInContext(fs.readFileSync(path.join(root,'location-layouts.js'),'utf8'),context);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
vm.runInContext(html.slice(html.indexOf('const PRODUCTS='),html.indexOf('const player='))+';this.products=PRODUCTS;this.scenes=SCENES;',context);
assert.equal(Object.keys(context.products).length,4);
assert.equal(context.products.zagloba.sourceUrl,'https://quanticalab.ai/zagloba_website.html');
const questions=new Set();
for(const [id,scene] of Object.entries(context.scenes)){
  assert.equal(scene.objects.length,4);
  const object=scene.objects.find(o=>o.product==='zagloba');
  assert.ok(object,`${id}: knowledge workstation`);
  assert.equal(object.type,'knowledge');
  assert.deepEqual(Array.from(object.data.modes,m=>m.id),['source','restricted','none']);
  const [source,restricted,none]=object.data.modes;
  assert.ok(source.sources.length>=1&&source.sources.every(s=>s.title&&s.excerpt),'answer can be verified in source excerpts');
  assert.ok(restricted.restricted&&restricted.sources.length===0,'restricted source is not exposed');
  assert.ok(none.abstain&&none.sources.length===0,'no coverage means no invented citations');
  assert.ok(object.data.notice.includes('przykładowe'),'illustrative-fixture disclosure');
  questions.add(source.question);
}
assert.equal(questions.size,3,'context-specific knowledge questions');
const originalProducts=Object.fromEntries(Object.entries(context.products).filter(([key])=>key!=='zagloba'));
const originalObjects=Object.values(context.scenes).flatMap(s=>s.objects.filter(o=>o.product!=='zagloba').map(({id,label,context,data})=>({id,label,context,data})));
const digest=crypto.createHash('sha256').update(JSON.stringify({products:originalProducts,objects:originalObjects})).digest('hex');
assert.equal(digest,'77f34f3d31a69cb33f1e065a8b6987ab371a773e5433104a9807e17ccf012d95','original nine demo payloads and product copy are immutable');
console.log('PASS: 12 demos, knowledge variants, source safety, unique contexts, original copy SHA-256');
