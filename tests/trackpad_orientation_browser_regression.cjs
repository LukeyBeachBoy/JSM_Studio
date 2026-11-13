// Controlled selected-device telemetry; does not claim physical-controller testing.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = path.resolve('tmp/technical-terms')
fs.mkdirSync(output, { recursive: true })
// Compare the frontend preview with the actual native rotation and edge clamp.
const cpp = path.join(output, 'orientation-parity.cpp'), exe = path.join(output, 'orientation-parity.exe')
fs.writeFileSync(cpp, '#include "TouchpadRotation.h"\n#include <iostream>\n#include <iomanip>\nint main(){std::cout << std::setprecision(9); for(float a: {-180.f,-90.f,-45.f,-10.5f,0.f,10.7f,45.f,90.f,180.f}) for(float x: {-1.f,-.8f,0.f,.8f,1.f}) for(float y: {-1.f,-.6f,0.f,.6f,1.f}){float u=(x+1)/2,v=(y+1)/2;touchpad_rotation::rotate(u,v,a);std::cout<<x<<","<<y<<","<<a<<","<<u*2-1<<","<<v*2-1<<"\\n";}}')
const bat = path.join(output, 'orientation-parity.cmd')
fs.writeFileSync(bat, `@echo off\r\ncall "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat" >nul\r\ncl /nologo /EHsc /std:c++17 /I "${path.resolve('JoyShockMapper/JoyShockMapper/include')}" "${cpp}" /Fo:"${output}\\orientation-parity.obj" /Fe:"${exe}"\r\n`)
const compile = spawnSync('cmd.exe', ['/d', '/c', bat], { encoding: 'utf8' })
assert.equal(compile.status, 0, compile.stdout + compile.stderr)
const native = spawnSync(exe, [], { encoding: 'utf8' }); assert.equal(native.status, 0)
const cases = native.stdout.trim().split(/\r?\n/).map(line => line.split(',').map(Number))
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1428/?mock')
    await page.evaluate(async cases => {
      const { rotatePadPoint } = await import('/src/utils/touchpadOrientation.ts')
      for (const [x,y,a,u,v] of cases) { const p=rotatePadPoint({x,y},a); if(Math.abs(p.x-u)>1e-5 || Math.abs(p.y-v)>1e-5) throw Error(`Native parity at ${x},${y},${a}`) }
      const React=(await import('/node_modules/.vite/deps/react.js')).default
      const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const {TrackpadFineTune}=await import('/src/components/trackpads/TrackpadFineTune.tsx')
      const host=document.createElement('div');host.id='orientation-test';document.body.append(host)
      function Test(){
        const [s,set]=React.useState({group:'orientation',side:'right',angle:90,online:true,touched:true,raw:true,point:{x:0,y:-.8},handle:1})
        window.patchOrientation=p=>set(v=>({...v,...p}))
        const key=s.side==='left'?'leftPad':'rightPad',rawKey=s.side==='left'?'leftPadRaw':'rightPadRaw'
        const point=rotatePadPoint(s.point,90)
        const status={ [key]:{...point,touched:s.touched,rotation:90}, [rawKey]:s.raw?s.point:undefined,
          [s.side==='left'?'rightPad':'leftPad']:{x:-1,y:1,touched:true} }
        const pad={side:s.side,live:null,regions:[],card:{},menuKey:'',modeshiftTarget:{kind:'rightTouchpad'}}
        return React.createElement(TrackpadFineTune,{pad,name:s.side==='left'?'Left pad':'Right pad',group:s.group,onGroup:group=>set(v=>({...v,group})),onClose:()=>{},selected:null,
          page:{readText:`${s.side.toUpperCase()}_TOUCHPAD_MODE = MOUSE\n${s.side.toUpperCase()}_TOUCHPAD_ROTATION = ${s.angle}`,setText:update=>set(v=>({...v,angle:v.angle+5})),liveDevice:s.online?{handle:s.handle,status}:undefined,pads:[pad],padAspect:1,stickButtons:[],warnings:[],virtualControllerType:'XBOX',renderButton:()=>null,renderModeshifts:()=>null,describe:()=>({binding:''})}})
      }createRoot(host).render(React.createElement(Test))
    }, cases)
    const patch=async p=>{await page.evaluate(p=>window.patchOrientation(p),p);await page.waitForTimeout(80)}
    const svg=page.locator('[data-pad-orientation]');await svg.waitFor()
    const point=svg.locator('[data-orientation-point="output"]')
    assert.equal(Number(await point.getAttribute('cx')),340)
    await patch({angle:0});assert.equal(Number(await point.getAttribute('cx')),284)
    await patch({angle:-90});assert.equal(Number(await point.getAttribute('cx')),228)
    // Actual mapper remains at90; changing configuration must use raw input exactly once.
    await patch({angle:90,point:{x:.8,y:0}});assert.equal(Number(await point.getAttribute('cy')),168)
    const slider=page.getByRole('slider').filter({hasText:'Pad rotation'});await slider.focus();await page.keyboard.press('ArrowRight')
    await page.waitForFunction(()=>document.querySelector('[data-pad-orientation]').getAttribute('aria-label').includes('95 degrees'))
    await patch({side:'left',angle:90,point:{x:0,y:-.8}});assert.equal(Number(await point.getAttribute('cx')),340)
    await patch({handle:2,point:{x:-.8,y:0}});assert.equal(Number(await point.getAttribute('cy')),56)
    await patch({raw:false});assert.match(await svg.getAttribute('aria-label'),/raw input unavailable/)
    assert.equal(Number(await point.getAttribute('cy')),56, 'already rotated telemetry is not rotated twice')
    await patch({touched:false});assert.equal(await svg.locator('[data-orientation-point]').count(),0)
    await patch({online:false});assert.match(await svg.getAttribute('aria-label'),/No controller connected/)
    for(const theme of ['dark','light']) for(const width of [1440,900]){
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme)
      await page.setViewportSize({width,height:width===900?600:1000})
      for(const group of ['orientation','speed','glide','feel']){
        await patch({group,online:true,touched:true,raw:true,angle:45})
        if(group==='orientation') await svg.scrollIntoViewIfNeeded()
        if(group==='speed') await page.getByText('Acceleration',{exact:true}).waitFor()
        if(group==='feel') await page.getByRole('heading',{name:'Haptics',exact:true}).waitFor()
        const sheet=page.locator('[data-subpage]').last()
        const overflow=await sheet.evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false,`${group} overflow at${width}`)
        await sheet.screenshot({path:path.join(output,`${group}-${width}-${theme}.png`)})
      }
    }
    assert.deepEqual(errors,[])
    console.log(`PASS: ${cases.length} native rotation/clamp parity cases; live touch/config/side/controller, no double rotation, unavailable/lift/disconnect states; terminology and dark/light1440/900 layouts`)
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
