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
  // A Steam Controller's first connection asks about its power-on sound.
  await page.addLocatorHandler(page.getByRole('button',{name:'Keep them',exact:true}), async () => { await page.getByRole('button',{name:'Keep them',exact:true}).click() });
  // The app opens on Home (console refinement 2a); these checks start in the editing shell.
  await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
  await page.locator('.profile-chip').filter({hasText:'Wardogs'}).waitFor();
  const input=command=>page.locator(`[data-overview-input="${command}"]`);
  const slot=id=>page.locator(`[data-overview-slot="${id}"]`);
  const group=id=>page.locator(`[data-overview-group="${id}"]`);
  // Layout.dc.html: two columns of one-line callouts. Singles keep their own
  // callout; the D-pad, face buttons, sticks and pads are one callout each
  // (D, ABXY, LS / RS, LP / RP) standing for all of their inputs.
  for(const [id,slots] of Object.entries({left:['ZL','L','LSL','-','left-stick','dpad','left-pad','LSR'],right:['ZR','R','RSR','RSL','+','face','right-stick','right-pad']})) {
   for(const name of slots) assert.equal(await group(id).locator(`[data-overview-slot="${name}"]`).count(),1,`${name} in the ${id} column`);
  }
  for(const [id,members] of Object.entries({'left-stick':['LUP','L3'],dpad:['UP','DOWN'],'right-stick':['R3','RM1'],face:['N','S'],'left-pad':['LT1'],'right-pad':['RT1','MISC2']})) {
   const inputs=(await slot(id).getAttribute('data-overview-inputs')).split(' ');
   for(const member of members) assert.ok(inputs.includes(member),`${member} is part of ${id}`);
  }
  // A trigger's full press is told on the trigger's own row rather than as a second callout.
  assert.equal(await input('ZLF').count(),0,'the full press folds into the trigger row');
  assert.match(await input('ZL').innerText(),/full · Left Shift/);
  // Names follow the connected controller, so wait for its telemetry first.
  // A callout is one line; what else an input does is its accessible name's
  // (and the focus card's) account -- a group names every member.
  await page.waitForFunction(()=>/Hold R4: Squad push-to-talk/.test(document.querySelector('[data-overview-slot="face"]')?.getAttribute('aria-label') ?? ''));
  assert.match(await slot('face').getAttribute('aria-label'),/Hold R4: Squad push-to-talk/);
  assert.doesNotMatch(await slot('face').getAttribute('aria-label'),/@LABEL|@ICON/,'annotations must not become phantom modeshift bindings');
  assert.match(await input('+').getAttribute('aria-label'),/Load Wardogs Menu/);
  // A modifier says which inputs it changes, rather than counting them: the old
  // "Modeshift trigger - N changed inputs / settings" named nothing at all.
  assert.match(await input('LSL').getAttribute('aria-label'),/While held, changes \w+.* and \d+ more/);
  assert.match(await input('LSL').innerText(),/while held/, 'and its one line says it acts while held');
  const layoutCheck=async()=>{
   const failures=await page.locator('[data-overview-group]').evaluateAll(groups=>groups.flatMap(group=>{
    const buttons=[...group.querySelectorAll('[data-overview-input]')];
    return buttons.flatMap((button,i)=>{
     const r=button.getBoundingClientRect(), prev=buttons[i-1]?.getBoundingClientRect();
     if(!r.height) return [];
     const text=[...button.querySelectorAll('span')].map(span=>span.getBoundingClientRect());
     return [...(prev && prev.height && r.top<prev.bottom-1?['overlapping rows']:[]),...(text.some(box=>box.bottom>r.bottom+1)?['text escapes row']:[]),...(button.scrollWidth>button.clientWidth+1?['horizontal overflow']:[]),...(Math.round(r.height)!==50?[`row is ${r.height} high`]:[])];
    });
   }));
   assert.deepEqual(failures,[]);
  };
  await layoutCheck();
  const diagram=await page.getByRole('img',{name:'Steam Controller live status',exact:true}).boundingBox();
  // The focus card sits under the art and names the focused input.
  await input('L').focus();
  const card=page.locator('[data-focus-card]');
  assert.ok((await card.boundingBox()).y>=diagram.y+diagram.height-1,'the focus card is under the art');
  assert.match(await card.innerText(),/Left bumper/);
  assert.match(await card.innerText(),/Same in every layer/);
  // The back view appears only while an input that lives there has focus.
  assert.equal(await page.getByRole('img',{name:'Steam Controller back, mirrored'}).count(),0,'no back view for a front input');
  await input('MISC5').focus();
  await page.getByRole('img',{name:'Steam Controller back, mirrored'}).waitFor();
  assert.match(await page.locator('.main-pane').innerText(),/Back · Right grip/i);
  // Callout glyphs are the design's medium size (--glyph-md).
  assert.equal(await input('ZL').locator('svg').getAttribute('width'),'28');
  // The mode strip: each mode with how it turns on, in quiet text.
  const tabs=page.getByRole('group',{name:'Showing layer',exact:true});
  assert.match(await tabs.innerText(),/Comms\s*hold R4/);
  await tabs.getByRole('button',{name:'Comms',exact:true}).click();
  assert.equal(await tabs.getByRole('button',{name:'Comms',exact:true}).getAttribute('aria-pressed'),'true');
  // Other tabs say which mode they edit in the footer; Layout does too.
  await page.waitForFunction(()=>/Comms layer/.test(document.querySelector('.hint-capsule')?.textContent ?? ''));
  assert.match(await slot('face').innerText(),/Squad VOIP/);
  await slot('face').focus();
  assert.match(await card.innerText(),/Changed in Comms/);
  // LT / RT step the strip from the keyboard ([ and ]) as from the pad.
  await page.keyboard.press(']');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Showing layer"] [aria-label="Vehicles"]')?.getAttribute('aria-pressed')==='true');
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
  // A goes to the input's own tab: the face buttons to Buttons.
  await slot('face').click();
  await page.waitForFunction(()=>document.querySelector('.page-tabs [aria-current], .page-tabs [aria-selected="true"]')?.textContent?.trim()==='Buttons');
  await page.getByRole('button',{name:'Layout',exact:true}).click();
  await page.evaluate(()=>{window.__offline=true});
  await page.getByRole('img',{name:'Steam Controller live status',exact:true}).waitFor({state:'hidden'});
  await slot('face').waitFor(); await layoutCheck();
  assert.deepEqual(errors,[]);
  console.log('PASS: two columns of one-line callouts with grouped inputs, focus card and back view, large glyphs, the mode strip, input navigation, narrow layouts and offline bindings');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
