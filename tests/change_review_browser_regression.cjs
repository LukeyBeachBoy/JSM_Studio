const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1420');
 await page.evaluate(async()=>{
  const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=ReactDOM;
  const {ChangeReview}=await import('/src/components/ChangeReview.tsx');const {useConfigHistory}=await import('/src/hooks/useConfigHistory.ts');const {revertConfigChange}=await import('/src/utils/configChanges.ts');const {writeLayers}=await import('/src/utils/layers.ts');
  const baseline=writeLayers('RESET_MAPPINGS\nN = SPACE\nW = TAB\nRSR,N = ENTER\nRIGHT_TOUCHPAD_MODE = MOUSE\n# @label N = Jump',[{id:'vehicles',name:'Vehicles',overrides:{N:'E',RIGHT_TOUCHPAD_SENS:'2'}}]);
  const edited=writeLayers(baseline.replace('N = SPACE','N = F').replace('W = TAB','W = ESC').replace('RSR,N = ENTER','RSR,N = LALT').replace('Jump','Interact').replace('MODE = MOUSE','MODE = GRID_AND_STICK'),[{id:'vehicles',name:'Vehicles',overrides:{N:'Q',RIGHT_TOUCHPAD_SENS:'3'}}]);
  function Harness(){const history=useConfigHistory();React.useEffect(()=>{history.reset(baseline);history.setTextAsAction(edited)},[]);return React.createElement(ChangeReview,{baseline,text:history.text,family:'steam',disabled:false,canUndo:history.canUndo,canRedo:history.canRedo,onUndo:history.undo,onRedo:history.redo,onRevert:change=>history.setTextAsAction(text=>revertConfigChange(text,baseline,change)),onRevertAll:()=>history.setTextAsAction(baseline),onApply:()=>{},onClose:()=>{}})}
  const container=document.createElement('div');document.body.append(container);createRoot(container).render(React.createElement(Harness));
 });
 const dialog=page.getByRole('dialog',{name:'Review changes',exact:true});await dialog.waitFor();
 assert.match(await dialog.innerText(),/7 changes/);assert.match(await dialog.innerText(),/Modeshift/);assert.match(await dialog.innerText(),/While holding/);assert.match(await dialog.innerText(),/Layer · Vehicles/);
 assert.ok(await dialog.locator('kbd').count()>3);
 await page.waitForTimeout(400);await page.screenshot({path:'tools/change-review-desktop.png'});
 await dialog.getByRole('button',{name:'Revert Y',exact:true}).click();
 assert.match(await dialog.innerText(),/6 changes/);
 await dialog.getByRole('button',{name:/^Undo/}).click();assert.match(await dialog.innerText(),/7 changes/);
 await dialog.getByRole('button',{name:/^Redo/}).click();assert.match(await dialog.innerText(),/6 changes/);
 await dialog.getByRole('button',{name:'Revert all',exact:true}).click();await dialog.getByRole('heading',{name:'No pending changes'}).waitFor();
 await dialog.getByRole('button',{name:/^Undo/}).click();assert.match(await dialog.innerText(),/6 changes/);
 await page.setViewportSize({width:620,height:760});await page.screenshot({path:'tools/change-review-compact.png'});
 assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);assert.deepEqual(errors,[]);
 console.log('PASS: grouped review, input glyphs, keycaps, modeshift tone, selective revert undo/redo, revert-all undo and compact layout');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

