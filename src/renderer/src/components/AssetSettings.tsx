import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  FolderOpen,
  LoaderCircle,
  RefreshCw
} from 'lucide-react'

import type {
  AssetApplyResult,
  AssetDialogResult,
  AssetSelectionRequest,
  AssetStatus,
  SettingsView
} from '@shared/types'

type AssetTarget = AssetSelectionRequest['kind']
type FeedbackTone = 'info' | 'loading' | 'success' | 'error'
type Feedback = { tone: FeedbackTone; message: string }

type Props = {
  paths: SettingsView['assets']
  assets: AssetStatus
  onPathsChanged: (paths: SettingsView['assets']) => void
  onChoose: (request: AssetSelectionRequest) => Promise<AssetDialogResult>
  onApply: (token: string) => Promise<AssetApplyResult>
  onRescan: () => Promise<AssetStatus>
}

export function AssetSettings(props: Props): React.JSX.Element {
  const [busy, setBusy] = useState<AssetTarget | 'all' | null>(null)
  const [feedback, setFeedback] = useState<Partial<Record<AssetTarget, Feedback>>>({})
  const snapshot = props.assets

  const choose = async (request: AssetSelectionRequest): Promise<void> => {
    const target = request.kind
    setBusy(target)
    setFeedback((current) => ({
      ...current,
      [target]: { tone: 'loading', message: 'Menunggu pilihan dari dialog Windows…' }
    }))
    try {
      const choice = await props.onChoose(request)
      if (choice.outcome !== 'selected' || !choice.selectedPath || !choice.selectionToken) {
        setFeedback((current) => ({
          ...current,
          [target]: {
            tone: choice.outcome === 'error' ? 'error' : 'info',
            message: choice.message
          }
        }))
        return
      }

      props.onPathsChanged(withPath(props.paths, target, choice.selectedPath))
      setFeedback((current) => ({
        ...current,
        [target]: { tone: 'loading', message: choice.message }
      }))

      const applied = await props.onApply(choice.selectionToken)
      props.onPathsChanged(applied.settings.assets)
      setFeedback((current) => ({
        ...current,
        [target]:
          applied.outcome === 'expired'
            ? { tone: 'error', message: applied.message }
            : feedbackFor(target, applied.assets)
      }))
    } catch {
      setFeedback((current) => ({
        ...current,
        [target]: {
          tone: 'error',
          message: 'Aset tidak dapat dipindai atau disimpan. Pilihan lama tetap aman; coba lagi.'
        }
      }))
    } finally {
      setBusy(null)
    }
  }

  const rescan = async (target: AssetTarget | 'all'): Promise<void> => {
    setBusy(target)
    const targets: AssetTarget[] = target === 'all' ? ['live2d', 'cubism-core', 'voice'] : [target]
    setFeedback((current) => {
      const next = { ...current }
      for (const item of targets) next[item] = { tone: 'loading', message: 'Memindai ulang…' }
      return next
    })
    try {
      const next = await props.onRescan()
      setFeedback((current) => {
        const updated = { ...current }
        for (const item of targets) updated[item] = feedbackFor(item, next)
        return updated
      })
    } catch {
      setFeedback((current) => {
        const updated = { ...current }
        for (const item of targets) {
          updated[item] = {
            tone: 'error',
            message: 'Scan ulang gagal dijalankan. Path tersimpan tidak dihapus.'
          }
        }
        return updated
      })
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null
  const live2dBusy = busy === 'live2d' || busy === 'cubism-core' || busy === 'all'
  const voiceBusy = busy === 'voice' || busy === 'all'

  return (
    <div className="asset-settings" aria-label="Konfigurasi aset eksternal">
      <article className="asset-source" aria-busy={live2dBusy} data-testid="mao-asset-source">
        <AssetHeader
          title="Niziiro Mao"
          subtitle="Live2D model"
          state={live2dBusy ? 'scanning' : snapshot.live2d.state}
          tone={live2dTone(snapshot.live2d.state)}
          loading={live2dBusy}
        />
        <PathDisplay
          label="Folder atau ZIP dipilih"
          value={props.paths.live2dRoot}
          fallback="Belum dipilih; sumber otomatis akan dipakai jika tersedia."
          testId="mao-selected-path"
        />
        {snapshot.live2d.root ? (
          <PathDisplay
            label="Root model terdeteksi"
            value={snapshot.live2d.root}
            testId="mao-normalized-root"
          />
        ) : null}

        {snapshot.live2d.entry ? <MaoInventory assets={snapshot} /> : null}
        <IssueList issues={snapshot.live2d.issues} />
        <InlineFeedback feedback={feedback.live2d} />

        <div className="asset-actions">
          <ActionButton
            icon="folder"
            disabled={disabled}
            onClick={() => void choose({ kind: 'live2d', source: 'folder' })}
          >
            {props.paths.live2dRoot ? 'Ganti folder' : 'Pilih folder'}
          </ActionButton>
          <ActionButton
            icon="zip"
            disabled={disabled}
            onClick={() => void choose({ kind: 'live2d', source: 'zip' })}
          >
            Pilih ZIP
          </ActionButton>
          <ActionButton icon="scan" disabled={disabled} onClick={() => void rescan('live2d')}>
            Scan ulang
          </ActionButton>
        </div>
      </article>

      <article className="asset-source asset-source-compact" aria-busy={live2dBusy}>
        <AssetHeader
          title="Cubism Core resmi"
          subtitle="Dipilih terpisah setelah menerima lisensi Live2D"
          state={
            live2dBusy
              ? 'scanning'
              : snapshot.live2d.state === 'ready'
                ? 'ready'
                : snapshot.live2d.hasCore
                  ? 'core-valid'
                  : 'core-missing'
          }
          tone={snapshot.live2d.hasCore ? 'ready' : 'warning'}
          loading={live2dBusy}
        />
        <PathDisplay
          label="Berkas Core dipilih"
          value={props.paths.cubismCorePath}
          fallback="Belum dipilih. Avatar fallback tetap aktif."
          testId="core-selected-path"
        />
        <InlineFeedback feedback={feedback['cubism-core']} />
        <div className="asset-actions">
          <ActionButton
            icon="folder"
            disabled={disabled}
            onClick={() => void choose({ kind: 'cubism-core', source: 'file' })}
          >
            {props.paths.cubismCorePath ? 'Ganti Core' : 'Pilih Core'}
          </ActionButton>
          <ActionButton icon="scan" disabled={disabled} onClick={() => void rescan('cubism-core')}>
            Scan ulang
          </ActionButton>
        </div>
      </article>

      <article className="asset-source" aria-busy={voiceBusy} data-testid="kobo-asset-source">
        <AssetHeader
          title="Kobo RVC"
          subtitle="Voice conversion model"
          state={voiceBusy ? 'scanning' : snapshot.voice.state}
          tone={voiceTone(snapshot.voice.state)}
          loading={voiceBusy}
        />
        <PathDisplay
          label="Folder atau ZIP dipilih"
          value={props.paths.voiceRoot}
          fallback="Belum dipilih; Basic TTS tetap tersedia."
          testId="kobo-selected-path"
        />
        {snapshot.voice.root ? (
          <PathDisplay
            label="Root model terdeteksi"
            value={snapshot.voice.root}
            testId="kobo-normalized-root"
          />
        ) : null}
        {snapshot.voice.checkpoint || snapshot.voice.index ? (
          <KoboInventory assets={snapshot} />
        ) : null}
        <IssueList issues={snapshot.voice.issues} />
        <InlineFeedback feedback={feedback.voice} />
        <div className="asset-actions">
          <ActionButton
            icon="folder"
            disabled={disabled}
            onClick={() => void choose({ kind: 'voice', source: 'folder' })}
          >
            {props.paths.voiceRoot ? 'Ganti folder' : 'Pilih folder'}
          </ActionButton>
          <ActionButton
            icon="zip"
            disabled={disabled}
            onClick={() => void choose({ kind: 'voice', source: 'zip' })}
          >
            Pilih ZIP
          </ActionButton>
          <ActionButton icon="scan" disabled={disabled} onClick={() => void rescan('voice')}>
            Scan ulang
          </ActionButton>
        </div>
      </article>

      <button
        className="secondary-button asset-rescan-all"
        type="button"
        disabled={disabled}
        onClick={() => void rescan('all')}
      >
        <RefreshCw size={14} aria-hidden="true" /> Scan ulang semua aset
      </button>
    </div>
  )
}

function AssetHeader({
  title,
  subtitle,
  state,
  tone,
  loading
}: {
  title: string
  subtitle: string
  state: string
  tone: 'ready' | 'warning' | 'error'
  loading: boolean
}): React.JSX.Element {
  return (
    <header className="asset-source-header">
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <span className="asset-state" data-tone={loading ? 'loading' : tone}>
        {loading ? <LoaderCircle className="spin" size={12} aria-hidden="true" /> : null}
        {state}
      </span>
    </header>
  )
}

function PathDisplay({
  label,
  value,
  fallback,
  testId
}: {
  label: string
  value: string
  fallback?: string
  testId: string
}): React.JSX.Element {
  return (
    <div className="asset-path-block">
      <span>{label}</span>
      <code data-empty={!value} data-testid={testId} title={value || fallback}>
        {value || fallback}
      </code>
    </div>
  )
}

function MaoInventory({ assets }: { assets: AssetStatus }): React.JSX.Element {
  const mao = assets.live2d
  const motionGroups = Array.from(new Set(mao.motions.map((motion) => motion.group)))
  return (
    <dl className="asset-inventory" aria-label="Inventaris Mao terdeteksi">
      <InventoryItem label="Model entry" value={fileName(mao.entry)} />
      <InventoryItem
        label="Expressions"
        value={`${String(mao.expressions.length)} · ${mao.expressions.map((item) => item.name).join(', ') || 'tidak ada'}`}
      />
      <InventoryItem
        label="Motions"
        value={`${String(mao.motions.length)} · ${motionGroups.join(', ') || 'tidak ada'}`}
      />
      <InventoryItem
        label="Texture"
        value={
          mao.textures.length
            ? mao.textures
                .map((texture) =>
                  texture.width && texture.height
                    ? `${texture.file} (${String(texture.width)}×${String(texture.height)})`
                    : texture.file
                )
                .join(', ')
            : 'tidak terdeteksi'
        }
      />
      <InventoryItem label="Physics" value={mao.hasPhysics ? 'Terdeteksi' : 'Tidak ada'} />
      <InventoryItem label="Pose" value={mao.hasPose ? 'Terdeteksi' : 'Tidak ada'} />
      <InventoryItem
        label="EyeBlink IDs"
        value={mao.eyeBlinkParameters.join(', ') || 'tidak ada'}
      />
      <InventoryItem label="LipSync IDs" value={mao.lipSyncParameters.join(', ') || 'tidak ada'} />
    </dl>
  )
}

function KoboInventory({ assets }: { assets: AssetStatus }): React.JSX.Element {
  const voice = assets.voice
  const runtimeReady = Object.entries(voice.runtime)
    .filter(([, available]) => available)
    .map(([name]) => name)
  return (
    <dl className="asset-inventory" aria-label="Inventaris Kobo terdeteksi">
      <InventoryItem label="Checkpoint" value={fileName(voice.checkpoint)} />
      <InventoryItem label="Index" value={fileName(voice.index)} />
      <InventoryItem label="Versi" value={voice.metadata.version ?? 'tidak terbaca'} />
      <InventoryItem label="Sample rate" value={voice.metadata.sampleRate ?? 'tidak terbaca'} />
      <InventoryItem label="F0" value={voice.metadata.f0 === true ? 'Ya' : 'Tidak terdeteksi'} />
      <InventoryItem label="Info" value={voice.metadata.info ?? 'tidak tersedia'} />
      <InventoryItem
        label="Runtime tersedia"
        value={runtimeReady.join(', ') || 'belum ada komponen lengkap'}
      />
    </dl>
  )
}

function InventoryItem({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function IssueList({
  issues
}: {
  issues: AssetStatus['live2d']['issues']
}): React.JSX.Element | null {
  if (!issues.length) return null
  return (
    <ul className="asset-issues" aria-label="Catatan validasi aset">
      {issues.map((issue) => (
        <li key={`${issue.code}:${issue.path ?? ''}`}>
          <AlertTriangle size={12} aria-hidden="true" />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  )
}

function InlineFeedback({
  feedback
}: {
  feedback: Feedback | undefined
}): React.JSX.Element | null {
  if (!feedback) return null
  const Icon =
    feedback.tone === 'success' ? CheckCircle2 : feedback.tone === 'error' ? AlertTriangle : null
  return (
    <p
      className="asset-feedback"
      data-tone={feedback.tone}
      role={feedback.tone === 'error' ? 'alert' : 'status'}
    >
      {feedback.tone === 'loading' ? (
        <LoaderCircle className="spin" size={12} aria-hidden="true" />
      ) : Icon ? (
        <Icon size={12} aria-hidden="true" />
      ) : null}
      <span>{feedback.message}</span>
    </p>
  )
}

function ActionButton({
  icon,
  disabled,
  onClick,
  children
}: {
  icon: 'folder' | 'zip' | 'scan'
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const Icon = icon === 'folder' ? FolderOpen : icon === 'zip' ? FileArchive : RefreshCw
  return (
    <button className="asset-action-button" type="button" disabled={disabled} onClick={onClick}>
      <Icon size={13} aria-hidden="true" />
      {children}
    </button>
  )
}

function feedbackFor(target: AssetTarget, assets: AssetStatus): Feedback {
  if (target === 'live2d') {
    if (assets.live2d.state === 'ready') {
      return { tone: 'success', message: 'Mao dan Cubism Core valid. Avatar siap dimuat.' }
    }
    if (assets.live2d.state === 'core-missing') {
      return {
        tone: 'success',
        message: 'Struktur Mao valid. Pilih Cubism Core resmi untuk mengaktifkan avatar.'
      }
    }
    return {
      tone: 'error',
      message: firstIssue(assets.live2d.issues, 'Folder Mao belum dapat digunakan.')
    }
  }
  if (target === 'cubism-core') {
    if (assets.live2d.state === 'ready') {
      return { tone: 'success', message: 'Mao dan Cubism Core valid. Status sekarang ready.' }
    }
    if (assets.live2d.hasCore) {
      return {
        tone: 'success',
        message: 'Cubism Core valid. Pilih atau perbaiki folder Mao untuk menyelesaikan aktivasi.'
      }
    }
    const coreIssue = assets.live2d.issues.find((issue) => issue.code.startsWith('CUBISM_CORE'))
    return {
      tone: 'error',
      message: coreIssue?.message ?? 'Cubism Core belum valid. Avatar fallback tetap aktif.'
    }
  }
  if (assets.voice.state === 'ready') {
    return { tone: 'success', message: 'Model Kobo dan runtime RVC lengkap siap digunakan.' }
  }
  if (assets.voice.state === 'runtime-missing') {
    return {
      tone: 'success',
      message: 'Model Kobo valid. Runtime RVC belum lengkap, jadi Basic TTS tetap digunakan.'
    }
  }
  return {
    tone: 'error',
    message: firstIssue(assets.voice.issues, 'Folder Kobo belum dapat digunakan.')
  }
}

function withPath(
  paths: SettingsView['assets'],
  target: AssetTarget,
  value: string
): SettingsView['assets'] {
  if (target === 'live2d') return { ...paths, live2dRoot: value }
  if (target === 'voice') return { ...paths, voiceRoot: value }
  return { ...paths, cubismCorePath: value }
}

function firstIssue(issues: AssetStatus['live2d']['issues'], fallback: string): string {
  return issues[0]?.message ?? fallback
}

function fileName(path: string | null): string {
  if (!path) return 'tidak terdeteksi'
  return path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path
}

function live2dTone(state: AssetStatus['live2d']['state']): 'ready' | 'warning' | 'error' {
  if (state === 'ready') return 'ready'
  if (state === 'core-missing' || state === 'missing') return 'warning'
  return 'error'
}

function voiceTone(state: AssetStatus['voice']['state']): 'ready' | 'warning' | 'error' {
  if (state === 'ready') return 'ready'
  if (state === 'runtime-missing' || state === 'missing') return 'warning'
  return 'error'
}
