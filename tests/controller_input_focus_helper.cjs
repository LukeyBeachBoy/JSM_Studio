const assert = require('node:assert/strict')

// Count rendered focus effects on the control and all enclosing surfaces.
module.exports = async function expectControllerInputRing(page, field, name) {
  await field.scrollIntoViewIfNeeded()
  const resting = await field.evaluate(input => {
    input.blur()
    const chain = []
    for (let node = input; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      chain.push({ outline: style.outline, shadow: style.boxShadow })
    }
    return chain
  })
  await field.evaluate(input => {
    document.body.dataset.inputSource = 'controller'
    input.focus({ preventScroll: true })
  })
  await page.bringToFront()
  await page.waitForFunction(() => document.querySelector('.focus-glide')?.dataset.visible === 'true')
  await page.waitForTimeout(200)
  const rings = await field.evaluate((input, resting) => {
    const rings = []
    let index = 0
    for (let node = input; node && node !== document.body; node = node.parentElement, index++) {
      const style = getComputedStyle(node)
      if (parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none' && style.outline !== resting[index].outline) rings.push(`${node.className}: outline`)
      if (style.boxShadow !== 'none' && style.boxShadow !== resting[index].shadow) rings.push(`${node.className}: shadow`)
    }
    const glide = document.querySelector('.focus-glide')
    if (glide?.dataset.visible === 'true' && getComputedStyle(glide).visibility !== 'hidden' && getComputedStyle(glide).display !== 'none') rings.push('focus-glide')
    return rings
  }, resting)
  assert.deepEqual(rings, ['focus-glide'], `${name}: exactly one controller ring`)
}
