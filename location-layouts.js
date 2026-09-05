/* ─── Location identity: one plan shared by rendering and collision detection ─── */
window.LocationLayouts=(()=>{
  if(typeof document!=='undefined'){
    const style=document.createElement('style');style.textContent=':root{--location-terminalTile:#E5EEF2;--location-terminalJoint:#D2DFE5;--location-terminalCarpet:#D5E4E8;--location-terminalWeave:#C4D6DC;--location-bankStone:#E8E0D3;--location-bankJoint:#D7CABB;--location-bankCarpet:#CBD8D0;--location-bankWeave:#B8C9BE;--location-civicStone:#EEE6D7;--location-civicJoint:#DDD1BA;--location-civicWood:#D5B994;--location-civicGrain:#B99B74;--location-civicCarpet:#E1E5D9;--location-civicWeave:#CDD4C2}';document.head.appendChild(style);
  }
  const layouts={
    airport:{
      identity:'terminal',landmarks:['aircraft','departures','boarding-gate'],
      spawn:{x:110,y:590},
      floors:[{x:18,y:18,w:1044,h:310,c:'terminalTile',pat:'tiles',pc:'terminalJoint'},{x:18,y:338,w:662,h:304,c:'terminalCarpet',pat:'carpet',pc:'terminalWeave'},{x:700,y:338,w:362,h:304,c:'terminalTile',pat:'tiles',pc:'terminalJoint'}],
      walls:[{x:685,y:338,w:10,h:90},{x:685,y:548,w:10,h:94},{x:695,y:333,w:367,h:10}],
      doors:[{x:690,y:488,dir:'y',w:120}],
      blocks:[{kind:'seats',x:880,y:210,w:145,h:34},{kind:'plant',x:710,y:65,w:30,h:30},{kind:'gatepost',x:525,y:76,w:20,h:13},{kind:'gatepost',x:575,y:76,w:20,h:13}],
      props:[{kind:'board',x:880,y:66,w:190,t:'ODLOTY'},{kind:'barrier',x:255,y:305,w:145}],
      zones:[{x:255,y:100,t:'ODPRAWA'},{x:430,y:60,t:'BRAMKA A1'}],
      stations:{kmicic:{x:250,y:195,w:195,h:64},papkin:{x:300,y:490,w:230,h:110},gerwazy:{x:885,y:480,w:180,h:86},zagloba:{x:550,y:200,w:85,h:65}},
      cameraBounds:{x0:-.25,x1:11.05,z0:-4.15,z1:6.85,height:1.9}
    },
    bank:{
      identity:'financial-lobby',landmarks:['vault','atm','teller-counter'],
      spawn:{x:510,y:600},
      floors:[{x:18,y:18,w:672,h:624,c:'bankStone',pat:'tiles',pc:'bankJoint'},{x:710,y:18,w:352,h:624,c:'bankCarpet',pat:'carpet',pc:'bankWeave'}],
      walls:[{x:695,y:18,w:12,h:228},{x:695,y:366,w:12,h:276}],
      doors:[{x:701,y:306,dir:'y',w:120}],
      blocks:[{kind:'vault',x:905,y:120,w:230,h:150},{kind:'plant',x:610,y:72,w:30,h:30}],
      props:[{kind:'atm',x:85,y:210},{kind:'bench',x:210,y:590,w:105,h:34}],
      zones:[{x:235,y:365,t:'OBSŁUGA KLIENTA'}],
      stations:{kmicic:{x:235,y:465,w:210,h:66},papkin:{x:405,y:175,w:225,h:105},gerwazy:{x:890,y:490,w:180,h:86},zagloba:{x:530,y:455,w:85,h:65}},
      cameraBounds:{x0:-.25,x1:11.05,z0:-.5,z1:6.85,height:2.05}
    },
    office:{
      identity:'civic-hall',landmarks:['civic-facade','polish-flag','noticeboard','council-chamber'],
      spawn:{x:285,y:605},
      floors:[{x:18,y:18,w:387,h:624,c:'civicStone',pat:'tiles',pc:'civicJoint'},{x:425,y:18,w:637,h:305,c:'civicWood',pat:'planks',pc:'civicGrain'},{x:425,y:343,w:637,h:299,c:'civicCarpet',pat:'carpet',pc:'civicWeave'}],
      walls:[{x:407,y:18,w:12,h:230},{x:407,y:368,w:12,h:274},{x:419,y:325,w:280,h:12},{x:819,y:325,w:243,h:12}],
      doors:[{x:413,y:308,dir:'y',w:120},{x:759,y:331,dir:'x',w:120}],
      blocks:[{kind:'noticeboard',x:160,y:80,w:190,h:28},{kind:'plant',x:990,y:590,w:30,h:30}],
      props:[{kind:'flag',x:1000,y:75},{kind:'bench',x:95,y:480,w:80,h:32}],
      zones:[{x:220,y:220,t:'BIURO OBSŁUGI MIESZKAŃCA'},{x:600,y:70,t:'SALA RADY'}],
      stations:{kmicic:{x:220,y:325,w:185,h:64},papkin:{x:720,y:200,w:245,h:110},gerwazy:{x:845,y:500,w:180,h:86},zagloba:{x:535,y:475,w:85,h:65}},
      cameraBounds:{x0:-.25,x1:11.05,z0:-.45,z1:6.85,height:2.1}
    }
  };
  function apply(scenes){
    for(const [id,layout] of Object.entries(layouts)){
      const scene=scenes[id];if(!scene)continue;
      for(const key of ['identity','landmarks','spawn','floors','walls','doors','blocks','props','zones','cameraBounds'])scene[key]=JSON.parse(JSON.stringify(layout[key]));
      if(typeof getComputedStyle==='function'){const css=getComputedStyle(document.documentElement);for(const floor of scene.floors)for(const key of ['c','pc'])floor[key]=css.getPropertyValue('--location-'+floor[key]).trim();}
      for(const object of scene.objects)if(layout.stations[object.product])Object.assign(object,layout.stations[object.product]);
    }
  }
  return {apply,identities:Object.keys(layouts)};
})();
