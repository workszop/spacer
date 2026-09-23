const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../location-layouts.js'),'utf8'),context);
const scenes=Object.fromEntries(['airport','bank','office'].map(id=>[id,{objects:['papkin','kmicic','gerwazy','zagloba','klara'].map(product=>({product,data:{immutable:'source'},context:'original'}))}]));
context.window.LocationLayouts.apply(scenes);
assert.equal(new Set(Object.values(scenes).map(sc=>sc.identity)).size,3);
for(const [id,scene] of Object.entries(scenes)){
  assert.ok(scene.landmarks.length>=2,id+' recognizable landmarks');
  assert.ok(scene.blocks.length+scene.props.length<=7,id+' decorative clutter budget');
  assert.equal(scene.objects.length,5);
  for(let i=0;i<scene.objects.length;i++)for(let j=i+1;j<scene.objects.length;j++){const a=scene.objects[i],b=scene.objects[j];assert.ok(Math.abs(a.x-b.x)*2>=a.w+b.w+20||Math.abs(a.y-b.y)*2>=a.h+b.h+20,`${id}: ${a.product} and ${b.product} stations keep a walkway`);}
  assert.ok(scene.objects.every(o=>o.x>=34&&o.x<=1046&&o.y>=34&&o.y<=626));
  assert.ok(scene.objects.every(o=>o.data.immutable==='source'&&o.context==='original'),'content untouched');
}
assert.ok(scenes.airport.landmarks.includes('aircraft'));
assert.ok(scenes.bank.landmarks.includes('vault'));
assert.ok(scenes.office.landmarks.includes('civic-facade'));
console.log('PASS: distinct identities, landmark contracts, clutter budgets, five separated stations, immutable content');
