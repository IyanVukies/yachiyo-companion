import { useState } from 'react'
import {
  BadgeInfo,
  Bell,
  Bot,
  Check,
  ChevronRight,
  FileArchive,
  KeyRound,
  MonitorUp,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Volume2,
  X
} from 'lucide-react'

import type {
  AssetStatus,
  ConnectionTestResult,
  SettingsView,
  VoiceCapabilities
} from '@shared/types'

type Props = {
  settings: SettingsView
  assets: AssetStatus
  voice: VoiceCapabilities
  onClose: () => void
  onSave: (settings: SettingsView, apiKey: string) => Promise<SettingsView>
  onReset: () => Promise<SettingsView>
  onRescan: () => Promise<void>
  onVoiceTest: (settings: SettingsView) => void
}

type Section = 'connection' | 'voice' | 'desktop' | 'proactive' | 'assets' | 'privacy' | 'about'

const SECTIONS: { id: Section; label: string; icon: typeof Bot }[] = [
  { id: 'connection', label: 'Hermes', icon: Bot },
  { id: 'voice', label: 'Suara', icon: Volume2 },
  { id: 'desktop', label: 'Desktop', icon: MonitorUp },
  { id: 'proactive', label: 'Proaktif', icon: Bell },
  { id: 'assets', label: 'Aset', icon: FileArchive },
  { id: 'privacy', label: 'Privasi', icon: ShieldCheck },
  { id: 'about', label: 'Tentang', icon: BadgeInfo }
]

export function SettingsPanel(props: Props): React.JSX.Element {
  const [draft, setDraft] = useState(props.settings)
  const [section, setSection] = useState<Section>('connection')
  const [apiKey, setApiKey] = useState('')
  const [feedback, setFeedback] = useState('')
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await props.onSave(draft, apiKey)
      setDraft(next)
      setApiKey('')
      setFeedback('Pengaturan tersimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="sheet settings-sheet no-drag" aria-label="Pengaturan Yachiyo">
      <header className="sheet-header">
        <div>
          <span className="eyebrow">Kontrol lokal</span>
          <h2>Pengaturan</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={props.onClose}
          aria-label="Tutup pengaturan"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <nav className="settings-nav" aria-label="Bagian pengaturan">
        {SECTIONS.map((item) => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.id}
              data-active={section === item.id}
              onClick={() => setSection(item.id)}
            >
              <Icon size={15} aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="settings-content">
        {section === 'connection' ? (
          <SettingsSection
            title="Koneksi Hermes"
            description="Mock lokal aktif sampai koneksi asli lolos tes."
          >
            <div className="segmented-control" aria-label="Mode koneksi">
              <button
                type="button"
                data-active={draft.connection.mode === 'mock'}
                onClick={() =>
                  setDraft({ ...draft, connection: { ...draft.connection, mode: 'mock' } })
                }
              >
                Mock lokal
              </button>
              <button
                type="button"
                data-active={draft.connection.mode === 'hermes'}
                onClick={() =>
                  setDraft({ ...draft, connection: { ...draft.connection, mode: 'hermes' } })
                }
              >
                Hermes VPS
              </button>
            </div>
            <label className="field">
              <span>Base URL</span>
              <input
                value={draft.connection.baseUrl}
                disabled={draft.connection.mode === 'mock'}
                placeholder="https://hermes.example.com"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    connection: { ...draft.connection, baseUrl: event.target.value }
                  })
                }
              />
            </label>
            <label className="field">
              <span>Nama model</span>
              <input
                value={draft.connection.model}
                disabled={draft.connection.mode === 'mock'}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    connection: { ...draft.connection, model: event.target.value }
                  })
                }
              />
            </label>
            <label className="field">
              <span>API key {draft.hasApiKey ? <small>tersimpan aman</small> : null}</span>
              <span className="secret-input">
                <KeyRound size={15} aria-hidden="true" />
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  disabled={draft.connection.mode === 'mock'}
                  placeholder={
                    draft.hasApiKey ? '•••••••• (tidak ditampilkan)' : 'Masukkan secara lokal'
                  }
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </span>
            </label>
            <div className="two-fields">
              <label className="field">
                <span>Timeout</span>
                <select
                  value={draft.connection.timeoutMs}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      connection: { ...draft.connection, timeoutMs: Number(event.target.value) }
                    })
                  }
                >
                  <option value={15_000}>15 detik</option>
                  <option value={30_000}>30 detik</option>
                  <option value={60_000}>60 detik</option>
                </select>
              </label>
              <label className="field">
                <span>Retry aman</span>
                <select
                  value={draft.connection.retryCount}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      connection: { ...draft.connection, retryCount: Number(event.target.value) }
                    })
                  }
                >
                  <option value={0}>Tidak</option>
                  <option value={1}>1 kali</option>
                  <option value={2}>2 kali</option>
                </select>
              </label>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void window.yachiyo
                  .testConnection({
                    mode: draft.connection.mode,
                    baseUrl: draft.connection.baseUrl,
                    model: draft.connection.model,
                    timeoutMs: draft.connection.timeoutMs,
                    ...(apiKey ? { apiKey } : {})
                  })
                  .then(setConnectionResult)
                  .finally(() => setBusy(false))
              }}
            >
              <RefreshCw size={15} aria-hidden="true" /> Tes koneksi
            </button>
            {connectionResult ? (
              <p className="connection-result" data-ok={connectionResult.ok}>
                {connectionResult.ok ? <Check size={15} aria-hidden="true" /> : null}
                <span>
                  {connectionResult.message}
                  {connectionResult.warning ? <small>{connectionResult.warning}</small> : null}
                </span>
              </p>
            ) : null}
          </SettingsSection>
        ) : null}

        {section === 'voice' ? (
          <SettingsSection title="Suara" description={props.voice.detail}>
            <div className="segmented-control three" aria-label="Mode suara">
              {(['rvc', 'basic', 'disabled'] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  data-active={draft.voice.mode === mode}
                  onClick={() => setDraft({ ...draft, voice: { ...draft.voice, mode } })}
                >
                  {mode === 'rvc' ? 'RVC' : mode === 'basic' ? 'Basic' : 'Mati'}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Voice TTS</span>
              <input
                value={draft.voice.ttsVoice}
                onChange={(event) =>
                  setDraft({ ...draft, voice: { ...draft.voice, ttsVoice: event.target.value } })
                }
              />
            </label>
            <label className="range-field labelled">
              <span>
                Kecepatan <b>{draft.voice.speed.toFixed(2)}×</b>
              </span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={draft.voice.speed}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    voice: { ...draft.voice, speed: Number(event.target.value) }
                  })
                }
              />
            </label>
            <div className="rvc-settings" data-enabled={draft.voice.mode === 'rvc'}>
              <p>Eksperimen voice lokal tidak resmi · personal use only</p>
              <label className="range-field labelled">
                <span>
                  Pitch RVC <b>{draft.voice.rvc.pitch}</b>
                </span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={draft.voice.rvc.pitch}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      voice: {
                        ...draft.voice,
                        rvc: { ...draft.voice.rvc, pitch: Number(event.target.value) }
                      }
                    })
                  }
                />
              </label>
              <label className="range-field labelled">
                <span>
                  Index rate <b>{draft.voice.rvc.indexRate.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={draft.voice.rvc.indexRate}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      voice: {
                        ...draft.voice,
                        rvc: { ...draft.voice.rvc, indexRate: Number(event.target.value) }
                      }
                    })
                  }
                />
              </label>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => props.onVoiceTest(draft)}
            >
              <Volume2 size={15} aria-hidden="true" /> Tes suara
            </button>
          </SettingsSection>
        ) : null}

        {section === 'desktop' ? (
          <SettingsSection
            title="Perilaku desktop"
            description="Shortcut pemulihan: Ctrl+Shift+F12."
          >
            <Toggle
              label="Selalu di atas"
              checked={draft.desktop.alwaysOnTop}
              onChange={(alwaysOnTop) =>
                setDraft({ ...draft, desktop: { ...draft.desktop, alwaysOnTop } })
              }
            />
            <Toggle
              label="Mode tembus klik"
              detail="Tray dan shortcut selalu dapat memulihkan klik."
              checked={draft.desktop.clickThrough}
              onChange={(clickThrough) =>
                setDraft({ ...draft, desktop: { ...draft.desktop, clickThrough } })
              }
            />
            <Toggle
              label="Mulai bersama Windows"
              checked={draft.desktop.autoStart}
              onChange={(autoStart) =>
                setDraft({ ...draft, desktop: { ...draft.desktop, autoStart } })
              }
            />
            <label className="range-field labelled">
              <span>
                Skala avatar <b>{Math.round(draft.desktop.scale * 100)}%</b>
              </span>
              <input
                type="range"
                min="0.65"
                max="1.5"
                step="0.05"
                value={draft.desktop.scale}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    desktop: { ...draft.desktop, scale: Number(event.target.value) }
                  })
                }
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void window.yachiyo.resetWindowPosition()}
            >
              <MonitorUp size={15} aria-hidden="true" /> Pulihkan posisi jendela
            </button>
          </SettingsSection>
        ) : null}

        {section === 'proactive' ? (
          <SettingsSection title="Interaksi proaktif" description="Timezone tetap Asia/Jakarta.">
            <Toggle
              label="Aktifkan pengingat proaktif"
              checked={draft.proactive.enabled}
              onChange={(enabled) =>
                setDraft({ ...draft, proactive: { ...draft.proactive, enabled } })
              }
            />
            <div className="two-fields">
              <label className="field">
                <span>Quiet mulai</span>
                <input
                  type="time"
                  value={draft.proactive.quietStart}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      proactive: { ...draft.proactive, quietStart: event.target.value }
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Quiet selesai</span>
                <input
                  type="time"
                  value={draft.proactive.quietEnd}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      proactive: { ...draft.proactive, quietEnd: event.target.value }
                    })
                  }
                />
              </label>
            </div>
            <div className="two-fields">
              <label className="field">
                <span>Batas harian</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={draft.proactive.dailyLimit}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      proactive: { ...draft.proactive, dailyLimit: Number(event.target.value) }
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Jarak minimum</span>
                <select
                  value={draft.proactive.minimumGapMinutes}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      proactive: {
                        ...draft.proactive,
                        minimumGapMinutes: Number(event.target.value)
                      }
                    })
                  }
                >
                  <option value={30}>30 menit</option>
                  <option value={60}>60 menit</option>
                  <option value={90}>90 menit</option>
                  <option value={180}>3 jam</option>
                </select>
              </label>
            </div>
            <Toggle
              label="Sapaan pagi"
              checked={draft.proactive.morningGreeting}
              onChange={(morningGreeting) =>
                setDraft({ ...draft, proactive: { ...draft.proactive, morningGreeting } })
              }
            />
            <Toggle
              label="Review malam"
              checked={draft.proactive.eveningReview}
              onChange={(eveningReview) =>
                setDraft({ ...draft, proactive: { ...draft.proactive, eveningReview } })
              }
            />
            <Toggle
              label="Check-in saat inaktif"
              detail="Mati secara default; tidak memakai keylogger."
              checked={draft.proactive.inactivityCheckIn}
              onChange={(inactivityCheckIn) =>
                setDraft({ ...draft, proactive: { ...draft.proactive, inactivityCheckIn } })
              }
            />
          </SettingsSection>
        ) : null}

        {section === 'assets' ? (
          <SettingsSection
            title="Aset eksternal"
            description="ZIP atau folder hasil ekstrak sama-sama didukung."
          >
            <AssetRow
              title="Niziiro Mao"
              status={`${String(props.assets.live2d.expressions.length)} ekspresi · ${String(props.assets.live2d.motions.length)} motion`}
              tone={props.assets.live2d.state === 'ready' ? 'ready' : 'warning'}
              onChoose={() => {
                void window.yachiyo.chooseAssetFolder('live2d').then((result) => {
                  if (result.path)
                    setDraft({ ...draft, assets: { ...draft.assets, live2dRoot: result.path } })
                })
              }}
            />
            <AssetRow
              title="Cubism Core resmi"
              status={
                props.assets.live2d.hasCore
                  ? 'Siap'
                  : 'Belum dipasang · perlu persetujuan lisensi Live2D'
              }
              tone={props.assets.live2d.hasCore ? 'ready' : 'warning'}
              onChoose={() => {
                void window.yachiyo.chooseAssetFolder('cubism-core').then((result) => {
                  if (result.path)
                    setDraft({ ...draft, assets: { ...draft.assets, cubismCorePath: result.path } })
                })
              }}
            />
            <AssetRow
              title="Kobo RVC"
              status={
                props.assets.voice.state === 'ready'
                  ? 'Runtime siap'
                  : 'Model terdeteksi · runtime belum lengkap'
              }
              tone={props.assets.voice.state === 'ready' ? 'ready' : 'warning'}
              onChoose={() => {
                void window.yachiyo.chooseAssetFolder('voice').then((result) => {
                  if (result.path)
                    setDraft({ ...draft, assets: { ...draft.assets, voiceRoot: result.path } })
                })
              }}
            />
            <button
              className="secondary-button"
              type="button"
              onClick={() => void props.onRescan()}
            >
              <RefreshCw size={15} aria-hidden="true" /> Scan ulang aset
            </button>
          </SettingsSection>
        ) : null}

        {section === 'privacy' ? (
          <SettingsSection
            title="Privasi & log"
            description="Audio sementara dihapus; secret tidak masuk diagnostik."
          >
            <Toggle
              label="Izinkan mikrofon"
              detail="Mikrofon hanya digunakan saat push-to-talk ditekan."
              checked={draft.privacy.microphoneEnabled}
              onChange={(microphoneEnabled) =>
                setDraft({ ...draft, privacy: { ...draft.privacy, microphoneEnabled } })
              }
            />
            <Toggle
              label="Simpan riwayat percakapan"
              detail="Nonaktif secara default."
              checked={draft.privacy.saveConversation}
              onChange={(saveConversation) =>
                setDraft({ ...draft, privacy: { ...draft.privacy, saveConversation } })
              }
            />
            <label className="field">
              <span>Level log</span>
              <select
                value={draft.logging.level}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    logging: {
                      level: event.target.value as SettingsView['logging']['level']
                    }
                  })
                }
              >
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                void window.yachiyo
                  .exportDiagnostics()
                  .then(({ result }) => setFeedback(result.message))
              }}
            >
              <ShieldCheck size={15} aria-hidden="true" /> Ekspor diagnostik aman
            </button>
            <p className="secure-note" data-ready={draft.secureStorageAvailable}>
              <ShieldCheck size={15} aria-hidden="true" />
              {draft.secureStorageAvailable
                ? 'Penyimpanan kredensial Windows tersedia.'
                : 'Penyimpanan kredensial Windows belum tersedia; key tidak akan disimpan plaintext.'}
            </p>
          </SettingsSection>
        ) : null}

        {section === 'about' ? (
          <SettingsSection title="Tentang Yachiyo" description="Personal local build · versi 0.1.0">
            <div className="about-copy">
              <p>
                Yachiyo Companion adalah lapisan desktop untuk Hermes Agent. Hermes tetap menjadi
                reasoning dan memory system.
              </p>
              <p>
                Niziiro Mao sample model: illustration & modeling © Live2D Inc. Penggunaan tunduk
                pada lisensi dan Terms of Use Live2D.
              </p>
              <p>
                Kobo voice model: unofficial local voice experiment. Lisensi sumber belum
                terverifikasi; jangan distribusikan atau gunakan untuk impersonasi.
              </p>
            </div>
            <button
              className="danger-button"
              type="button"
              onClick={() =>
                void props.onReset().then((next) => {
                  setDraft(next)
                  setFeedback('Pengaturan direset.')
                })
              }
            >
              <RotateCcw size={15} aria-hidden="true" /> Reset semua pengaturan
            </button>
          </SettingsSection>
        ) : null}
      </div>

      <footer className="settings-footer">
        <span role="status">{feedback}</span>
        <button
          className="primary-button"
          type="button"
          onClick={() => void save()}
          disabled={busy}
        >
          <Save size={15} aria-hidden="true" /> Simpan
        </button>
      </footer>
    </section>
  )
}

function SettingsSection({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="settings-section">
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      {children}
    </section>
  )
}

function Toggle({
  label,
  detail,
  checked,
  onChange
}: {
  label: string
  detail?: string
  checked: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  )
}

function AssetRow({
  title,
  status,
  tone,
  onChoose
}: {
  title: string
  status: string
  tone: 'ready' | 'warning'
  onChoose: () => void
}): React.JSX.Element {
  return (
    <button className="asset-row" type="button" data-tone={tone} onClick={onChoose}>
      <span>
        <strong>{title}</strong>
        <small>{status}</small>
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  )
}
