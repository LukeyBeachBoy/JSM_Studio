import type { ReactNode } from 'react'
import { InputGlyph } from './InputGlyph'
import './InputText.css'

const MOUSE_REFERENCES: Record<string, [string, string]> = {
  'MOUSE BACK': ['MOUSE_BACK', 'Mouse Back'], BMOUSE: ['MOUSE_BACK', 'Mouse Back'],
  'MOUSE FORWARD': ['MOUSE_FORWARD', 'Mouse Forward'], FMOUSE: ['MOUSE_FORWARD', 'Mouse Forward'],
  'MOUSE LEFT': ['LMOUSE', 'Mouse Left'], LMOUSE: ['LMOUSE', 'Mouse Left'],
  'MOUSE RIGHT': ['RMOUSE', 'Mouse Right'], RMOUSE: ['RMOUSE', 'Mouse Right'],
  'MOUSE MIDDLE': ['MMOUSE', 'Mouse Middle'], MMOUSE: ['MMOUSE', 'Mouse Middle'],
  'SCROLL UP': ['SCROLLUP', 'Scroll up'], SCROLLUP: ['SCROLLUP', 'Scroll up'],
  'SCROLL DOWN': ['SCROLLDOWN', 'Scroll down'], SCROLLDOWN: ['SCROLLDOWN', 'Scroll down'],
}
/** Keep the action name beside its glyph so mouse buttons remain readable. */
export function InputText({ text }: { text: string }) {
  return <>{text.split(/(\bMouse[ _](?:Back|Forward|Left|Right|Middle)\b|\b[BLRMF]MOUSE\b|\bSCROLL[ _]?(?:UP|DOWN)\b)/gi).map((part, index) => {
    const mouse = MOUSE_REFERENCES[part.replace('_', ' ').toUpperCase()]
    return mouse ? <span className="inline-input" key={index} title={mouse[1]}><InputGlyph command={mouse[0]} size={22} /><span>{mouse[1]}</span></span> : part
  })}</>
}
export function inputContent(content: ReactNode): ReactNode {
  return typeof content === 'string' ? <InputText text={content} /> : content
}
