const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context={window:{}};vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('const PRODUCTS='),html.indexOf('const player='))+';this.products=PRODUCTS;this.scenes=SCENES;this.pages=PRODUCT_PAGES;',context);
let count=0;
for(const scene of Object.values(context.scenes))for(const object of scene.objects){
  assert.equal(context.pages[object.product],`https://quanticalab.ai/${object.product}_website.html`);
  count++;
}
assert.equal(count,12);
assert.match(html,/<a[^>]+id="mProductLink"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
assert.match(html,/productLink.href=PRODUCT_PAGES\[obj.product\]/);
assert.match(html,/productLink.dataset.product=obj.product/);
console.log('PASS: all 12 examples map to official product pages with a persistent safe external link');
