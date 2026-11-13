const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const source = fs.readFileSync('build-jsm-sdl/cyberpunk-rewasd-import/Cyberpunk.txt','utf8')
  const browser = await chromium.launch({channel:'msedge',headless:true})
  try {
    const page = await browser.newPage({viewport:{width:1400,height:1000},reducedMotion:'reduce'})
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1424/?mock')
    await page.waitForSelector('main')
    await page.evaluate(async source => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const {ControllerLayoutScope} = await import('/src/components/ControllerLayoutScope.tsx')
      const {projectController,hasEffectiveControllerVariant,foldController} = await import('/src/utils/controllerLayouts.ts')
      const {getKeymapValue,updateKeymapEntry} = await import('/src/utils/keymap.ts')
      const {readLayerActions} = await import('/src/utils/layers.ts')
      const target='type-25-device-00000000000076cd'
      const projected=projectController(source,target)
      if (!hasEffectiveControllerVariant(source,target) || getKeymapValue(projected,'JOY1') !== 'LCONTROL' || getKeymapValue(projected,'JOY26') !== 'B') throw Error('Recovered model layout must reach the physical controller')
      const edited=foldController(source,'type-25',projectController(source,'type-25'),updateKeymapEntry(projectController(source,'type-25'),'JOY4',['C']))
      if (readLayerActions(projectController(edited,'type-25')).filter(action=>action.input==='MOUSE_BACK').length !== 2) throw Error('Saving must preserve both mouse-Back layer actions')
      document.documentElement.dataset.theme='dark';document.documentElement.dataset.accent='amber'
      const host=document.createElement('div');document.body.append(host)
      function Test() {
        const [text,setText]=React.useState(source),[model,setModel]=React.useState(target)
        return React.createElement(ControllerLayoutScope,{open:true,onClose:()=>{},text,effectiveText:text,configName:'Cyberpunk',model,onModel:setModel,onChange:setText,
          devices:[{type:25,handle:25,controllerId:target},{type:24,handle:24}]})
      }
      createRoot(host).render(React.createElement(Test))
    },source)
    const dialog=page.getByRole('dialog',{name:/Layout for this controller$/})
    await dialog.getByText('Using the saved model layout. Changes here apply only to this device.',{exact:true}).waitFor()
    assert.equal(await dialog.getByText(/Your first change here/).count(),0)
    await dialog.getByText('Azeron Cyborg (model default)',{exact:true}).waitFor()
    assert.equal(await dialog.getByText('Azeron Cyborg (disconnected)',{exact:true}).count(),0,'A model default is not a disconnected extra device')
    const add=dialog.locator('details').filter({has:page.locator('summary',{hasText:'Add another controller to this game config'})})
    const review=dialog.locator('details').filter({has:page.locator('summary',{hasText:'Review controls from the shared layout'})})
    assert.equal(await add.getAttribute('open'),null)
    assert.equal(await review.getAttribute('open'),null)
    fs.mkdirSync('build-jsm-sdl/azeron-acceptance',{recursive:true})
    await page.screenshot({path:'build-jsm-sdl/azeron-acceptance/layout-simplified-amber.png'})
    await add.locator('summary').click()
    const checkTheme = () => dialog.locator('#add-controller-model').evaluate(select=>{
      const probe=document.createElement('span');probe.style.backgroundColor='var(--surface-control)';document.body.append(probe)
      const actual=getComputedStyle(select).backgroundColor,expected=getComputedStyle(probe).backgroundColor;probe.remove();return {actual,expected}
    })
    const dark=await checkTheme();assert.equal(dark.actual,dark.expected)
    await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.dataset.accent='teal'})
    const light=await checkTheme();assert.equal(light.actual,light.expected);assert.notEqual(light.actual,dark.actual)
    await page.screenshot({path:'build-jsm-sdl/azeron-acceptance/layout-simplified-light.png'})
    await page.setViewportSize({width:900,height:1000})
    assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'No horizontal overflow at the app’s minimum width')
    assert.deepEqual(errors,[])
    console.log('PASS: physical-device inheritance, recovered bindings, multiple mouse actions, compact disclosures, amber/light theme controls and minimum-width layout')
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)})
