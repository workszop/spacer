/* ─── Navigation: shared by the 3D world and the canvas fallback ─── */
window.FloorNavigation=(()=>{
  const STEP=18;
  const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],REVERSE=[1,0,3,2,7,6,5,4];
  const MAX_DIMENSION_CACHES=4,MAX_GRID_CELLS=100000;
  let cacheByFree=new WeakMap();
  const validPoint=(point,width,height)=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.x<width&&point.y>=0&&point.y<height;
  function cacheFor(free,width,height){
    let dimensions=cacheByFree.get(free);
    if(!dimensions){dimensions=new Map();cacheByFree.set(free,dimensions);}
    const key=`${width}x${height}`,cols=Math.ceil(width/STEP),rows=Math.ceil(height/STEP);
    if(!Number.isSafeInteger(cols)||!Number.isSafeInteger(rows)||cols*rows>MAX_GRID_CELLS)return null;
    let cache=dimensions.get(key);
    if(!cache){
      if(dimensions.size>=MAX_DIMENSION_CACHES)dimensions.delete(dimensions.keys().next().value);
      cache={cols,rows,points:new Uint8Array(cols*rows),edges:new Uint8Array(cols*rows*DIRECTIONS.length)};dimensions.set(key,cache);
    }
    return cache;
  }
  function invalidate(free){
    if(typeof free==='function')cacheByFree.delete(free);else if(free==null)cacheByFree=new WeakMap();
  }
  return {
    // `free` must include the avatar radius and map boundaries, not just point occupancy.
    findPath(start,target,free,width,height){
      if(typeof free!=='function'||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return [];
      if(!validPoint(start,width,height)||!validPoint(target,width,height))return [];
      const cache=cacheFor(free,width,height);
      if(!cache)return [];
      const point=n=>({x:(n%cache.cols)*STEP+STEP/2,y:Math.floor(n/cache.cols)*STEP+STEP/2});
      const gridIndex=(x,y)=>{
        const gx=(x-STEP/2)/STEP,gy=(y-STEP/2)/STEP,ix=Math.round(gx),iy=Math.round(gy);
        return Math.abs(gx-ix)<1e-9&&Math.abs(gy-iy)<1e-9&&ix>=0&&ix<cache.cols&&iy>=0&&iy<cache.rows?iy*cache.cols+ix:-1;
      };
      const gridFree=index=>{
        const state=cache.points[index];
        if(state)return state===1;
        const result=!!free((index%cache.cols)*STEP+STEP/2,Math.floor(index/cache.cols)*STEP+STEP/2);
        cache.points[index]=result?1:2;return result;
      };
      const isFree=(x,y)=>{const index=gridIndex(x,y);return index<0?!!free(x,y):gridFree(index);};
      const gridDirection=(from,to)=>{
        const fx=from%cache.cols,fy=Math.floor(from/cache.cols),tx=to%cache.cols,ty=Math.floor(to/cache.cols),dx=tx-fx,dy=ty-fy;
        for(let i=0;i<DIRECTIONS.length;i++)if(DIRECTIONS[i][0]===dx&&DIRECTIONS[i][1]===dy)return i;
        return -1;
      };
      const clearDirect=(a,b)=>{
        const count=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y));
        for(let i=0;i<=count;i++){
          const t=count?i/count:0,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
          if(!free(x,y)||!free(x-.75,y-.75)||!free(x+.75,y+.75)||!free(x-.75,y+.75)||!free(x+.75,y-.75))return false;
        }
        return true;
      };
      const clearGridEdge=(a,b,from,to,direction)=>{
        const offset=from*DIRECTIONS.length+direction,cached=cache.edges[offset];
        if(cached)return cached===1;
        const result=clearDirect(a,b)?1:2;
        cache.edges[offset]=result;cache.edges[to*DIRECTIONS.length+REVERSE[direction]]=result;return result===1;
      };
      const clear=(a,b)=>{
        const from=gridIndex(a.x,a.y),to=gridIndex(b.x,b.y),direction=from<0||to<0?-1:gridDirection(from,to);
        return direction<0?clearDirect(a,b):clearGridEdge(a,b,from,to,direction);
      };
      if(!isFree(target.x,target.y))return [];
      if(clear(start,target))return [target];
      let first=-1,distance=Infinity;
      for(let n=0;n<cache.cols*cache.rows;n++){const p=point(n),d=Math.hypot(p.x-start.x,p.y-start.y);if(d<distance&&gridFree(n)&&clear(start,p)){first=n;distance=d;}}
      if(first<0)return [];
      const queue=[first],prev=new Map([[first,-1]]);let end=-1;
      for(let head=0;head<queue.length;head++){
        const n=queue[head],p=point(n);
        if(Math.hypot(p.x-target.x,p.y-target.y)<STEP*1.5&&clear(p,target)){end=n;break;}
        for(const [dx,dy] of DIRECTIONS){
          const x=n%cache.cols+dx,y=Math.floor(n/cache.cols)+dy,k=y*cache.cols+x;
          if(x<0||x>=cache.cols||y<0||y>=cache.rows||prev.has(k))continue;
          const next=point(k);if(isFree(next.x,next.y)&&clear(p,next)){prev.set(k,n);queue.push(k);}
        }
      }
      if(end<0)return [];
      const raw=[target];for(let n=end;n!==-1;n=prev.get(n))raw.push(point(n));raw.reverse();
      const path=[];let anchor=start;
      for(let i=0;i<raw.length;){let j=i;while(j+1<raw.length&&clear(anchor,raw[j+1]))j++;path.push(raw[j]);anchor=raw[j];i=j+1;}
      return path;
    },
    invalidate
  };
})();

/* ─── World: procedural models, no asset downloads or build step ─── */
window.GameWorld=(()=>{
  const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
  const DEFAULT_ANGLE=Math.PI/4, DEFAULT_ELEVATION=.84;
  const state={ready:false,sceneId:null,angle:DEFAULT_ANGLE,zoom:1,drag:null,frames:0};
  let THREE,renderer,scene,camera,world,avatar,ring,targetRing,options,stage,labels,resizeObserver;
  let materials={},colors={},primitiveGeometries=new Map(),markers=[],limbs=[],pickMeshes=[],width=1,height=1,currentScene=null;
  let labelLayoutDirty=true,renderInvalidated=true,lastRenderSignature=null;
  const renderMetrics={drawCalls:0,geometries:0,textures:0,renders:0,skippedFrames:0};
  const vector=()=>new THREE.Vector3();
  const material=(name)=>materials[name]||(materials[name]=new THREE.MeshStandardMaterial({color:colors[name]||name,roughness:name==='screen'?.3:.72,metalness:name==='metal'?.42:.03,...(name==='screen'?{emissive:colors.screen,emissiveIntensity:.18}:{})}));
  function mesh(geometry,color,parent=world){const obj=new THREE.Mesh(geometry,material(color));obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;}
  function primitiveGeometry(kind,values,create){
    const key=kind+':'+values.map(value=>Number(value).toPrecision(14)).join(',');
    let geometry=primitiveGeometries.get(key);if(!geometry){geometry=create();primitiveGeometries.set(key,geometry);}return geometry;
  }
  const ringGeometry=(inner,outer,segments)=>primitiveGeometry('ring',[inner,outer,segments],()=>new THREE.RingGeometry(inner,outer,segments));
  function box(x,z,w,d,h,color,y=0,parent=world,bevel=0){
    let geometry;
    if(bevel){
      const shape=new THREE.Shape(),r=Math.min(bevel,w/4,d/4);
      shape.moveTo(-w/2+r,-d/2);shape.lineTo(w/2-r,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);
      shape.lineTo(w/2,d/2-r);shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2);shape.lineTo(-w/2+r,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);shape.lineTo(-w/2,-d/2+r);shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
      geometry=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1,curveSegments:4});geometry.rotateX(-Math.PI/2);geometry.translate(0,-h/2,0);
    }else geometry=primitiveGeometry('box',[w,h,d],()=>new THREE.BoxGeometry(w,h,d));
    const obj=mesh(geometry,color,parent);obj.position.set(x,y+h/2,z);return obj;
  }
  function cylinder(x,z,r,h,color,y=0,parent=world,rTop=r){const geometry=primitiveGeometry('cylinder',[rTop,r,h,16],()=>new THREE.CylinderGeometry(rTop,r,h,16));const obj=mesh(geometry,color,parent);obj.position.set(x,y+h/2,z);return obj;}
  function sphere(x,y,z,r,color,parent=world,sx=1,sy=1,sz=1){const geometry=primitiveGeometry('sphere',[r,12,8],()=>new THREE.SphereGeometry(r,12,8));const obj=mesh(geometry,color,parent);obj.position.set(x,y,z);obj.scale.set(sx,sy,sz);return obj;}
  function group(x,z,parent=world){const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);return g;}
  function chair(x,z,accent='upholstery',rotation=0,parent=world){
    const g=group(x,z,parent);g.rotation.y=rotation;
    cylinder(0,0,.13,.04,'metal',.02,g);cylinder(0,0,.035,.27,'metal',.04,g);
    box(0,0,.29,.3,.075,accent,.3,g,.04);box(0,-.13,.29,.055,.3,accent,.34,g,.025);
    for(const side of [-1,1]){box(side*.18,0,.025,.2,.025,'metal',.43,g);box(side*.18,.06,.025,.025,.12,'metal',.32,g);}
    return g;
  }
  function desk(x,z,w=1.1,d=.52,accent='wood',parent=world){
    const g=group(x,z,parent);box(0,0,w,d,.065,accent,.58,g,.045);
    for(const side of [-1,1])box(side*(w/2-.08),0,.055,d-.09,.58,'metal',0,g);
    box(0,-d/2+.045,w-.14,.035,.19,'cream',.29,g);
    return g;
  }
  function monitor(x,z,y=.65,parent=world){
    box(x,z,.17,.13,.025,'metal',y,parent,.01);box(x,z,.035,.035,.11,'metal',y,parent);
    box(x,z,.39,.045,.25,'ink',y+.1,parent,.016);
    const display=box(x,z+.025,.35,.006,.21,'screen',y+.12,parent);
    display.material=materials.screen||(materials.screen=new THREE.MeshStandardMaterial({color:colors.screen,emissive:colors.screen,emissiveIntensity:.18,roughness:.35}));
    for(let i=0;i<3;i++)box(x-.035,z+.029,.18-i*.025,.002,.008,'screenLine',y+.27-i*.036,parent);
    box(x,z+.19,.25,.11,.014,'keyboard',y,parent,.012);
    box(x+.2,z+.19,.055,.08,.018,'ink',y,parent,.02);
  }
  function plant(x,z,size=1,parent=world){
    const g=group(x,z,parent);g.scale.setScalar(size);
    cylinder(0,0,.14,.25,'pot',0,g,.19);cylinder(0,0,.166,.013,'soil',.247,g);
    cylinder(0,0,.018,.42,'wood',.24,g);
    for(let i=0;i<7;i++){const angle=i*2.4,leaf=sphere(Math.cos(angle)*.13,.5+i*.037,Math.sin(angle)*.13,.17,i%2?'leaf':'leafLight',g,.55,1.65,.5);leaf.rotation.z=Math.sin(angle)*.7;leaf.rotation.x=Math.cos(angle)*.7;}
  }
  function cabinet(x,z,w=.9,h=.8,parent=world){
    box(x,z,w,.32,h,'cream',0,parent,.016);
    for(let i=0;i<3;i++){
      box(x,z+.165,w-.07,.012,.014,'metal',.12+i*.23,parent);
      box(x,z+.177,.13,.02,.014,'metal',.22+i*.23,parent);
    }
  }
  function shelf(x,z,w=.65,parent=world){
    box(x,z,w,.34,1.08,'wood',0,parent);box(x,z+.174,w-.07,.016,.98,'ink',.045,parent);
    for(let level=0;level<3;level++){
      box(x,z+.025,w-.035,.32,.025,'cream',.055+level*.34,parent);
      for(let i=0;i<6;i++){const color=['papkin','cream','gerwazy','metal'][i%4];box(x-w/2+.085+i*(w-.1)/6,z+.11,.055,.17,.24,color,.09+level*.34,parent);box(x-w/2+.085+i*(w-.1)/6,z+.2,.022,.006,.04,'paper',.18+level*.34,parent);}
    }
  }
  function textPanel(text,w,h,bg='ink',fg='paper'){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.round(768*h/w);
    const ctx=canvas.getContext('2d');ctx.fillStyle=colors[bg]||bg;ctx.fillRect(0,0,canvas.width,canvas.height);
    const lines=text.split('\n'),lineHeight=canvas.height/(lines.length+1);
    ctx.fillStyle=colors[fg]||fg;ctx.font='600 '+Math.min(46,lineHeight*.72)+'px '+getComputedStyle(document.documentElement).getPropertyValue('--font-ui');ctx.textAlign='center';ctx.textBaseline='middle';
    lines.forEach((line,i)=>ctx.fillText(line,384,lineHeight*(i+1),720));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const obj=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));world.add(obj);return obj;
  }
  function floorTexture(kind){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
    ctx.fillStyle=colors[kind==='carpet'?'carpet':kind==='planks'?'wood':'tile'];ctx.fillRect(0,0,256,256);
    ctx.strokeStyle=colors[kind==='carpet'?'carpetLine':kind==='planks'?'woodGrain':'tileLine'];ctx.lineWidth=kind==='carpet'?1:2;
    if(kind==='carpet'){for(let i=0;i<256;i+=4){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.stroke();}}
    else if(kind==='planks'){for(let x=0;x<256;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,256);ctx.moveTo(x,(x%64?65:175));ctx.lineTo(x+32,(x%64?65:175));ctx.stroke();}}
    else{ctx.strokeRect(1,1,254,254);ctx.beginPath();ctx.moveTo(128,0);ctx.lineTo(128,256);ctx.moveTo(0,128);ctx.lineTo(256,128);ctx.stroke();}
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,3);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
  }
  function wall(x,z,w,d,h,accent='wall'){
    box(x,z,w,d,h,accent);box(x,z,w+.015,d+.015,.025,'paper',h);box(x,z,w+.018,d+.018,.055,'metal',.03);
  }
  function plaque(text,x,y,z,w,h,bg='ink',fg='paper'){const panel=textPanel(text,w,h,bg,fg);panel.position.set(x,y,z);return panel;}
  function aircraft(){
    const g=group(4.35,-1.8);g.rotation.y=-.12;
    sphere(0,.65,0,.36,'paper',g,5.5,.95,.9);
    sphere(-1.58,.72,.035,.25,'glass',g,1.4,.62,1.03);
    box(.05,0,.8,4.4,.055,'paper',.52,g,.035);
    for(const side of [-1,1]){
      const wing=box(.25,side*1.3,1.45,.68,.045,'paper',.53,g,.035);wing.rotation.y=side*.28;
      const engine=cylinder(-.24,side*1.13,.15,.67,'metal',0,g);engine.rotation.z=Math.PI/2;engine.position.y=.34;
      const intake=cylinder(-.59,side*1.13,.113,.025,'ink',0,g);intake.rotation.z=Math.PI/2;intake.position.y=.34;
      for(let i=0;i<9;i++)sphere(-.95+i*.24,.77,side*.302,.033,'ink',g,.65,1,.32);
    }
    box(1.37,0,.6,1.48,.05,'paper',.62,g,.025);
    const tail=box(1.42,0,.53,.055,.74,'aviation',.62,g,.015);tail.rotation.z=-.15;
    for(const x of [-1.1,.65])for(const z of [-.12,.12])sphere(x,.12,z,.085,'ink',g,1,1,.6);
    // The apron lies outside the playable terminal, so aircraft geometry never blocks walking.
    box(5.4,-1.6,10.8,3.2,.04,'apron',-.14);
    for(let x=0;x<10;x+=.75)box(x+.25,-2.95,.34,.035,.007,'lane',-.11);
    box(5.4,-.31,10.8,.04,.007,'lane',-.11);
  }
  function facade(id){
    if(id==='airport'){
      // Tall clear-span glazing, not an office parapet.
      for(let x=.55;x<10.7;x+=1.05){box(x,.12,1.01,.026,1.25,'glass',.1);box(x-.51,.15,.035,.06,1.4,'metal');}
      box(5.4,.15,10.8,.1,.085,'paper',1.38);aircraft();
      plaque('TERMINAL A',2.4,1.04,.19,1.85,.25);
      box(5.5,.76,.065,.065,1.42,'metal');plaque('A1\nBOARDING',5.5,1.37,.79,.66,.45,'aviation');
      return;
    }
    if(id==='bank'){
      wall(5.4,.1,10.8,.16,1.3,'bankStone');
      for(const x of [1.1,2.35,3.6,4.85]){box(x,.194,.94,.02,.75,'glass',.33);box(x,.215,.98,.025,.035,'brass',.32);}
      for(let x=7.3;x<10.8;x+=.16)box(x,.205,.045,.045,1.2,'wood');
      plaque('BANK',5.95,.99,.23,1.1,.33,'bankStone','ink');
      return;
    }
    wall(5.4,.1,10.8,.18,1.35,'civicStone');
    for(const x of [.75,2.05,4.75,6.1,7.45,8.8,10.1]){
      box(x,.205,.67,.026,.7,'glass',.4);box(x,.23,.75,.13,.06,'paper',.35);
      box(x,.237,.028,.03,.72,'paper',.39);box(x,.237,.68,.03,.026,'paper',.75);
    }
    for(const x of [3.03,3.91]){box(x,.25,.17,.24,1.42,'paper');box(x,.25,.26,.32,.08,'paper',1.37);}
    box(3.47,.14,.76,.035,1.05,'wood');box(3.47,.25,.025,.02,.15,'brass',.4);
    box(5.4,.15,10.85,.32,.09,'paper',1.45);plaque('URZĄD GMINY',3.47,1.26,.44,1.7,.27,'civicRed');
  }
  function vault(x,z,w=2.3){
    box(x,z,w,1.5,1.18,'bankStone',0,world,.035);
    box(x,z+.76,w-.2,.025,1.02,'ink',.08);
    const door=cylinder(x,z+.8,.49,.1,'metal');door.rotation.x=Math.PI/2;door.position.y=.6;
    const face=cylinder(x,z+.86,.42,.015,'cream');face.rotation.x=Math.PI/2;face.position.y=.6;
    const hub=cylinder(x,z+.91,.1,.08,'brass');hub.rotation.x=Math.PI/2;hub.position.y=.6;
    for(let i=0;i<6;i++){const spoke=box(x,z+.93,.025,.025,.62,'metal',.29);spoke.rotation.z=i*Math.PI/3;}
    for(const side of [-1,1])box(x+side*.62,z+.83,.075,.055,.19,'metal',.45);
    plaque('SKARBIEC',x,1.32,z+.77,w*.65,.22,'bankStone','ink');
  }
  function noticeboard(x,z,w=1.9){
    box(x,z,w,.16,.91,'wood',.17);box(x,z+.086,w-.09,.01,.79,'cork',.23);
    for(let i=0;i<5;i++){const paper=box(x-w*.36+(i%3)*w*.34,z+.098,.33,.008,.29,'paper',i<3?.64:.29);paper.rotation.z=(i%2?1:-1)*.035;for(let j=0;j<3;j++)box(paper.position.x,z+.106,.22,.003,.008,'metal',(i<3?.83:.48)-j*.038);}
    plaque('OGŁOSZENIA',x,1.19,z+.1,w,.22,'civicRed');
  }
  function buildRoom(sc,id){
    const w=10.8,d=6.6;
    box(w/2,d/2,w+.18,d+.18,.2,'foundation',-.23,world,.09);
    box(w/2,d/2,w+.1,d+.1,.03,'edge',-.045,world,.055);
    for(const f of sc.floors){const obj=box((f.x+f.w/2)/100,(f.y+f.h/2)/100,f.w/100,f.h/100,.025,'tile',-.014);obj.material=new THREE.MeshStandardMaterial({map:floorTexture(f.pat),roughness:.91,color:f.pat==='planks'?colors.paper:f.c});}
    wall(.1,d/2,.1,d,.12);wall(w-.1,d/2,.1,d,.12);wall(w/2,d-.1,w,.1,.1);facade(id);
    for(const r of sc.walls){wall((r.x+r.w/2)/100,(r.y+r.h/2)/100,r.w/100,r.h/100,.72);}
    for(const door of sc.doors){
      const horizontal=door.dir==='x',x=door.x/100,z=door.y/100,span=door.w/100;
      box(x,z,horizontal?span:.13,horizontal?.13:span,.01,'threshold');
      for(const sign of [-1,1])box(x+(horizontal?sign*span/2:0),z+(horizontal?0:sign*span/2),.06,.06,.98,'metal');
      box(x,z,horizontal?span+.08:.08,horizontal?.08:span+.08,.065,'metal',.95);
    }
    for(const b of sc.blocks)buildProp(b);
    for(const p of sc.props||[])buildProp(p);
    for(const o of sc.objects)buildStation(o);
  }
  function buildProp(p){
    const x=p.x/100,z=p.y/100,w=(p.w||70)/100,d=(p.h||35)/100;
    if(p.kind==='rug'){box(x,z,p.w/100,p.h/100,.006,'rug',.021,world,.04);box(x,z,p.w/100-.08,p.h/100-.08,.004,'rugInner',.028,world,.035);return;}
    if(p.kind==='plant'){plant(x,z,1.1);return;}
    if(p.kind==='gatepost'){box(x,z,w,d,.65,'aviation');return;}
    if(p.kind==='deskPC'||p.kind==='checkin'){desk(x,z,w,d);monitor(x,z-.12);chair(x,z+.47);return;}
    if(p.kind==='cabinet'){cabinet(x,z,w,(p.z||75)/100);return;}
    if(p.kind==='bench'||p.kind==='seats'){
      const count=Math.max(2,Math.round(w/.4));for(let i=0;i<count;i++)chair(x-w/2+.2+i*(w-.4)/(count-1),z,'upholstery');return;
    }
    if(p.kind==='board'){const sign=textPanel(currentScene.identity==='terminal'?'ODLOTY  /  DEPARTURES\nLO 281   WARSZAWA    A1\nLH 135   FRANKFURT   A2\nKL 902   AMSTERDAM   A3':p.t||'',w,.69);sign.position.set(x,1.35,z+.045);box(x,z,w+.08,.07,.76,'metal',.97);return;}
    if(p.kind==='vault'){vault(x,z,w);return;}
    if(p.kind==='noticeboard'){noticeboard(x,z,w);return;}
    if(p.kind==='atm'){
      box(x,z,.47,.38,1.05,'metal',0,world,.03);box(x,z+.195,.39,.018,.7,'ink',.29);box(x,z+.21,.27,.01,.23,'screen',.63);box(x,z+.21,.21,.012,.025,'paper',.4);return;
    }
    if(p.kind==='cooler'){
      box(x,z,.3,.3,.64,'paper',0,world,.025);box(x,z+.16,.2,.018,.17,'ink',.33);cylinder(x,z,.12,.27,'glass',.65);return;
    }
    if(p.kind==='printer'){cabinet(x,z,.46,.42);box(x,z,.38,.29,.18,'metal',.43,world,.02);box(x,z+.04,.27,.17,.02,'paper',.62);return;}
    if(p.kind==='bin'){cylinder(x,z,.12,.3,'metal');cylinder(x,z,.13,.035,'ink',.3);return;}
    if(p.kind==='lamp'){
      cylinder(x,z,.16,.035,'metal');cylinder(x,z,.018,1.14,'metal',.025);cylinder(x,z,.23,.19,'lamp',1.02,world,.14);return;
    }
    if(p.kind==='barrier'){
      for(const side of [-1,1]){cylinder(x+side*w/2,z,.08,.025,'metal');cylinder(x+side*w/2,z,.018,.65,'metal');}box(x,z,w,.02,.07,'kmicic',.56);return;
    }
    if(p.kind==='flag'){
      cylinder(x,z,.13,.035,'metal');cylinder(x,z,.012,1.7,'metal');box(x-.21,z,.42,.012,.22,'paper',1.47);box(x-.21,z,.42,.012,.22,'civicRed',1.25);return;
    }
    if(p.kind==='scanner'){box(x,z,w,d,.58,'metal');box(x,z+.01,w+.15,d*.6,.045,'ink',.28);box(x,z,w*.5,d+.02,.3,'ink',.2);return;}
    if(p.kind==='cart'){box(x,z,.43,.36,.05,'metal',.12);box(x,z-.15,.43,.035,.52,'metal',.13);box(x,z,.32,.25,.32,'kmicic',.17,world,.04);return;}
  }
  function buildStation(o){
    const x=o.x/100,z=o.y/100,w=o.w/100,d=o.h/100,g=group(x,z);g.userData.objectId=o.id;
    if(o.type==='knowledge'){
      box(0,0,.58,.38,.075,'metal',0,g,.035);box(0,0,.26,.2,.87,'zagloba',.065,g,.03);
      box(0,0,.66,.1,.46,'ink',.87,g,.035);box(0,.057,.58,.012,.37,'screen',.915,g,.02);
      for(let i=0;i<3;i++)box(-.03,.066,.36-i*.04,.005,.016,'screenLine',1.19-i*.07,g);
      box(0,.14,.53,.27,.04,'cream',.78,g,.025);
    }else if(o.type==='table'){
      box(0,0,w-.16,d-.24,.08,'wood',.6,g,.17);for(const side of [-1,1])cylinder(side*w*.27,0,.14,.6,'metal',0,g);
      for(const dx of [-.57,.57]){chair(dx,-d/2+.04,currentScene.identity==='civic-hall'?'civicSeat':'papkin',0,g);chair(dx,d/2-.04,currentScene.identity==='civic-hall'?'civicSeat':'papkin',Math.PI,g);}
      if(currentScene.identity==='civic-hall'){box(0,-.31,w-.1,.08,.16,'wood',.63,g);plaque('SALA RADY',x,.46,z+d/2-.04,1.15,.18,'wood','ink');}
      box(0,0,.13,.13,.025,'ink',.69,g);cylinder(0,0,.017,.17,'metal',.715,g);sphere(0,.895,0,.035,'ink',g);
      for(const side of [-1,1]){box(side*.57,0,.22,.28,.01,'paper',.686,g);cylinder(side*.3,.04,.037,.08,'cream',.687,g);}
    }else{
      const dw=o.type==='shield'?w-.6:w;desk(o.type==='shield'?-.25:0,0,dw,d*.7,'cream',g);monitor(-.3,-.12,.65,g);chair(-.3,d*.6,'upholstery',Math.PI,g);
      if(o.type==='shield')shelf(w/2-.26,0,.52,g);
      else{box(.4,0,.32,.23,.035,'metal',.65,g);box(.4,0,.27,.18,.025,'paper',.69,g);
        const counterColor=currentScene.identity==='financial-lobby'?'wood':currentScene.identity==='civic-hall'?'civicStone':'aviation';
        box(0,d*.35+.01,dw,.06,.43,counterColor,.06,g);
        if(currentScene.identity==='financial-lobby'){box(0,0,.03,.025,.7,'brass',.65,g);box(0,0,dw-.04,.018,.52,'glass',.7,g);plaque('OBSŁUGA KLIENTA',x,.35,z+d*.35+.05,1.45,.18,'wood','ink');}
        if(currentScene.identity==='civic-hall')plaque('BIURO PODAWCZE',x,.35,z+d*.35+.05,1.4,.18,'civicStone','ink');
      }
    }
    const marker=document.createElement('button');marker.type='button';marker.className='world-marker';marker.dataset.objectId=o.id;marker.style.setProperty('--marker-color',colors[o.product]);
    const dot=document.createElement('i'),name=document.createElement('b'),status=document.createElement('span');name.textContent=options.products[o.product].name;status.textContent='Odkryj';marker.append(dot,name,status);
    marker.dataset.short=options.products[o.product].name.slice(0,1);marker.setAttribute('aria-label',options.products[o.product].name+' – '+o.label);marker.onclick=()=>{if(!options.isPaused())options.onNavigate(o.x,o.y,o.id);};labels.appendChild(marker);
    markers.push({element:marker,dot,name,status,point:new THREE.Vector3(x,1.35,z-.2),object:o,lastLeft:null,lastTop:null,lastHidden:null,lastNear:null,lastCompleted:null,lastVisited:null,lastStatus:null,lastDisabled:null});
    g.traverse(child=>{if(child.isMesh){child.userData.objectId=o.id;pickMeshes.push(child);}});
    const halo=new THREE.Mesh(ringGeometry(.15,.175,32),new THREE.MeshBasicMaterial({color:colors[o.product],transparent:true,opacity:.8,side:THREE.DoubleSide}));halo.rotation.x=-Math.PI/2;halo.position.set(x,.038,z+d/2+.22);world.add(halo);
  }
  function buildAvatar(){
    avatar=group(0,0);limbs=[];
    // A small articulated concierge, keeping the original robot identity.
    box(0,0,.25,.17,.25,'kmicic',.26,avatar,.04);box(0,0,.29,.21,.21,'paper',.54,avatar,.04);box(0,.111,.22,.012,.105,'ink',.592,avatar,.022);
    for(const side of [-1,1])sphere(side*.06,.647,.124,.02,'screen',avatar);
    cylinder(0,0,.045,.035,'metal',.515,avatar);cylinder(0,0,.012,.085,'metal',.74,avatar);sphere(0,.834,0,.025,'kmicic',avatar);
    for(const side of [-1,1]){
      const leg=group(side*.074,0,avatar);leg.position.y=.27;box(0,0,.075,.09,.19,'ink',-.19,leg,.018);box(0,.027,.085,.15,.055,'paper',-.255,leg,.02);limbs.push(leg);
      const arm=group(side*.17,0,avatar);arm.position.y=.49;box(0,0,.065,.08,.19,'paper',-.19,arm,.025);limbs.push(arm);
    }
    ring=new THREE.Mesh(ringGeometry(.22,.24,40),new THREE.MeshBasicMaterial({color:colors.kmicic,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;world.add(ring);
    targetRing=new THREE.Mesh(ringGeometry(.095,.12,32),new THREE.MeshBasicMaterial({color:colors.kmicic,side:THREE.DoubleSide}));targetRing.rotation.x=-Math.PI/2;targetRing.visible=false;world.add(targetRing);
  }
  function disposeWorld(){
    if(!world)return;
    const geometries=new Set(),mats=new Set(),textures=new Set();world.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){mats.add(m);if(m.map)textures.add(m.map);}});
    Object.values(materials).forEach(m=>mats.add(m));
    geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());primitiveGeometries.clear();scene.remove(world);labels.replaceChildren();markers=[];materials={};pickMeshes=[];labelLayoutDirty=true;renderInvalidated=true;lastRenderSignature=null;
  }
  function rebuild(sc,id){disposeWorld();currentScene=sc;world=new THREE.Group();scene.add(world);buildRoom(sc,id);buildAvatar();state.sceneId=id;state.angle=DEFAULT_ANGLE;state.zoom=1;stage.dataset.identity=sc.identity;stage.dataset.landmarks=sc.landmarks?.join(',')||'';stage.dataset.cameraZoom='1.00';fitCamera();renderInvalidated=true;lastRenderSignature=null;}
  function fitCamera(){
    if(!camera)return;
    const aspect=width/height,b=currentScene?.cameraBounds||{x0:0,x1:10.8,z0:0,z1:6.6,height:1.5},cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2;
    camera.position.set(cx+Math.sin(state.angle)*15,15*Math.sin(DEFAULT_ELEVATION),cz+Math.cos(state.angle)*15);
    camera.lookAt(cx,.25,cz);camera.updateMatrixWorld(true);
    const corners=[];for(const x of [b.x0,b.x1])for(const z of [b.z0,b.z1])for(const y of [-.25,b.height])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
    const spanX=Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),spanY=Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y));
    const span=Math.max(spanY*1.12,spanX/aspect*1.08)/state.zoom;
    camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);labelLayoutDirty=true;renderInvalidated=true;
  }
  function resize(){const r=stage.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);renderer.setSize(width,height,false);fitCamera();}
  function cameraAction(action){
    if(!state.ready||options.isPaused())return;
    if(action==='left')state.angle-=Math.PI/8;if(action==='right')state.angle+=Math.PI/8;
    if(action==='in')state.zoom=Math.min(1.65,state.zoom+.12);if(action==='out')state.zoom=Math.max(.75,state.zoom-.12);
    if(action==='reset'){state.angle=DEFAULT_ANGLE;state.zoom=1;}fitCamera();stage.dataset.cameraZoom=state.zoom.toFixed(2);
  }
  function screenPoint(clientX,clientY){
    const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),camera);
    const hit=ray.intersectObjects(pickMeshes,false)[0];if(hit)return {objectId:hit.object.userData.objectId};
    const p=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),vector());return p?{x:p.x*100,y:p.z*100}:null;
  }
  function installStyles(){
    const style=document.createElement('style');style.textContent=`
    :root{--world-aviation:#355c75;--world-apron:#a9bac3;--world-lane:#f0d37d;--world-bankStone:#e9dfcf;--world-brass:#b79a62;--world-civicStone:#e3d5bc;--world-civicRed:#b93040;--world-civicSeat:#4c655b;--world-cork:#c5a47b;--world-zagloba:#197d78;--world-woodGrain:#8e6f4c;}
    :root{--world-paper:#f6f8fa;--world-cream:#d9dfe1;--world-ink:#203342;--world-wood:#b89267;--world-metal:#667c88;--world-upholstery:#456d79;--world-pot:#cbb9a0;--world-soil:#51463b;--world-leaf:#467765;--world-leafLight:#759880;--world-screen:#b2e7e3;--world-screenLine:#368f99;--world-keyboard:#94a6ad;--world-wall:#d3e0e3;--world-glass:#94c7d2;--world-foundation:#344f61;--world-edge:#d5e1e7;--world-tile:#e5ebec;--world-tileLine:#ccd7da;--world-carpet:#bdcbd1;--world-carpetLine:#b4c3ca;--world-airportFloor:#f4f9fc;--world-bankFloor:#efe6dc;--world-officeFloor:#f3eee2;--world-rug:#8596a1;--world-rugInner:#99aab4;--world-threshold:#91a4ae;--world-lamp:#ffeac3;--world-background:#cad7df;--world-light:#fff0da;--world-sky:#e4f1ff;--world-bounce:#869099;--world-shadow:#526b7a;--world-papkin:#795a9c;--world-kmicic:#d20757;--world-gerwazy:#556ac4;--world-marker-shadow:0 5px 16px rgb(28 48 65 / .18);}
    .stage .world-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none}
    .world-labels{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden}
    .world-marker{position:absolute;left:0;top:0;display:flex;align-items:center;gap:7px;transform:translate(-50%,-100%);border:1px solid var(--world-paper);border-radius:7px;padding:7px 10px;background:var(--world-paper);color:var(--world-ink);box-shadow:var(--world-marker-shadow);font-family:var(--font-ui);font-size:12px;line-height:1.3;pointer-events:auto;cursor:pointer;white-space:nowrap}
    .world-marker:after{content:'';position:absolute;left:50%;bottom:-5px;width:8px;height:8px;transform:translateX(-50%) rotate(45deg);background:var(--world-paper)}
    .world-status{position:absolute;bottom:12px;left:14px;z-index:3;max-width:calc(100% - 300px);color:var(--world-ink);background:var(--world-paper);font-family:var(--font-ui);font-size:11px;line-height:1.4;border-radius:5px;padding:5px 8px;pointer-events:none}
    .world-marker i{width:7px;height:7px;border-radius:50%;background:var(--marker-color)}
    .world-marker span{font-size:10px;color:var(--world-metal)}
    .world-marker[hidden]{display:none}
    .world-marker[data-near=true]{border-color:var(--marker-color)}
    .world-marker:hover,.world-marker:focus-visible{outline:2px solid var(--marker-color);outline-offset:3px}
    #stage[data-renderer=webgl] #cv{visibility:hidden}
    #stage[data-renderer=webgl] .hint,#stage[data-renderer=webgl] .interact,#stage[data-renderer=webgl] #btnNext{z-index:3}
    @media(max-width:768px){.world-marker{padding:6px 8px;font-size:11px;gap:5px}.world-marker span{display:none}.world-status{left:10px;bottom:154px;max-width:calc(100% - 20px);font-size:10px}}
    `;document.head.appendChild(style);
  }
  async function init(config){
    if(state.initialized)return;state.initialized=true;
    options=config;stage=config.stage;stage.dataset.renderer='loading';installStyles();
    try{
      let importTimer;
      try{THREE=await Promise.race([import(THREE_URL),new Promise((_,reject)=>{importTimer=setTimeout(()=>reject(new Error('3D library loading timed out')),10000);})]);}finally{clearTimeout(importTimer);}
      const computed=getComputedStyle(document.documentElement);for(const key of ['paper','cream','ink','wood','metal','upholstery','pot','soil','leaf','leafLight','screen','screenLine','keyboard','wall','glass','foundation','edge','tile','tileLine','carpet','carpetLine','airportFloor','bankFloor','officeFloor','rug','rugInner','threshold','lamp','background','light','sky','bounce','shadow','papkin','kmicic','gerwazy'])colors[key]=computed.getPropertyValue('--world-'+key).trim();
      for(const key of ['aviation','apron','lane','bankStone','brass','civicStone','civicRed','civicSeat','cork','zagloba','woodGrain'])colors[key]=computed.getPropertyValue('--world-'+key).trim();
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;
      renderer.domElement.className='world-canvas';renderer.domElement.setAttribute('aria-label','Świat 3D. Kliknij podłogę, aby przejść, lub produkt, aby podejść.');renderer.domElement.setAttribute('role','img');stage.prepend(renderer.domElement);
      labels=document.createElement('div');labels.className='world-labels';stage.insertBefore(labels,renderer.domElement.nextSibling);
      scene=new THREE.Scene();scene.background=new THREE.Color(colors.background);camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,100);
      scene.add(new THREE.HemisphereLight(colors.sky,colors.bounce,2.1));
      const sun=new THREE.DirectionalLight(colors.light,3.1);sun.position.set(-3,12,5);sun.target.position.set(5,0,3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.camera.far=35;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=4;scene.add(sun,sun.target);
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:colors.background,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.24;ground.receiveShadow=true;scene.add(ground);
      resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);resize();
      const canvas=renderer.domElement;
      canvas.addEventListener('contextmenu',e=>e.preventDefault());
      canvas.addEventListener('pointerdown',e=>{if(options.isPaused())return;canvas.setPointerCapture(e.pointerId);state.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,button:e.button,moved:false};});
      canvas.addEventListener('pointermove',e=>{if(!state.drag)return;const dx=e.clientX-state.drag.lastX;if(Math.hypot(e.clientX-state.drag.x,e.clientY-state.drag.y)>6)state.drag.moved=true;if(state.drag.moved&&state.drag.button===2){state.angle-=dx*.006;fitCamera();}state.drag.lastX=e.clientX;});
      canvas.addEventListener('pointerup',e=>{const drag=state.drag;state.drag=null;if(!drag||drag.moved||drag.button!==0||options.isPaused())return;const hit=screenPoint(e.clientX,e.clientY);if(hit)options.onNavigate(hit.x,hit.y,hit.objectId);});
      canvas.addEventListener('pointercancel',()=>{state.drag=null;});canvas.addEventListener('wheel',e=>{if(options.isPaused())return;e.preventDefault();cameraAction(e.deltaY<0?'in':'out');},{passive:false});
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback('Utracono grafikę 3D. Aktywny widok uproszczony.');});
      state.ready=true;stage.dataset.renderer='webgl';stage.dataset.cameraZoom='1.00';
      if(config.onReady)config.onReady();
    }catch(error){console.warn('3D renderer unavailable; keeping canvas fallback.',error);fallback('Widok uproszczony: grafika 3D niedostępna. Demo pozostaje aktywne.');}
  }
  function fallback(message){
    state.ready=false;stage.dataset.renderer='canvas';resizeObserver?.disconnect();
    if(world){disposeWorld();world=null;}
    if(scene)scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();o.shadow?.dispose();});
    if(renderer){renderer.domElement.remove();renderer.dispose();}if(labels)labels.remove();
    renderMetrics.drawCalls=0;renderMetrics.geometries=0;renderMetrics.textures=0;renderMetrics.lastRendered=false;lastRenderSignature=null;renderInvalidated=true;
    if(options.onStatus)options.onStatus(message);
  }
  function markerLayout(marker){
    const pos=marker.point.clone().project(camera),x=(pos.x+1)/2*width,y=(1-pos.y)/2*height;
    const hidden=pos.z>1||x<30||x>width-30||y<0||y>height;
    const left=x+'px',top=y+'px';
    if(marker.lastLeft!==left){marker.element.style.left=left;marker.lastLeft=left;}
    if(marker.lastTop!==top){marker.element.style.top=top;marker.lastTop=top;}
    if(marker.lastHidden!==hidden){marker.element.hidden=hidden;marker.lastHidden=hidden;}
  }
  function updateMarkers(data,paused=typeof options?.isPaused==='function'&&options.isPaused()){
    if(labelLayoutDirty){markers.forEach(markerLayout);labelLayoutDirty=false;}
    for(const marker of markers){
      const {element,status,object}=marker;
      const near=data.nearObj===object;
      const completed=!!data.completed?.[object.id],visited=!!data.visited?.[object.id];
      const statusText=completed?'Ukończono':visited?'Odwiedzono':'Odkryj';
      if(marker.lastNear!==near){element.dataset.near=String(near);marker.lastNear=near;}
      if(marker.lastCompleted!==completed){element.dataset.completed=String(completed);marker.lastCompleted=completed;}
      if(marker.lastVisited!==visited){element.dataset.visited=String(visited);marker.lastVisited=visited;}
      if(marker.lastStatus!==statusText){status.textContent=statusText;marker.lastStatus=statusText;}
      if(marker.lastDisabled!==paused){element.disabled=paused;marker.lastDisabled=paused;}
    }
  }
  function renderChanged(data,paused){
    const p=data.player||{},target=p.target,previous=lastRenderSignature,targetX=target?.x,targetY=target?.y;
    if(previous&&previous.sceneId===data.sceneId&&previous.paused===paused&&previous.x===p.x&&previous.y===p.y&&previous.vx===p.vx&&previous.vy===p.vy&&previous.walk===p.walk&&previous.blend===p.blend&&previous.targetX===targetX&&previous.targetY===targetY)return false;
    if(previous){previous.sceneId=data.sceneId;previous.paused=paused;previous.x=p.x;previous.y=p.y;previous.vx=p.vx;previous.vy=p.vy;previous.walk=p.walk;previous.blend=p.blend;previous.targetX=targetX;previous.targetY=targetY;}
    else lastRenderSignature={sceneId:data.sceneId,paused,x:p.x,y:p.y,vx:p.vx,vy:p.vy,walk:p.walk,blend:p.blend,targetX,targetY};
    return true;
  }
  function render(data){
    if(!state.ready)return;
    if(state.sceneId!==data.sceneId||currentScene!==data.SC)rebuild(data.SC,data.sceneId);
    const paused=typeof options?.isPaused==='function'&&options.isPaused();
    updateMarkers(data,paused);
    const stateChanged=renderChanged(data,paused),changed=renderInvalidated||stateChanged;
    if(!changed){renderMetrics.skippedFrames++;renderMetrics.lastRendered=false;return;}
    const p=data.player;avatar.position.set(p.x/100,0,p.y/100);
    if(Math.hypot(p.vx,p.vy)>.1)avatar.rotation.y=Math.atan2(p.vx,p.vy);
    const swing=Math.sin(p.walk)*Math.min(p.blend,1)*.35;limbs.forEach((limb,i)=>{limb.rotation.x=swing*(i%3===0?1:-1);});
    ring.position.set(p.x/100,.04,p.y/100);targetRing.visible=!!p.target;if(p.target)targetRing.position.set(p.target.x/100,.04,p.target.y/100);
    renderer.render(scene,camera);state.frames++;renderMetrics.renders++;renderMetrics.lastRendered=true;
    renderMetrics.drawCalls=Number(renderer.info?.render?.calls)||0;renderMetrics.geometries=Number(renderer.info?.memory?.geometries)||0;renderMetrics.textures=Number(renderer.info?.memory?.textures)||0;
    renderInvalidated=false;
  }
  function screenMovement(x,y){const a=state.angle;return {x:x*Math.cos(a)+y*Math.sin(a),y:-x*Math.sin(a)+y*Math.cos(a)};}
  return {init,render,cameraAction,screenMovement,get ready(){return state.ready;},snapshot:()=>({renderer:stage?.dataset.renderer||'uninitialized',sceneId:state.sceneId,frames:state.frames,meshes:renderMetrics.drawCalls,drawCalls:renderMetrics.drawCalls,geometries:renderMetrics.geometries,textures:renderMetrics.textures,renders:renderMetrics.renders,skippedFrames:renderMetrics.skippedFrames,lastRendered:renderMetrics.lastRendered,zoom:state.zoom,angle:state.angle}),project:(x,y,h=0)=>{if(!camera)return null;const p=new THREE.Vector3(x/100,h,y/100).project(camera);return {x:(p.x+1)/2*width,y:(1-p.y)/2*height};}};
})();
