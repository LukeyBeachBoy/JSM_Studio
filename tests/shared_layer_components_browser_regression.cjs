const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1100,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/ux-shared-components',r=>r.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));
await page.goto('http://127.0.0.1:1459/ux-shared-components');
await page.evaluate(async()=>{
 const RefreshRuntime=(await import('/@react-refresh')).default;RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 const React=await import('/node_modules/.vite/deps/react.js');const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;const e=React.default.createElement;
 const {LayerUsageContext}=await import('/src/components/LayerBar.tsx');const {SettingOrigins,SettingOrigin}=await import('/src/components/SettingOrigin.tsx');
 const {ValueRow,OpenRow}=await import('/src/components/ui/console/Rows.tsx');const {SummaryRow}=await import('/src/components/ui/SummaryRow.tsx');
 const {SubPage}=await import('/src/components/ui/console/SubPage.tsx');const {ShellContext}=await import('/src/shell/ShellContext.tsx');
 const {InputText}=await import('/src/components/glyphs/InputText.tsx');
 await import('/src/styles/design-tokens.css');await import('/src/styles/console.css');
 window.resets=[];const layer={id:'driving',name:'Driving',overrides:{LEFT_STICK_DEADZONE_INNER:'0.25',GYRO_SENS:'2'}};
 const content=e('div',null,e(ValueRow,{label:'Deadzone',setting:'LEFT_STICK_DEADZONE_INNER',value:.25,min:0,max:1,step:.01,onChange:()=>{}}),e(SummaryRow,{label:'Gyro speed',setting:'GYRO_SENS',value:'2'}),e(SettingOrigin,{setting:'GYRO_SENS'}),e(OpenRow,{label:'Mouse Back held',value:'Mouse Forward',onOpen:()=>{}}),e('p',{id:'compound'},e(InputText,{text:'Mouse Back + Scroll up + Mouse Forward'})));
 const root=createRoot(document.getElementById('root'));
 const render=(nested=false)=>root.render(e(ShellContext.Provider,{value:{family:'steam',width:'wide',controller:false,configName:'UX test',modeName:'Driving'}},e(LayerUsageContext.Provider,{value:{text:'',actions:[],selected:layer,layers:[layer]}},e(SettingOrigins.Provider,{value:{text:'',own:'LEFT_STICK_DEADZONE_INNER = 0.25\nGYRO_SENS = 2',base:'LEFT_STICK_DEADZONE_INNER = 0.15\nGYRO_SENS = 1',origins:{},layer:'Driving',reset:key=>window.resets.push(key)}},nested?e(SubPage,{open:true,onClose:()=>{},trail:['Sticks'],title:'Fine-tune'},content):content))));
 window.renderNested=()=>render(true);render();
});
await page.getByText('Gyro speed',{exact:true}).waitFor();
for(const theme of ['dark','light']){
 await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 const colors=await page.locator('[data-tone="changed"], [data-setting-origin="GYRO_SENS"]').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).getPropertyValue('--layer-color').trim()));
 assert(colors.length>=3);assert(colors.every(c=>c===colors[0]&&c),'Settings primitives share selected-layer colour');
 assert.doesNotMatch(await page.locator('body').innerText(),/Changed in Driving/);
 assert.equal(await page.locator('#compound svg[role="img"]').count(),3,'Compound outputs all use accessible mouse icons');
}
await page.getByRole('button',{name:'Use Default',exact:true}).first().click();assert.deepEqual(await page.evaluate(()=>window.resets),['LEFT_STICK_DEADZONE_INNER']);
await page.evaluate(()=>window.renderNested());await page.getByRole('dialog').waitFor();assert(await page.getByText('Editing Driving',{exact:true}).isVisible());assert(await page.locator('[data-mode]').getByText('Driving',{exact:true}).isVisible());assert.doesNotMatch(await page.getByRole('dialog').innerText(),/Changed in this layer/);
assert.deepEqual(errors,[]);console.log('PASS: shared settings colours, reset behavior, compound mouse icons, nested editor context, light/dark');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
