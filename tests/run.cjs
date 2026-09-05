const {spawnSync}=require('node:child_process');
const path=require('node:path');

const tests=['navigation','navigation-cache','interaction','location-layouts','product-links','zagloba'];
for(const test of tests){
  const result=spawnSync(process.execPath,[path.join(__dirname,test+'.cjs')],{stdio:'inherit',timeout:30000});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if(result.status!==0)process.exit(result.status||1);
}
console.log(`PASS: ${tests.length} deterministic suites`);
