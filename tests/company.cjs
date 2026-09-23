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
// ─── review fixes ───
const productCount=Object.keys(context.products).length;
const doneStart=html.indexOf('id="doneOv"'),doneCard=html.slice(doneStart,html.indexOf('class="acts"',doneStart));
assert.match(doneCard,/data-count="products" data-form="ratio"/,'done card count is filled from PRODUCTS');
const zgProduct=zg.find(m=>m.id==='source'),zgExcerpts=zgProduct.sources.map(s=>s.excerpt).join(' ');
for(const figure of zgProduct.answer.match(/\d+(?:,\d+)?\s?(?:kN|°C)/g)||[])assert.ok(zgExcerpts.includes(figure.replace(/^-/,'')),`Zagłoba figure "${figure}" is stated in a source excerpt`);
assert.ok(!/nacisk/.test(zgProduct.answer),'BCT is crush resistance, not a permissible load');
const art23=gw.gaps.find(g=>/art\. 23/.test(g[1]));
assert.match(art23[0],/klient/,'art. 23 duty is framed as a requirement passed down by the client');
console.log('PASS: review fixes – done card count, grounded Zagłoba figures, NIS2 art. 23 framing');
// ─── zones and warehouse racks ───
const stationLabels=company.objects.map(o=>o.label.toLowerCase());
for(const zone of company.zones)assert.ok(!stationLabels.includes(zone.t.toLowerCase()),`zone "${zone.t}" does not repeat a station label`);
for(const product of ['gerwazy','klara']){
  const o=company.objects.find(x=>x.product===product);
  assert.ok(company.zones.some(z=>Math.hypot(z.x-o.x,z.y-o.y)<=220),`${product} stands in a labelled zone of its own department`);
}
const world=fs.readFileSync(path.join(root,'game-world.js'),'utf8');
const rack3d=world.slice(world.indexOf("p.kind==='racks'"),world.indexOf("p.kind==='pallet'"));
assert.ok(!/shelf\(/.test(rack3d),'3D racks are pallet racking, not office bookshelves');
assert.match(rack3d,/rackBeam/,'3D racks have coloured load beams');
const rack2d=html.slice(html.indexOf("b.kind==='racks'"),html.indexOf("b.kind==='plant'"));
assert.match(rack2d,/C\.rackBeam/,'canvas racks have the same load beams');
console.log('PASS: distinct zone labels, IT/HR zone, pallet racking in 3D and canvas');
// ─── counts follow the data (review 2026-09-23) ───
const helpersStart=html.indexOf('const NUM_WORDS=');
vm.runInContext(html.slice(helpersStart,html.indexOf('function fillCounts(',helpersStart))+';this.countPhrase=countPhrase;',context);
const {countPhrase}=context,sceneCount=Object.keys(context.scenes).length;
assert.equal(countPhrase(5,'gen','produkt'),'pięciu produktów');assert.equal(countPhrase(5,'nom','produkt'),'pięć produktów');
assert.equal(countPhrase(4,'nom','produkt'),'cztery produkty');assert.equal(countPhrase(4,'gen'),'czterech');assert.equal(countPhrase(6,'ratio'),'6/6');
// the static fallback text inside every count span already matches the data, so there is no flash of a stale number
for(const m of html.matchAll(/<span data-count="(products|scenes)" data-form="([a-z]+)"(?: data-noun="([a-z]+)")?(?: data-cap="true")?>([^<]*)<\/span>/g)){
  const n=m[1]==='scenes'?sceneCount:productCount;
  assert.equal(m[4].toLowerCase(),countPhrase(n,m[2],m[3]),`count span "${m[4]}" matches ${n} ${m[1]}`);
}
const copy=html.slice(html.indexOf('id="pickerOv"'),html.indexOf('<script'));
for(const word of ['pięciu','Pięć','czterech','cztery','5/5','4/4'])assert.ok(!new RegExp('>[^<]*'+word).test(copy.replace(/<span data-count[^>]*>[^<]*<\/span>/g,'')),`"${word}" is not hard-coded outside a count span`);
const pickerStart=html.indexOf('function buildPicker('),picker=html.slice(pickerStart,pickerStart+400);
assert.ok(!/\['airport'/.test(picker)&&/Object\.entries\(SCENES\)/.test(picker),'picker lists every scene in SCENES');
console.log('PASS: product/location counts and the picker follow PRODUCTS and SCENES');
// ─── 3D and canvas consistency (review 2026-09-23) ───
const sign=world.match(/plaque\('FALKARTON[^']*',[\d.]+,[\d.]+,([\d.]+)/);
assert.ok(Number(sign[1])>=.22,'company sign sits in front of the window glass (front face z=.20)');
assert.match(rack3d,/'wood',level\)/,'3D pallet decks rest directly on the beam tops');
assert.ok(company.blocks.some(b=>b.kind==='pallet')&&!company.props.some(p=>p.kind==='pallet'),'warehouse pallet is a collidable block');
for(const [id,sc] of Object.entries(context.scenes)){
  assert.ok(sc.counterColor,id+': layout names its counter colour');
  assert.ok(world.includes('--world-'+sc.counterColor+':')&&world.includes("'"+sc.counterColor+"'"),id+': counter colour is a loaded world token');
}
assert.ok(!/currentScene\.identity==='financial-lobby'\?'wood'/.test(world),'counter colour comes from layout data');
assert.match(world,/for\(const zone of sc\.zones/,'WebGL paints zone labels on the floor');
const palette=html.slice(html.indexOf('const C={'),html.indexOf('};',html.indexOf('const C={')));
for(const token of ['rackUpright','rackBeam'])assert.match(palette,new RegExp(token+":cssToken\\('--world-"+token+"'\\)"),`canvas ${token} reads the shared token`);
assert.ok(!/--world-rack/.test(world.slice(world.indexOf('function installStyles'))),'rack tokens are defined once, in index.html');
console.log('PASS: sign depth, pallet decks, pallet collision, counter colour data, WebGL zone labels, shared rack tokens');
// ─── distinct floors (2026-09-23) ───
for(const [id,sc] of Object.entries(context.scenes)){
  assert.ok(sc.style&&typeof sc.style==='object',id+': layout carries a per-floor style');
  for(const key of ['wallColor','trim','band','sky','sun','zoneInk'])if(sc.style[key])assert.ok(world.includes("'"+sc.style[key]+"'")||html.includes('--world-'+sc.style[key]+':'),`${id}: style.${key} "${sc.style[key]}" is a defined token`);
}
assert.ok(context.scenes.bank.cameraBounds.x1>12&&context.scenes.company.cameraBounds.x1>13&&context.scenes.office.cameraBounds.x0<-3,'camera frames each exterior');
const racks=company.blocks.find(b=>b.kind==='racks');assert.ok(racks.y-racks.h/2>=435,'racks leave the dock door (z 3.45–4.35) clear');
assert.ok(company.props.some(p=>p.kind==='tape'),'hazard tape marks the racking aisle');
for(const id of Object.keys(context.scenes))assert.ok(fs.existsSync(path.join(root,'assets','floors',id+'.jpg')),id+': picker image rendered (node tools/render-floor-images.cjs)');
assert.match(html,/SCENE_SECTOR=\{/,'picker cards name each sector');
for(const id of Object.keys(context.scenes))assert.match(html,new RegExp('--loc-'+id+':'),id+': picker accent token');
console.log('PASS: per-floor styles, exterior camera bounds, dock clearance, hazard tape, picker images and accents');
