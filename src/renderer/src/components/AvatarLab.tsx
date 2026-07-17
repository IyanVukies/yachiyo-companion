import { Activity, Boxes, Play, SlidersHorizontal, X } from 'lucide-react'

import type { AssetStatus, AvatarState } from '@shared/types'

type Props = {
  assets: AssetStatus
  lipSync: number
  onClose: () => void
  onState: (state: AvatarState) => void
  onLipSync: (value: number) => void
  onExpression: (name: string) => boolean
  onMotion: (group: string, index: number) => boolean
  runtimeReady: boolean
}

const FALLBACK_STATES: AvatarState[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'happy',
  'concerned',
  'confused',
  'reminder',
  'success',
  'error'
]

export function AvatarLab({
  assets,
  lipSync,
  onClose,
  onState,
  onLipSync,
  onExpression,
  onMotion,
  runtimeReady
}: Props): React.JSX.Element {
  const mao = assets.live2d
  return (
    <section className="sheet lab-sheet no-drag" aria-label="Avatar Lab">
      <header className="sheet-header">
        <div>
          <span className="eyebrow">Diagnostik visual</span>
          <h2>Avatar Lab</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Tutup Avatar Lab"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="lab-summary" data-ready={mao.state === 'ready'}>
        <Boxes size={19} aria-hidden="true" />
        <div>
          <strong>{mao.modelName ?? 'Mao belum ditemukan'}</strong>
          <span>
            {mao.expressions.length} ekspresi · {mao.motions.length} motion ·{' '}
            {runtimeReady
              ? 'runtime aktif'
              : mao.hasCore
                ? 'runtime memuat'
                : 'Core belum dipasang'}
          </span>
        </div>
      </div>

      {mao.issues.map((item) => (
        <p className="lab-issue" key={item.code}>
          {item.message}
        </p>
      ))}

      <div className="lab-scroll">
        <section className="lab-section">
          <h3>
            <Activity size={15} aria-hidden="true" /> State fallback
          </h3>
          <div className="chip-grid">
            {FALLBACK_STATES.map((state) => (
              <button type="button" key={state} onClick={() => onState(state)}>
                {state}
              </button>
            ))}
          </div>
        </section>

        <section className="lab-section">
          <h3>
            <SlidersHorizontal size={15} aria-hidden="true" /> ParamA / lip-sync
          </h3>
          <label className="range-field">
            <span>{lipSync.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={lipSync}
              onChange={(event) => onLipSync(Number(event.target.value))}
            />
          </label>
        </section>

        <section className="lab-section">
          <h3>Ekspresi aktual</h3>
          <div className="inventory-list">
            {mao.expressions.map((expression) => (
              <button
                type="button"
                key={expression.file}
                disabled={!runtimeReady}
                title={!runtimeReady ? 'Runtime Mao belum siap.' : undefined}
                onClick={() => onExpression(expression.name)}
              >
                <span>{expression.name}</span>
                <small>{expression.parameterCount} parameter</small>
              </button>
            ))}
          </div>
        </section>

        <section className="lab-section">
          <h3>Motion aktual</h3>
          <div className="inventory-list">
            {mao.motions.map((motion) => (
              <button
                type="button"
                key={`${motion.group}:${String(motion.index)}:${motion.file}`}
                disabled={!runtimeReady}
                title={!runtimeReady ? 'Runtime Mao belum siap.' : undefined}
                onClick={() => onMotion(motion.group, motion.index)}
              >
                <Play size={13} aria-hidden="true" />
                <span>{motion.name}</span>
                <small>
                  {motion.group || 'Tanpa grup'} #{motion.index + 1}
                </small>
                <small>{motion.durationSeconds?.toFixed(2) ?? '?'} dtk</small>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
