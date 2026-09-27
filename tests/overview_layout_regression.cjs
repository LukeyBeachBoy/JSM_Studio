// Dense controller summaries, exercised entirely against a mocked renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = `RESET_MAPPINGS
N = F
E = C
S = SPACE
W = R
L = Q
R = E
ZL = RMOUSE
ZLF = LSHIFT
ZR = LMOUSE
+ = ESC
- = TAB
LSL = NONE
LSR = SPACE
RSR = NONE
RSL = M
LUP = W
LDOWN = S
LLEFT = A
LRIGHT = D
L3 = LSHIFT
R3 = LCONTROL
UP = G
DOWN = X
LEFT = I
RIGHT = B
LSL,N = H
LSL,E = L
LSL,S = V
LSL,W = B
LSL,L = SCROLLUP
LSL,R = SCROLLDOWN
LSL,+ = "profiles-library/Wardogs Menu.txt"
LSL,- = ENTER
LSL,UP = 0
LSL,DOWN = 9
LSL,LEFT = PAGEDOWN
LSL,RIGHT = PAGEUP
RSR,N = J
RSR,E = K
RSR,W = U
LEFT_STICK_MODE = NO_MOUSE
RIGHT_STICK_MODE = RADIAL_MENU
LEFT_TOUCHPAD_MODE = GRID_AND_STICK
RIGHT_TOUCHPAD_MODE = MOUSE
MISC2 = NONE
MISC2,RIGHT_TOUCHPAD_MODE = GRID_AND_STICK
LT1 = R
LT2 = B
RT1 = MMOUSE
RT2 = V
RM1 = 1
RM2 = 2
# @label N = Interact
# @label S = Jump / deploy parachute
# @label LSL = Vehicle and utility controls
# @label RSR,N = Squad push-to-talk with a deliberately long descriptive label
# @label LSL,N = Horn
# @layer {"id":"comms","name":"Comms","trigger":"RSR","overrides":{"N":"J","# @label N":"Squad VOIP"}}
# @layer {"id":"vehicle","name":"Vehicles","trigger":"","applyTrigger":"LSR","removeTrigger":"RSL","overrides":{"N":"H"}}
`;
(async () => {
 const browser = await chromium.launch({ channel:'msedge', headless:true });
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(content=>{
   window.electronAPI={getActiveProfile:async()=>({name:'Wardogs',path:'profiles-library/Wardogs.txt',content}),listLibraryProfiles:async()=>['Wardogs']};
   window.telemetry={onSample:cb=>{
    const emit=()=>cb({activeProfile:'profiles-library/Wardogs.txt',devices:window.__offline?[]:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:false}}}]});
    emit();const timer=setInterval(emit,100);return()=>clearInterval(timer);
   }};
  },fixture);
  await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
  // The app opens on Home (console refinement 2a); these checks start in the editing shell.
  await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
  await page.locator('.profile-chip').filter({hasText:'Wardogs'}).waitFor();
  const input=command=>page.locator(`[data-overview-input="${command}"]`);
  const group=id=>page.locator(`[data-overview-group="${id}"]`);
  for(const [id,commands] of Object.entries({'left-shoulder':['L','ZL','LSL','LSR'],'left-middle':['-'],'right-middle':['+'],'left-stick':['LUP','L3'],'dpad':['UP','DOWN'],'right-stick':['R3','RM1'],'face':['N','S'],'left-pad':['LT1'],'right-pad':['RT1','MISC2']})) {
   for(const command of commands) assert.equal(await group(id).locator(`[data-overview-input="${command}"]`).count(),1,`${command} in ${id}`);
  }
  // Overview.dc.html: the paddles sit with the shoulder and grip, and a trigger's
  // full pull is told on the trigger's own row rather than as a second callout.
  assert.equal(await input('ZLF').count(),0,'the full pull folds into the trigger row');
  assert.match(await input('ZL').innerText(),/full pull Left Shift/);
  // Names follow the connected controller, so wait for its telemetry first.
  // A callout's fixed lines hold the name and chips (2g); what else an input
  // does is its inspector's account -- here, the callout's accessible name.
  await page.waitForFunction(()=>/Hold R4: Squad push-to-talk/.test(document.querySelector('[data-overview-input="N"]')?.getAttribute('aria-label') ?? ''));
  assert.match(await input('N').getAttribute('aria-label'),/Hold R4: Squad push-to-talk/);
  assert.doesNotMatch(await input('N').getAttribute('aria-label'),/@LABEL|@ICON/,'annotations must not become phantom modeshift bindings');
  assert.match(await input('+').getAttribute('aria-label'),/Load Wardogs Menu/);
  // A modifier says which inputs it changes, rather than counting them: the old
  // "Modeshift trigger - N changed inputs / settings" named nothing at all.
  assert.match(await input('LSL').getAttribute('aria-label'),/While held, changes \w+.* and \d+ more/);
  assert.match(await input('LSL').innerText(),/Shifts \d+/, 'and shows it as a Shifts chip');
  const layoutCheck=async()=>{
   const failures=await page.locator('[data-overview-group]').evaluateAll(groups=>groups.flatMap(group=>{
    const buttons=[...group.querySelectorAll('[data-overview-input]')];
    return buttons.flatMap((button,i)=>{
     const r=button.getBoundingClientRect(), prev=buttons[i-1]?.getBoundingClientRect();
     const text=button.querySelector('span').getBoundingClientRect();
     return [...(prev && r.top<prev.bottom-1?['overlapping rows']:[]),...(text.bottom>r.bottom+1?['text escapes row']:[]),...(button.scrollWidth>button.clientWidth+1?['horizontal overflow']:[])];
    });
   }));
   assert.deepEqual(failures,[]);
  };
  await layoutCheck();
  const diagram=await page.getByRole('img',{name:'Steam Controller live status',exact:true}).boundingBox();
  assert.ok((await group('face').boundingBox()).y>diagram.y+diagram.height);
  // Callout glyphs are the design's medium size (--glyph-md).
  assert.equal(await input('ZL').locator('svg').getAttribute('width'),'28');
  const tabs=page.getByRole('group',{name:'Preview layer',exact:true});
  await tabs.getByRole('button',{name:'Comms',exact:true}).click();
  assert.equal((await page.locator('.context-segment--layer b').innerText()),'Comms');
  assert.match(await input('N').innerText(),/Squad VOIP/);
  await page.getByRole('button',{name:/^Editing layer:/}).click();await page.getByRole('menuitem').filter({has:page.locator('[class*=itemLabel]').getByText('Vehicles',{exact:true})}).click();
  assert.equal(await tabs.getByRole('button',{name:'Vehicles',exact:true}).getAttribute('aria-pressed'),'true');
  await tabs.getByRole('button',{name:'Default',exact:true}).click();
  const artifacts=path.resolve(__dirname,'../tmp/overview-review');fs.mkdirSync(artifacts,{recursive:true});
  await page.screenshot({path:path.join(artifacts,'overview-desktop.png'),fullPage:true});
  await page.locator('.shell-scroll').evaluate(el=>{el.scrollTop=400});
  await page.screenshot({path:path.join(artifacts,'overview-groups.png')});
  for(const width of [900,600]) {
   await page.setViewportSize({width,height:1000}); await layoutCheck();
   await page.screenshot({path:path.join(artifacts,`overview-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await input('N').click();
  await page.locator('details[data-input-command="N"]').waitFor();
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await page.evaluate(()=>{window.__offline=true});
  await page.getByRole('img',{name:'Steam Controller live status',exact:true}).waitFor({state:'hidden'});
  await input('N').waitFor(); await layoutCheck();
  assert.deepEqual(errors,[]);
  console.log('PASS: physical input groups, wrapping without overlap, large glyphs, layer previews, input navigation, narrow layouts and offline bindings');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
