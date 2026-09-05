const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const html=readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function freeSpot('),html.indexOf("cv.addEventListener('pointerdown'"));
const object={id:'station',x:250,y:195,w:195,h:64,product:'kmicic'};
const player={x:250,y:95,r:14};
let destination;
const navigation={findPath:(_,target)=>{destination=target;return [target];}};
const context={SC:{objects:[object]},player,rects:[],W:1080,H:660,nearObj:null,completed:{},
  INTERACTION_DISTANCE:48,APPROACH_DISTANCE:32,PRODUCTS:{kmicic:{name:'Kmicic'}},
  uiOpen:()=>false,openModal:()=>{},updateInteract:()=>{},navigationStatus:()=>{},
  window:{App:{},FloorNavigation:navigation},FloorNavigation:navigation,
  document:{getElementById:()=>({addEventListener:()=>{}}),querySelectorAll:()=>[]},addEventListener:()=>{}};
vm.createContext(context);vm.runInContext(source,context);
assert.equal(context.navigateTo(undefined,undefined,object.id),true);
assert.ok(destination.y>115&&destination.y<163,'northern arrival must fall inside the 48-unit interaction range, with stopping tolerance');
assert.equal(context.freeSpot(NaN,50),false,'non-finite positions must be rejected');
console.log('PASS: approach enters interaction range; invalid coordinates rejected');
