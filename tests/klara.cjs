const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{}};vm.createContext(context);
const root=path.join(__dirname,'..');
vm.runInContext(fs.readFileSync(path.join(root,'location-layouts.js'),'utf8'),context);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
vm.runInContext(html.slice(html.indexOf('const PRODUCTS='),html.indexOf('const player='))+';this.products=PRODUCTS;this.scenes=SCENES;',context);
const klara=context.products.klara;
assert.equal(klara.sourceUrl,'https://quanticalab.ai/klara_website.html');
assert.equal(klara.demo,'router');
assert.ok(klara.short&&klara.short!=='K','marker letter distinct from Kmicic');
const prompts=new Set();
for(const [id,scene] of Object.entries(context.scenes)){
  const object=scene.objects.find(o=>o.product==='klara');
  assert.ok(object,`${id}: chat workstation`);
  assert.equal(object.type,'chat');
  assert.ok(Number.isFinite(object.x)&&Number.isFinite(object.y),`${id}: placed by the shared layout`);
  assert.deepEqual(Array.from(object.data.modes,m=>m.id),['sensitive','routine','complex']);
  for(const mode of object.data.modes){
    assert.ok(['local','external'].includes(mode.target),`${id}/${mode.id}: known route`);
    // privacy invariant: a prompt with protected data is never routed outside the organisation
    if(mode.sensitive.length)assert.equal(mode.target,'local',`${id}/${mode.id}: protected data stays local`);
    for(const item of mode.sensitive)assert.ok(mode.prompt.includes(item.text)&&item.kind,`${id}/${mode.id}: detected fragment "${item.text}" is in the prompt`);
    for(const item of mode.sensitive)assert.ok(!mode.answer.includes(item.text),`${id}/${mode.id}: answer does not echo "${item.text}"`);
    assert.ok(mode.answer&&mode.badge&&mode.meta&&mode.complexity,`${id}/${mode.id}: complete copy`);
    assert.ok(!/—/.test(mode.prompt+mode.answer+mode.meta),`${id}/${mode.id}: no em dashes`);
    prompts.add(mode.prompt);
  }
  const [sensitive,routine,complex]=object.data.modes;
  assert.ok(sensitive.sensitive.length>=2,'sensitive scenario shows several kinds of protected data');
  assert.equal(routine.target,'local','routine work stays on the cheaper local model');
  assert.equal(complex.target,'external','complex public-data work may use an external model');
  assert.ok(object.data.notice.includes('przykładowe'),'illustrative-fixture disclosure');
}
assert.equal(prompts.size,12,'context-specific prompts per location');
console.log('PASS: Klara in 4 locations, privacy routing invariant, masked data never echoed, unique prompts');
