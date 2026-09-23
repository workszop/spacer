const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{}};vm.createContext(context);
const root=path.join(__dirname,'..');
vm.runInContext(fs.readFileSync(path.join(root,'location-layouts.js'),'utf8'),context);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
vm.runInContext(html.slice(html.indexOf('const PRODUCTS='),html.indexOf('const player='))+';this.products=PRODUCTS;this.scenes=SCENES;',context);
const descStart=html.indexOf('const SCENE_DESC=');
vm.runInContext(html.slice(descStart,html.indexOf('};',descStart)+2)+';this.desc=SCENE_DESC;',context);
const company=context.scenes.company;
assert.ok(company,'company scene exists');
assert.deepEqual(Array.from(company.objects,o=>o.id),['c-kmicic','c-papkin','c-gerwazy','c-zagloba','c-klara']);
assert.deepEqual(Array.from(company.objects,o=>o.product).sort(),Object.keys(context.products).sort(),'every product appears once');
const reference=context.scenes.airport.objects;
for(const o of company.objects){
  const twin=reference.find(r=>r.product===o.product);
  assert.equal(o.type,twin.type,o.id+': same station type as airport');
  assert.deepEqual(Object.keys(o.data).sort(),Object.keys(twin.data).sort(),o.id+': same payload shape as airport');
  assert.ok(!/—/.test(JSON.stringify(o)),o.id+': no em dashes');
}
const all=Object.values(context.scenes).flatMap(s=>s.objects);
for(const o of company.objects)assert.equal(all.filter(x=>x.context===o.context).length,1,o.id+': context is unique');
const gw=company.objects.find(o=>o.product==='gerwazy').data;
assert.match(gw.reg,/NIS2/,'Gerwazy case is NIS2 compliance');
for(const item of gw.ok.concat(gw.gaps))assert.match(item[1],/^NIS2 art\. 2[013]/,'every NIS2 finding cites an article');
const zg=company.objects.find(o=>o.product==='zagloba').data.modes;
assert.deepEqual(Array.from(zg,m=>m.id),['source','process','restricted','none'],'Zagłoba covers product features and internal processes');
assert.ok(context.desc.company,'picker description');
console.log('PASS: company floor has 5 department cases shaped like the other floors');
