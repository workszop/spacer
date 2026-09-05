const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');

const context={window:{},console};
vm.createContext(context);
vm.runInContext(readFileSync(path.join(__dirname,'../game-world.js'),'utf8'),context);
const nav=context.window.FloorNavigation;

const width=180,height=180;
let calls=0;
const free=(x,y)=>{calls++;return x>=10&&x<=170&&y>=10&&y<=170&&!(x>=70&&x<=110&&y<125);};
const start={x:25,y:25},target={x:150,y:25};
const first=nav.findPath(start,target,free,width,height);
assert.ok(first.length>1,'first route still detours around the obstacle');
const firstCalls=calls;
assert.ok(firstCalls>0,'first route consults the traversability callback');

calls=0;
const second=nav.findPath(start,target,free,width,height);
assert.deepEqual(second,first,'cached grid route keeps the existing path result');
assert.ok(calls>0,'arbitrary start/target smoothing is revalidated instead of reusing rounded samples');
assert.ok(calls<firstCalls,'same callback and dimensions reuse cached grid traversability and edge checks');

calls=0;
nav.invalidate(free);
const afterInvalidate=nav.findPath(start,target,free,width,height);
assert.deepEqual(afterInvalidate,first,'invalidating navigation cache does not change the route');
assert.ok(calls>0,'invalidating a callback cache forces fresh traversability checks');

calls=0;
nav.findPath(start,target,free,width+1,height);
assert.ok(calls>0,'a different map dimension gets an independent cache');

let otherCalls=0;
const otherFree=(x,y)=>{otherCalls++;return free(x,y);};
nav.findPath(start,target,otherFree,width,height);
assert.ok(otherCalls>0,'a different callback gets an independent cache');

const permissive=()=>true;
for(const [label,badStart,badTarget] of [
  ['non-finite start',{x:NaN,y:20},target],
  ['infinite target',start,{x:Infinity,y:20}],
  ['start outside map',{x:-1,y:20},target],
  ['target outside map',start,{x:width+1,y:20}],
]){
  assert.equal(nav.findPath(badStart,badTarget,permissive,width,height).length,0,label+' is rejected before path search');
}
assert.equal(nav.findPath(start,target,permissive,0,height).length,0,'invalid dimensions are rejected');

console.log('PASS: navigation cache reuse, invalidation, callback isolation, and coordinate validation');
