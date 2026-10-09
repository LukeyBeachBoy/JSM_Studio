import { useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { LayerUsageContext } from '../../LayerBar'
import { useShell } from '../../../shell/ShellContext'
import { Icon, type IconName } from '../../icons/Icon'
import { OpenRow } from '../../ui/console'
import { KindPicker, SEND_KINDS, type SendKind } from '../pickers/KindPicker'
import { commandForValue, type BindingCommand, type BindingCommandPatch } from '../../../utils/bindingCommands'
import { describeCommandOutput, describeBinding } from '../../../utils/bindingDescription'
import { inputDisplayName } from '../../../keymap/inputNames'
import { heldInput, isReleasedInput } from '../../../utils/released'
import { modeshiftTriggers, readModeshift } from '../../../utils/modeshift'
import { requestValueEntry } from '../../../nav/textEntry'
import {
  ACTIVATION_LABELS, CHOOSE_LABEL, COMMON_ACTIVATIONS, RARE_ACTIVATIONS, activationLabel, activationOf, commandsFor, isRare, sameActivation, sendKindOf,
  KIND_ICONS, nameSuggestions, type Activation, type ActivationRef, type BindingApi, type RareActivation,
} from './model'
import { MoreArt } from './art'
import { PairPicker } from './PairPicker'
import { FineTunePage, fineTuneSummary } from './FineTunePage'
import { WhileHoldingPage } from './WhileHoldingPage'
import { requestModeshift } from '../../sticks/inputSide'
import { focusSoon, useTurboDefault, usePadButtons } from './hooks'
import styles from './binding.module.css'

// The binding sheet (console v2, BindingSheet: "pick, don't type"). "When
// you…" selects the way of pressing the grid below edits -- Press, Tap, Hold,
// Double-tap, or one of More's four -- and "<Press> sends" shows which of the
// eight kinds it sends; A on a kind opens that kind's picker (KindPicker).
// Several things on one press (a key combo, Space and J together) are the
// chips under the grid. While holding another button… and Fine-tune open
// their own full-screen pages. Footer: A Choose key · X Clear · Y Rename · B Done.


const RARE_TEXT: Record<RareActivation, { title: string; text: (input: string, output: string) => string; action: string }> = {
  release: { title: 'Let go', text: input => `Fires when you release ${input}, not when you press it.`, action: 'Then choose what it sends ▸' },
  turbo: { title: 'Turbo', text: (input, output) => `Repeats ${output || 'it'} for as long as you hold ${input}.`, action: 'Repeat speed' },
  simultaneous: { title: 'Press together with…', text: input => `${input} and one other button, pressed at the same moment.`, action: 'Pick the other one by pressing it' },
  diagonal: { title: 'Stick diagonal', text: () => 'Only while two directions are pushed at once, like up and right.', action: 'Pick the two directions ▸' },
}
const RARE_ICONS: Record<RareActivation, IconName> = { release: 'apply', turbo: 'timing', simultaneous: 'chords', diagonal: 'joysticks' }

type Picking = { kind: SendKind; activation: ActivationRef; command: BindingCommand | null }

type Props = {
  api: BindingApi
  /** The tile to start on (X on a row opens at Hold). */
  initial?: ActivationRef
  /** Inside another page (a chord's every activation): no header. */
  embedded?: boolean
}

export function BindingSheetBody({ api, initial, embedded }: Props) {
  const { t } = useTranslation()
  const { layers } = useContext(LayerUsageContext)
  const shell = useShell()
  const root = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<ActivationRef>(initial ?? { kind: 'regular' })
  const [view, setView] = useState<'grid' | 'more'>('grid')
  const [picking, setPicking] = useState<Picking | null>(null)
  const [pairPick, setPairPick] = useState<{ kind: 'simultaneous' | 'diagonal'; initial?: string; command?: BindingCommand } | null>(null)
  // Fine-tune: true for the activation's first command, or one chip's command (Y on a chip).
  const [fineTune, setFineTune] = useState<boolean | string>(false)
  const [whileHolding, setWhileHolding] = useState(false)
  const turboDefault = useTurboDefault()
  const [turboSpeed, setTurboSpeed] = useState<number | null>(null)

  const commands = api.commands
  const activations = useMemo(() => commands.map(activationOf), [commands])
  const selectedCommands = commandsFor(commands, selected)
  // NONE is "nothing, over the shared layout or the base": shown as None, not as a key.
  const isNone = (command: BindingCommand) => command.outputValue.trim().toUpperCase() === 'NONE'
  const realCommands = selectedCommands.filter(command => !isNone(command))
  const primary = realCommands.find(command => command.source.kind !== 'special' && command.source.kind !== 'heldLed') ?? realCommands[0]
  const currentKind = primary ? sendKindOf(primary) : null
  const rareSet = commands.filter((_, index) => { const of = activations[index]; return of && isRare(of.kind) })
  const turboCommand = commands.find(command => command.triggerKind === 'turbo')
  const output = (command: BindingCommand) => describeCommandOutput(command, layers, t) || t('keymap.commandNoOutput', 'Nothing yet')
  const sendsOf = (activation: ActivationRef) => { const own = commandsFor(commands, activation); const real = own.filter(command => !isNone(command)); return real.length ? real.map(output).join(' + ') : own.length ? t('bind.none', 'None') : '' }
  const selectedName = selected.with ? `${activationLabel(selected.kind, t).replace(/…$/, '')} ${inputDisplayName(selected.with, api.family)}` : activationLabel(selected.kind, t)

  // A tile asked for from outside (X on the row, Details' "Open in…").
  useEffect(() => { if (initial) { setSelected(initial); setView(isRare(initial.kind) ? 'grid' : 'grid') } }, [initial?.kind, initial?.with]) // eslint-disable-line react-hooks/exhaustive-deps

  // A mode switch happens on Press or on Let go, whatever tile it was chosen from: follow it there.
  const modeSeen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!modeSeen.current) return
    const fresh = commands.find(command => command.source.kind === 'layerAction' && !modeSeen.current!.has(command.id))
    if (!fresh) return
    modeSeen.current = null
    const to = activationOf(fresh)
    // After the picker has handed focus back (landing on a tile selects it).
    if (to) window.setTimeout(() => { setSelected(to); setView('grid'); focusSoon(() => root.current, isRare(to.kind) ? '[data-when="more"]' : `[data-when="${to.kind}"]`) }, 150)
  }, [commands])
  const pick = (kind: SendKind, activation: ActivationRef = selected) => {
    modeSeen.current = kind === 'mode' ? new Set(commands.filter(command => command.source.kind === 'layerAction').map(command => command.id)) : null
    const existing = commandsFor(commands, activation)
    const replace = existing.find(command => sendKindOf(command) === kind) ?? existing.find(command => command.source.kind === 'row' && (command.outputValue === '' || isNone(command))) ?? (existing.length === 1 && existing[0].source.kind !== 'heldLed' ? existing[0] : null)
    setPicking({ kind, activation, command: replace })
  }
  const choose = (patch: BindingCommandPatch) => {
    if (!picking) return
    const { command, activation } = picking
    const extra = activation.kind === 'turbo' && turboSpeed !== null ? { turboIntervalMs: turboSpeed } : activation.with ? { conditionInput: activation.with } : undefined
    if (command && command.source.kind === 'row') api.update(command, patch)
    else if (command && (command.source.kind === 'layerAction') && patch.layerAction) api.update(command, patch)
    else {
      if (command) api.remove(command)
      api.add(activation, patch, extra)
    }
  }

  const rename = () => renameInput(api, t, shell.configName ?? undefined, primary ? output(primary) : '', activationLabel(selected.kind, t))
  const clearSelected = () => { if (selectedCommands.length) api.clear(selectedCommands) }

  usePadButtons(root, (button, target) => {
    if (picking || fineTune || whileHolding || pairPick) return false
    if (button === 'Y') {
      if (target.closest('[data-own-y]')) return false
      const chipY = target.closest<HTMLElement>('[data-chip-command]:not([aria-disabled="true"])')
      if (chipY?.dataset.chipCommand && realCommands.length > 1) { setFineTune(chipY.dataset.chipCommand); return true }
      rename()
      return Boolean(api.onRename)
    }
    const chip = target.closest<HTMLElement>('[data-chip-command]')
    if (chip) {
      const command = commands.find(item => item.id === chip.dataset.chipCommand)
      if (command) { api.remove(command); focusSoon(() => root.current, '[data-kind-current="true"], [data-kind]') }
      return true
    }
    const rare = target.closest<HTMLElement>('[data-rare-command]')
    if (rare) {
      const command = commands.find(item => item.id === rare.dataset.rareCommand)
      if (command) api.remove(command)
      return true
    }
    if (target.closest('[data-more-card]')) return false
    clearSelected()
    return true
  })

  const tileHints = (activation: ActivationRef, set: boolean) => {
    const label = activationLabel(activation.kind, t)
    const own = commandsFor(commands, activation)
    const kind = own[0] ? sendKindOf(own[0]) : null
    return [
      set && kind ? `A:${t(CHOOSE_LABEL[kind][0], CHOOSE_LABEL[kind][1])}` : `A:${t('bind.chooseWhat', 'Choose what {{activation}} sends', { activation: label })}`,
      set ? 'X:Clear' : '',
      api.onRename ? 'Y:Rename' : '',
      'B:Done',
    ].filter(Boolean).join(';')
  }
  const onTileA = (activation: ActivationRef) => {
    const own = commandsFor(commands, activation)
    if (own[0]) pick(sendKindOf(own[0]), activation)
    else focusSoon(() => root.current, '[data-kind="key"]')
  }

  const rareSelected = isRare(selected.kind)
  // Stick diagonal is for direction inputs (a stick, pad or D-pad direction): a
  // face button has no "up and right" (UX review 2026-10-09).
  const moreKinds = RARE_ACTIVATIONS.filter(kind => kind !== 'diagonal' || isDirectionInput(api.button.command) || rareSet.some(command => command.triggerKind === 'diagonal'))
  const moreValue = rareSelected
    ? sendsOf(selected) || '+ Add'
    : rareSet.length ? [...new Set(rareSet.map(command => activationLabel(activationOf(command)!.kind, t)))].join(' · ') : String(moreKinds.length)


  return (
    <div ref={root} className={styles.sheet} data-capture-ignore="true" data-binding-sheet={api.command} data-embedded={embedded ? "true" : undefined}>
      {api.menuItem?.identity}
      <section aria-label={t('keymap.whenYou', 'When you…')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <p className={styles.eyebrowLabel}>{t('bind.whenYouPress', 'When you press')}</p>
        <div className={styles.when} role="tablist" aria-label={t('keymap.whenYou', 'When you…')}>
          {COMMON_ACTIVATIONS.map((kind, index) => {
            const activation = { kind }
            const value = sendsOf(activation)
            const isSelected = !rareSelected && view === 'grid' && selected.kind === kind
            return (
              <button key={kind} type="button" role="tab" aria-selected={isSelected} className={styles.whenTile} data-when={kind} data-set={value ? 'true' : 'false'}
                data-selected={isSelected ? 'true' : undefined} data-autofocus={!rareSelected && selected.kind === kind ? '' : undefined} data-index={index}
                data-hints={tileHints(activation, Boolean(value))}
                data-caption={`${activationLabel(kind, t)} · ${value ? `sends ${value}` : 'nothing yet'}`}
                onFocus={() => { setSelected(activation); setView('grid') }}
                onClick={() => { setSelected(activation); setView('grid'); onTileA(activation) }}>
                <span className={styles.whenLabel}>{t(ACTIVATION_LABELS[kind][0], ACTIVATION_LABELS[kind][1])}</span>
                <b className={styles.whenValue}>{value || '+ Add'}</b>
              </button>
            )
          })}
          <button type="button" role="tab" data-autofocus={rareSelected ? '' : undefined} aria-selected={rareSelected || view === 'more'} aria-expanded={view === 'more'} className={styles.whenTile} data-when="more" data-more="true"
            data-set={rareSelected ? (sendsOf(selected) ? 'true' : 'false') : 'true'} data-selected={rareSelected || view === 'more' ? 'true' : undefined}
            data-hints={view === 'more' ? `A:Hide more;${api.onRename ? 'Y:Rename;' : ''}B:Done` : `A:${t('bind.showMore', 'More ways to press')};${api.onRename ? 'Y:Rename;' : ''}B:Done`}
            data-caption={`More · ${moreKinds.map(kind => activationLabel(kind, t).replace(/…$/, '')).join(', ')}`}
            onClick={() => setView(view === 'more' ? 'grid' : 'more')}>
            <span className={styles.whenLabel}>{rareSelected ? selectedName : t('bind.more', 'More')}</span>
            <b className={styles.whenValue}>{moreValue} {view === 'more' ? '▾' : '▸'}</b>
          </button>
        </div>
      </section>

      {view === 'more' ? (
        <MoreSection api={api} kinds={moreKinds} rareSet={rareSet} turboCommand={turboCommand} turboDefault={turboDefault} turboSpeed={turboSpeed} setTurboSpeed={setTurboSpeed} output={output}
          onSelect={activation => { setSelected(activation); setView('grid'); focusSoon(() => root.current, commandsFor(commands, activation).length ? '[data-kind-current="true"]' : '[data-kind="key"]') }}
          onPair={kind => setPairPick({ kind })}
          onBack={() => { setView('grid'); focusSoon(() => root.current, '[data-when="more"]') }} />
      ) : (
        <section aria-label={`${selectedName} sends`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <p className={styles.eyebrowLabel}>{t('bind.sends', '{{activation}} sends', { activation: selectedName })}</p>
          <div className={styles.kinds}>
            {SEND_KINDS.map(kind => {
              const current = currentKind === kind.kind
              const caption = current && primary ? output(primary) : kind.kind === 'key' ? t('bind.keyCaption', 'Letters, F-keys, media') : t(`bind.kindCaption.${kind.kind}`, kind.caption)
              return (
                <button key={kind.kind} type="button" className={styles.kind} data-kind={kind.kind} data-kind-current={current ? 'true' : undefined} data-current={current ? 'true' : undefined}
                  data-hints={[`A:${t(CHOOSE_LABEL[kind.kind][0], CHOOSE_LABEL[kind.kind][1])}`, selectedCommands.length ? 'X:Clear' : '', api.onRename ? 'Y:Rename' : '', 'B:Done'].filter(Boolean).join(';')}
                  data-caption={`${kind.label} · ${kind.caption}`}
                  onClick={() => pick(kind.kind)}>
                  <span className={styles.kindIcon} aria-hidden="true"><Icon name={KIND_ICONS[kind.kind]} size={28} /></span>
                  <span className={styles.kindTitle}>{t(`bind.kind.${kind.kind}`, kind.label)}</span>
                  <span className={styles.kindCaption}>{caption}</span>
                </button>
              )
            })}
          </div>
          {realCommands.length > 0 && (
            <div className={styles.sends} role="group" aria-label={t('bind.sendsList', '{{activation}} sends', { activation: selectedName })}>
              <span className={styles.sendsLabel}>{t('bind.sendsAll', 'Sends')}</span>
              {realCommands.map(command => {
                const special = command.source.kind === 'special'
                const stickShift = command.source.kind === 'stickShift' ? command.source : null
                const ledColor = command.source.kind === 'heldLed' ? command.source.color?.replace(/^#/, '') : /^LIGHT_BAR\s*=\s*x([0-9a-f]{6})/i.exec(command.outputValue)?.[1]
                return (
                  <button key={command.id} type="button" className={styles.chip} data-chip-command={command.id} data-command-row={command.id} data-trigger-kind={command.triggerKind}
                    data-capturing={api.isCapturing && command.source.kind === 'row' ? undefined : undefined}
                    aria-label={`${t('keymap.chooseAction', 'Choose action')}: ${output(command)}`}
                    aria-disabled={special ? 'true' : undefined} data-reason={special ? 'Set on the Gyro page: this button turns gyro on or off' : undefined}
                    data-hints={special ? 'X:Remove;B:Done' : stickShift ? 'A:Open Mode shift;X:Remove;B:Done' : `A:Change;X:Remove;${realCommands.length > 1 ? 'Y:Fine-tune this one;' : api.onRename ? 'Y:Rename;' : ''}B:Done`}
                    data-caption={`${output(command)}${api.nameOf(command) ? ` · ${api.nameOf(command)}` : ''}`}
                    onClick={() => {
                      if (stickShift) requestModeshift({ page: 'joysticks', side: stickShift.target === 'LEFT' ? 'left' : 'right', trigger: api.button.command })
                      else if (!special) setPicking({ kind: sendKindOf(command), activation: selected, command })
                    }}>
                    {ledColor && <span className={styles.chipSwatch} style={{ background: `#${ledColor}` }} aria-hidden="true" />}
                    <span>{output(command)}</span>
                    {command.outputBehavior !== 'normal' && <small>{behaviourWord(command.outputBehavior)}</small>}
                  </button>
                )
              })}
              <button type="button" className={styles.chip} data-add="true" data-hints="A:Also send another;B:Done"
                data-caption="Also send · several things on one press, like Ctrl and C"
                onClick={() => setPicking({ kind: currentKind ?? 'key', activation: selected, command: null })}>
                <Icon name="add" size={16} />{t('bind.alsoSend', 'Also send')}
              </button>
            </div>
          )}
          {selectedCommands.some(command => command.outputKind === 'virtualController') && api.pickerProps.virtualControllerType === 'NONE' && (
            <p className={styles.warning}>{t('keymap.virtualControllerWarningCommandModeRequired')}</p>
          )}
        </section>
      )}

      <div className={styles.folds}>
        {api.modeshifts && !api.shifted && (
          <OpenRow icon={<Icon name="chords" size={22} />} label={t('bind.whileHolding', 'Chords')}
            hint={t('bind.whileHoldingHint', 'Hold another button to make {{input}} send something else.', { input: api.shortName })}
            value={<WhileHoldingValue api={api} />} onOpen={() => setWhileHolding(true)}
            hints={`A:Open;${api.onRename ? 'Y:Rename;' : ''}B:Done`} data={{ 'data-fold': 'while-holding' }} />
        )}
        {/* Chords where this input has no Chords page of its own (a
            card outside the Buttons list): each one, changed with A, removed with X. */}
        {!api.modeshifts && commands.filter(command => command.triggerKind === 'chord').map(command => (
          <OpenRow key={command.id} icon={<Icon name="chords" size={22} />}
            label={t('bind.whileHeld', 'With {{held}} held', { held: inputDisplayName(command.conditionInput ?? '', api.family) })}
            hint={`Sends ${output(command)}`} value={t('bind.change', 'Change')}
            onOpen={() => setPicking({ kind: sendKindOf(command), activation: { kind: 'regular' }, command })}
            hints="A:Change;X:Remove;B:Done" data={{ 'data-chip-command': command.id, 'data-command-row': command.id }} />
        ))}
        <OpenRow icon={<Icon name="tuning" size={22} />} label={t('bind.fineTune', 'Fine-tune')}
          hint={t('bind.fineTuneHint', 'Send once · toggle · only on release · turbo')}
          value={fineTuneSummary(api, primary, t)} onOpen={() => setFineTune(true)}
          hints={`A:Open;${api.onRename ? 'Y:Rename;' : ''}B:Done`} data={{ 'data-fold': 'fine-tune' }} />
      </div>

      {picking && (
        <KindPicker kind={picking.kind} {...api.pickerProps}
          inputLabel={`${api.shortName} · ${picking.activation.with ? `${activationLabel(picking.activation.kind, t)} ${inputDisplayName(picking.activation.with, api.family)}` : activationLabel(picking.activation.kind, t)}`}
          command={picking.command ?? { ...commandForValue(api.button.command, ''), triggerKind: picking.activation.kind, conditionInput: picking.activation.with }}
          onCapture={() => { const target = picking.command; setPicking(null); api.capture(target, picking.activation) }}
          onSelect={choose}
          onSelectCombo={keys => {
            const extra = picking.activation.with ? { conditionInput: picking.activation.with } : undefined
            api.add(picking.activation, { outputKind: 'keyboard', outputValue: keys.join(' ') }, extra, picking.command)
          }}
          onClose={() => { setPicking(null); focusSoon(() => root.current, '[data-kind-current="true"], [data-kind]') }} />
      )}
      {pairPick && (
        <PairPicker kind={pairPick.kind} input={api.button.command} inputName={api.longName} family={api.family} options={api.modifierOptions}
          taken={commands.filter(command => command.triggerKind === pairPick.kind).map(command => (command.conditionInput ?? '').toUpperCase())}
          initial={pairPick.initial}
          // Focus never rests on the page behind: back to the card (or Fine-tune's row) that opened it.
          onClose={() => { const { kind, command } = pairPick; setPairPick(null); focusSoon(() => document, command ? '[data-fine-tune] [data-pair-row]' : `[data-more-card="${kind}"]`) }}
          onPick={other => {
            const kind = pairPick.kind
            setPairPick(null)
            if (pairPick.command) { api.update(pairPick.command, { conditionInput: other }); focusSoon(() => document, '[data-fine-tune] [data-pair-row]'); return }
            const activation = { kind, with: other }
            setSelected(activation)
            setView('grid')
            focusSoon(() => root.current, commandsFor(commands, activation).length ? '[data-kind-current="true"]' : '[data-kind="key"]')
          }} />
      )}
      {fineTune && (
        <FineTunePage api={api} activation={selected} activationName={selectedName} onMoveTo={setSelected} commandId={typeof fineTune === 'string' ? fineTune : undefined}
          onClose={() => { const from = fineTune; setFineTune(false); focusSoon(() => root.current, typeof from === 'string' ? `[data-chip-command="${CSS.escape(from)}"], [data-fold="fine-tune"]` : '[data-fold="fine-tune"]') }}
          onChangePair={command => setPairPick({ kind: command.triggerKind as 'simultaneous' | 'diagonal', initial: command.conditionInput, command })} />
      )}
      {whileHolding && api.modeshifts && <WhileHoldingPage api={api} onClose={() => { setWhileHolding(false); focusSoon(() => root.current, '[data-fold="while-holding"]') }} />}
    </div>
  )
}

/** Y Rename: the input's own name ("Jump"), on the on-screen keyboard with
 *  suggestions from what it sends. */
export function renameInput(api: BindingApi, t: TFunction, where?: string, sends?: string, activation?: string) {
  if (!api.onRename) return
  const outputs = api.commands.map(command => describeCommandOutput(command, [], t)).filter(Boolean)
  requestValueEntry({
    title: t('bind.renameTitle', 'Name what {{input}} does', { input: api.shortName }),
    input: api.button.command,
    where: where ? `${where} · ${api.longName} · ${t('bind.rename', 'Rename')}` : undefined,
    eyebrow: `${api.longName} · ${activation ?? 'Press'} sends ${sends || outputs[0] || 'nothing yet'}`,
    hint: t('bind.renameHint', 'Name'),
    value: api.label ?? '',
    suggestions: nameSuggestions(outputs),
    onDone: value => api.onRename?.(value.trim()),
  })
}

function behaviourWord(behaviour: BindingCommand['outputBehavior']) {
  return behaviour === 'tapOnce' ? 'once' : behaviour === 'toggle' ? 'toggle' : behaviour === 'releaseOnly' ? 'on let go' : ''
}


/** "None", or "LB: Marker · +1". */
function WhileHoldingValue({ api }: { api: BindingApi }) {
  const { t } = useTranslation()
  const props = api.modeshifts!
  const target = useMemo(() => ({ id: api.button.command, title: api.longName, buttons: [{ command: api.button.command, label: api.longName }] }), [api.button.command, api.longName])
  const triggers = modeshiftTriggers(props.text, target)
  if (!triggers.length) return <>{t('bind.none', 'None')}</>
  const first = triggers[0]
  const value = readModeshift(props.text, first, api.button.command.toUpperCase()) ?? ''
  const shown = `${isReleasedInput(first) ? 'Not ' : ''}${inputDisplayName(heldInput(first), api.family)}: ${value && value.toUpperCase() !== 'NONE' ? describeBinding(value, t) : 'nothing'}`
  return <>{shown}{triggers.length > 1 ? ` · +${triggers.length - 1}` : ''}</>
}

/** A stick, pad or D-pad direction: the inputs a Stick diagonal pairs. */
const isDirectionInput = (command: string) => /^(UP|DOWN|LEFT|RIGHT|[LRT](UP|DOWN|LEFT|RIGHT)|M(UP|DOWN|LEFT|RIGHT))$/.test(command.toUpperCase())

type MoreProps = {
  api: BindingApi
  /** The ways offered here (Stick diagonal only on a direction). */
  kinds: RareActivation[]
  rareSet: BindingCommand[]
  turboCommand?: BindingCommand
  turboDefault: number
  turboSpeed: number | null
  setTurboSpeed: (value: number | null) => void
  output: (command: BindingCommand) => string
  onSelect: (activation: ActivationRef) => void
  onPair: (kind: 'simultaneous' | 'diagonal') => void
  onBack: () => void
}

/** BindingMore: four more ways to press, each adding its own action. */
function MoreSection({ api, kinds, rareSet, turboCommand, turboDefault, turboSpeed, setTurboSpeed, output, onSelect, onPair, onBack }: MoreProps) {
  const { t } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { focusSoon(() => root.current, '[data-more-card]') }, [])
  const pressOutput = api.commands.find(command => command.triggerKind === 'regular' && command.source.kind === 'row')
  // The repeat speed is read here and changed in Fine-tune ▸ Turbo: a stepper
  // on the card took ◂ ▸ from a plain walk across the cards (UX review 2026-10-09).
  const speed = turboCommand ? turboCommand.turboIntervalMs ?? null : turboSpeed
  void setTurboSpeed
  const speedText = speed === null ? t('bind.speedDefault', 'Default ({{ms}} ms)', { ms: turboDefault }) : `${speed} ms`
  const onCardKey = () => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onBack() }
  }
  return (
    <section ref={root} aria-label={t('bind.moreWays', 'More ways to press {{input}}', { input: api.shortName })} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className={styles.moreHead}>
        <p className={styles.eyebrowLabel}>{t('bind.moreWays', 'More ways to press {{input}}', { input: api.shortName })}</p>
        <span className={styles.quiet} style={{ fontSize: 'var(--fs-hint)' }}>{t('bind.eachAdds', 'Each adds its own action')}</span>
      </div>
      <div className={styles.moreGrid}>
        {kinds.map(kind => {
          const own = rareSet.filter(command => command.triggerKind === kind)
          const text = RARE_TEXT[kind]
          const set = own.length > 0
          const pair = kind === 'simultaneous' || kind === 'diagonal'
          const addLabel = `Add ${text.title.replace(/…$/, '')}`
          const hints = `A:${set && !pair ? `Change ${text.title}` : addLabel};${set && !pair ? 'X:Remove;' : ''}B:Close More`
          return (
            <button key={kind} type="button" className={styles.moreCard} data-more-card={kind} data-set={set ? 'true' : undefined}
              data-rare-command={set && !pair ? own[0].id : undefined}
              data-hints={hints} data-caption={`${text.title} · ${text.text(api.shortName, '')}`}
              onKeyDown={onCardKey()}
              onClick={() => {
                if (pair) { onPair(kind); return }
                onSelect({ kind })
              }}>
              <span className={styles.moreArt}><MoreArt kind={kind} input={api.shortName} /></span>
              <span className={styles.moreTitle}><Icon name={RARE_ICONS[kind]} size={20} />{t(ACTIVATION_LABELS[kind][0], ACTIVATION_LABELS[kind][1])}</span>
              <span className={styles.moreText}>{text.text(api.shortName, pressOutput ? output(pressOutput) : '')}</span>
              {kind === 'turbo'
                ? <span className={styles.moreAction}>{t('bind.repeatSpeed', 'Repeat speed')}: {speedText} · in Fine-tune</span>
                : <span className={styles.moreAction}>{text.action}</span>}
              {set && <span className={styles.moreSet}>{pair ? own.map(command => inputDisplayName(command.conditionInput ?? '', api.family)).join(' · ') : `Sends ${own.map(output).join(' + ')}`}</span>}
            </button>
          )
        })}
      </div>
      {rareSet.length > 0 && (
        <div className={styles.moreList} aria-label={t('bind.moreSet', 'Set on this button')}>
          <p className={styles.eyebrowLabel}>{t('bind.moreSet', 'Set on this button')}</p>
          {rareSet.map(command => {
            const activation = activationOf(command)!
            const name = activation.with ? `${activationLabel(activation.kind, t).replace(/…$/, '')} ${inputDisplayName(activation.with, api.family)}` : activationLabel(activation.kind, t)
            return (
              <OpenRow key={command.id} label={name} hint={`Sends ${output(command)}${command.turboIntervalMs ? ` · every ${command.turboIntervalMs} ms` : ''}`}
                value={t('bind.change', 'Change')} onOpen={() => onSelect(activation)}
                hints="A:Change;X:Remove;B:Close More" data={{ 'data-rare-command': command.id }} />
            )
          })}
        </div>
      )}
    </section>
  )
}

export type { Activation }
export { sameActivation }
