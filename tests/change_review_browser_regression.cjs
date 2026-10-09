const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1420');
 await page.evaluate(async()=>{
  // The same React the app's modules use: Vite pins it with a ?v= hash, and a second copy breaks hooks.
  const version=(await (await fetch('/src/components/ChangeReview.tsx')).text()).match(/deps\/react[^"?]*\.js\?v=([a-z0-9]+)/)?.[1];const v=version?'?v='+version:'';
  const {default:React}=await import('/node_modules/.vite/deps/react.js'+v);const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js'+v);const {createRoot}=ReactDOM;
  const {ChangeReview}=await import('/src/components/ChangeReview.tsx');const {useConfigHistory}=await import('/src/hooks/useConfigHistory.ts');const {revertConfigChange}=await import('/src/utils/configChanges.ts');const {writeLayers}=await import('/src/utils/layers.ts');
  const baseline=writeLayers('RESET_MAPPINGS\nN = SPACE\nW = TAB\nRSR,N = ENTER\nRIGHT_TOUCHPAD_MODE = MOUSE\n# @label N = Jump',[{id:'vehicles',name:'Vehicles',overrides:{N:'E',RIGHT_TOUCHPAD_SENS:'2'}}]);
  const edited=writeLayers(baseline.replace('N = SPACE','N = F').replace('W = TAB','W = ESC').replace('RSR,N = ENTER','RSR,N = LALT').replace('Jump','Interact').replace('MODE = MOUSE','MODE = GRID_AND_STICK'),[{id:'vehicles',name:'Vehicles',overrides:{N:'Q',RIGHT_TOUCHPAD_SENS:'3'}}]);
  function Harness(){const history=useConfigHistory();React.useEffect(()=>{history.reset(baseline);history.setTextAsAction(edited)},[]);return React.createElement(ChangeReview,{baseline,text:history.text,family:'steam',disabled:false,canUndo:history.canUndo,canRedo:history.canRedo,onUndo:history.undo,onRedo:history.redo,onRevert:change=>history.setTextAsAction(text=>revertConfigChange(text,baseline,change)),onRevertAll:()=>history.setTextAsAction(baseline),onApply:()=>{},onClose:()=>{}})}
  const container=document.createElement('div');document.body.append(container);createRoot(container).render(React.createElement(Harness));
 });
 // Review changes is a full page now (console v2, ReviewChanges): grouped like the tabs, before → after inline.
 const dialog=page.getByRole('dialog',{name:/Review changes$/});await dialog.waitFor();
 const text=async()=>dialog.innerText();
 assert.match(await text(),/7 changes/);assert.match(await text(),/With \S+ held/);assert.doesNotMatch(await text(),/Modeshift/);
 assert.match(await text(),/Vehicles layer/i);assert.match(await text(),/Same as Default|→/);
 assert.match(await text(),/Buttons/i);assert.match(await text(),/Trackpads/i);
 // The history names each edit, Undo says what it undoes.
 assert.match(await dialog.getByRole('button',{name:'Undo'}).innerText(),/Undo/);
 await page.waitForTimeout(400);await page.screenshot({path:'tools/change-review-desktop.png'});
 await dialog.getByRole('button',{name:'Revert Y button name',exact:true}).click();
 assert.match(await text(),/6 changes/);
 await dialog.getByRole('button',{name:'Undo'}).click();assert.match(await text(),/7 changes/);
 await dialog.getByRole('button',{name:'Redo'}).click();assert.match(await text(),/6 changes/);
 // X on a focused row reverts it too.
 await dialog.locator('[data-change-id]').first().evaluate(el=>{el.focus();el.dispatchEvent(new CustomEvent('jsm:pad',{detail:{button:'X'},bubbles:true,cancelable:true}))});assert.match(await text(),/5 changes/);
 await dialog.getByRole('button',{name:'Discard all 5',exact:true}).click();await dialog.getByRole('heading',{name:'No pending changes'}).waitFor();
 await dialog.getByRole('button',{name:'Undo'}).click();assert.match(await text(),/5 changes/);
 await page.setViewportSize({width:620,height:760});await page.screenshot({path:'tools/change-review-compact.png'});
 assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);assert.deepEqual(errors,[]);
 console.log('PASS: grouped review page, input glyphs, chord wording, before → after, selective revert (button and X), undo/redo, discard-all undo and compact layout');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

