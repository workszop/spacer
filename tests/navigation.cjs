const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const context={window:{},console};vm.createContext(context);
vm.runInContext(readFileSync(require('node:path').join(__dirname,'../game-world.js'),'utf8'),context);
const nav=context.window.FloorNavigation;
const free=(x,y)=>x>=15&&x<=285&&y>=15&&y<=285&&!(x>=85&&x<=140&&y<185);
const route=nav.findPath({x:40,y:40},{x:230,y:40},free,300,300);
assert.ok(route.length>2,'path goes around a wall');
let prev={x:40,y:40};for(const point of route){
  assert.ok(free(point.x,point.y));
  for(let t=0;t<=1;t+=.05)assert.ok(free(prev.x+(point.x-prev.x)*t,prev.y+(point.y-prev.y)*t),'smoothed path must not clip obstacles');
  prev=point;
}
assert.ok(Math.hypot(prev.x-230,prev.y-40)<25);
assert.equal(nav.findPath({x:40,y:40},{x:230,y:40},(x,y)=>free(x,y)&&x<85,300,300).length,0,'unreachable target');
assert.equal(nav.findPath({x:40,y:40},{x:110,y:40},free,300,300).length,0,'occupied target');
assert.equal(nav.findPath({x:40,y:40},{x:-10,y:40},free,300,300).length,0,'outside map');
assert.equal(nav.findPath({x:40,y:40},{x:40,y:40},free,300,300).length,1,'already there');
const up=context.window.GameWorld.screenMovement(0,-1),right=context.window.GameWorld.screenMovement(1,0);
assert.ok(up.x<0&&up.y<0,'up points away from isometric camera');
assert.ok(right.x>0&&right.y<0,'right follows camera horizontal axis');
console.log('PASS: navigation detours, segment safety, invalid destinations, camera-relative controls');

const html=readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const data={window:{}};vm.createContext(data);
vm.runInContext(readFileSync(require('node:path').join(__dirname,'../location-layouts.js'),'utf8'),data);
vm.runInContext(html.slice(html.indexOf('const PRODUCTS='),html.indexOf('const player='))+';this.scenes=SCENES;',data);
for(const [id,sc] of Object.entries(data.scenes)){
  const rects=[...sc.walls,...sc.blocks.filter(b=>b.kind!=='plant').map(b=>({x:b.x-b.w/2,y:b.y-b.h/2,w:b.w,h:b.h})),...sc.objects.map(o=>({x:o.x-o.w/2,y:o.y-o.h/2,w:o.w,h:o.h}))];
  const free=(x,y)=>x>=34&&x<=1046&&y>=34&&y<=626&&!rects.some(o=>Math.hypot(x-Math.max(o.x,Math.min(x,o.x+o.w)),y-Math.max(o.y,Math.min(y,o.y+o.h)))<16);
  let from=sc.spawn;
  for(const obj of sc.objects){
    const targets=[[0,obj.h/2+34],[0,-obj.h/2-50],[obj.w/2+34,0],[-obj.w/2-34,0]].map(([dx,dy])=>({x:obj.x+dx,y:obj.y+dy})).filter(p=>free(p.x,p.y));
    const routes=targets.map(p=>nav.findPath(from,p,free,1080,660)).filter(p=>p.length);
    assert.ok(routes.length,`${id}/${obj.product} must be reachable from previous station`);
    from=routes[0].at(-1);
  }
  assert.equal(sc.objects.length,4,`${id} has four products`);
  console.log(`PASS: all ${sc.objects.length} ${id} stations reachable without obstacle clipping`);
}
