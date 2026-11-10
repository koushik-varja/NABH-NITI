/* Pure visualization-policy regression tests. Run with `npm run test:visuals`.
 * Uses the project's TypeScript dev dependency, not a browser or a server.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/visuals.ts');
const transpiled = ts.transpileModule(fs.readFileSync(file,'utf8'), {
  fileName: file,
  reportDiagnostics: true,
  compilerOptions: {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
});
assert.equal(transpiled.diagnostics.length,0,'TypeScript parser diagnostics');
const moduleShim = {exports:{}};
vm.runInNewContext(transpiled.outputText,{module:moduleShim,exports:moduleShim.exports,require});
const {displayFleet,detailedFleet,worldPosition,cityDimensions} = moduleShim.exports;
const grid = {width:24,height:20,levels:4};
const fleet = Array.from({length:500},(_,id)=>({
  id,kind:id%11===0?'medical':id%4===0?'cargo':'delivery',
  priority:id%11===0?10:2,pos:[id%24,Math.floor(id/24)%20,id%4],
  sector:`S${Math.floor(id%24/6)}-${Math.floor((Math.floor(id/24)%20)/5)}`,
  waiting:id%17===0?12:0
}));
const base = {kind:'all',sector:'all',altitude:-1,scope:'smart'};
const smart = displayFleet(fleet,base,499);
assert.ok(smart.length>0&&smart.length<=78);
assert.ok(smart.some(d=>d.id===499),'Selected drone must not disappear in Smart view');
assert.equal(displayFleet(fleet,{...base,scope:'all'},null).length,500,'All mode must not drop agents');
assert.ok(displayFleet(fleet,{...base,scope:'priority'},null).every(d=>d.kind==='medical'||d.waiting>=7));
assert.ok(displayFleet(fleet,{...base,scope:'density'},null).length<=20);
assert.ok(displayFleet(fleet,{...base,kind:'medical'},null).every(d=>d.kind==='medical'));
assert.ok(displayFleet(fleet,{...base,sector:'S0-0'},null).every(d=>d.sector==='S0-0'));
assert.ok(displayFleet(fleet,{...base,altitude:2},null).every(d=>d.pos[2]===2));
assert.ok(detailedFleet(smart,499).some(d=>d.id===499),'Selected drone must be full-detail');
assert.ok(cityDimensions(grid).width>grid.width*3,'City must be spatially expanded');
assert.ok(worldPosition([11,9,3],grid)[1]>worldPosition([11,9,0],grid)[1]);
assert.equal(fleet.length,500,'Do not mutate the backend fleet');
console.log(`PASS: 11 visualization assertions  |  500 simulated  |  ${smart.length} displayed in Smart mode`);
