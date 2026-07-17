import { useEffect, useState } from 'react'
import {
  BadgeInfo,
  Bell,
  Bot,
  Check,
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
  AssetApplyResult,
  AssetDialogResult,
  AssetSelectionRequest,
  AssetStatus,
  ConnectionTestResult,
  HermesConnectionDiagnostics,
  HermesConnectionState,
  HermesConnectionStatus,
  SettingsView,
  VoiceCapabilities
} from '@shared/types'

import { AssetSettings } from './AssetSettings'

type Props = {
  settings: SettingsView
  assets: AssetStatus
  voice: VoiceCapabilities
  hermes: HermesConnectionStatus
  onClose: () => void
  onSave: (settings: SettingsView, apiKey: string) => Promise<SettingsView>
  onTestConnection: (payload: {
    mode: 'mock' | 'hermes'
    baseUrl: string
    model: string
    timeoutMs: number
    apiKey?: string
  }) => Promise<ConnectionTestResult>
  onReset: () => Promise<SettingsView>
  onChooseAsset: (request: AssetSelectionRequest) => Promise<AssetDialogResult>
  onApplyAsset: (token: string) => Promise<AssetApplyResult>
  onRescan: () => Promise<AssetStatus>
  onVoiceTest: (settings: SettingsView, mode: 'basic' | 'rvc') => Promise<void>
  onVoiceRuntimeSetup: () => Promise<VoiceCapabilities>
  onVoiceRefresh: () => Promise<VoiceCapabilities>
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
  const onVoiceRefresh = props.onVoiceRefresh
  const voiceRuntimeState = props.voice.runtime.state
  const [draft, setDraft] = useState(props.settings)
  const [section, setSection] = useState<Section>('connection')
  const [apiKey, setApiKey] = useState('')
  const [feedback, setFeedback] = useState('')
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceTestBusy, setVoiceTestBusy] = useState<'basic' | 'rvc' | null>(null)

  useEffect(() => {
    if (section !== 'voice' || !['checking', 'downloading'].includes(voiceRuntimeState)) {
      return
    }
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const poll = (): void => {
      timer = setTimeout(() => {
        void onVoiceRefresh().finally(() => {
          if (active) poll()
        })
      }, 750)
    }
    poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [onVoiceRefresh, section, voiceRuntimeState])

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await props.onSave(draft, apiKey)
      setDraft(next)
      setApiKey('')
      setFeedback('Pengaturan tersimpan.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Pengaturan tidak dapat disimpan.')
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
            description="Mode tersimpan menentukan provider chat; mock lokal tetap tersedia saat diperlukan."
          >
            <div className="segmented-control" aria-label="Mode koneksi">
              <button
                type="button"
                data-active={draft.connection.mode === 'mock'}
                onClick={() => {
                  setConnectionResult(null)
                  setDraft({ ...draft, connection: { ...draft.connection, mode: 'mock' } })
                }}
              >
                Mock lokal
              </button>
              <button
                type="button"
                data-active={draft.connection.mode === 'hermes'}
                onClick={() => {
                  setConnectionResult(null)
                  setDraft({ ...draft, connection: { ...draft.connection, mode: 'hermes' } })
                }}
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
                onChange={(event) => {
                  setConnectionResult(null)
                  setDraft({
                    ...draft,
                    connection: { ...draft.connection, baseUrl: event.target.value }
                  })
                }}
              />
            </label>
            <label className="field">
              <span>Nama model</span>
              <input
                value={draft.connection.model}
                disabled={draft.connection.mode === 'mock'}
                onChange={(event) => {
                  setConnectionResult(null)
                  setDraft({
                    ...draft,
                    connection: { ...draft.connection, model: event.target.value }
                  })
                }}
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
                  onChange={(event) => {
                    setConnectionResult(null)
                    setApiKey(event.target.value)
                  }}
                />
              </span>
            </label>
            <div className="two-fields">
              <label className="field">
                <span>Timeout</span>
                <select
                  value={draft.connection.timeoutMs}
                  onChange={(event) => {
                    setConnectionResult(null)
                    setDraft({
                      ...draft,
                      connection: { ...draft.connection, timeoutMs: Number(event.target.value) }
                    })
                  }}
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
                void props
                  .onTestConnection({
                    mode: draft.connection.mode,
                    baseUrl: draft.connection.baseUrl,
                    model: draft.connection.model,
                    timeoutMs: draft.connection.timeoutMs,
                    ...(apiKey ? { apiKey } : {})
                  })
                  .then((result) => {
                    setConnectionResult(result)
                    setFeedback(result.ok ? 'Tes koneksi selesai.' : result.message)
                  })
                  .catch((error: unknown) => {
                    setFeedback(error instanceof Error ? error.message : 'Tes koneksi gagal.')
                  })
                  .finally(() => setBusy(false))
              }}
            >
              <RefreshCw size={15} aria-hidden="true" /> Tes koneksi
            </button>
            {connectionResult ? (
              <p className="connection-result" data-ok={connectionResult.ok}>
                {connectionResult.ok ? <Check size={15} aria-hidden="true" /> : null}
                <span>
                  Hasil tes manual: {connectionResult.message}
                  {connectionResult.warning ? <small>{connectionResult.warning}</small> : null}
                </span>
              </p>
            ) : null}
            <HermesDiagnosticsPanel
              status={props.hermes.state}
              message={props.hermes.message}
              diagnostics={props.hermes.diagnostics}
            />
          </SettingsSection>
        ) : null}

        {section === 'voice' ? (
          <SettingsSection title="Suara" description={props.voice.detail}>
            <div
              className="voice-runtime-card"
              data-state={props.voice.runtime.state}
              aria-live="polite"
              data-testid="voice-runtime-status"
            >
              <div className="voice-runtime-heading">
                <div>
                  <strong>Runtime RVC · {runtimeStateLabel(props.voice.runtime.state)}</strong>
                  <span>{props.voice.runtime.stage}</span>
                </div>
                <span className="runtime-device">{props.voice.deviceInfo.selected}</span>
              </div>
              {props.voice.runtime.state === 'downloading' ||
              props.voice.runtime.state === 'checking' ? (
                <div className="runtime-progress">
                  <progress max="100" value={props.voice.runtime.progress} />
                  <span>
                    {props.voice.runtime.progress.toFixed(1)}% ·{' '}
                    {formatBytes(props.voice.runtime.downloadedBytes)} /{' '}
                    {formatBytes(props.voice.runtime.totalBytes)}
                  </span>
                </div>
              ) : null}
              <div className="runtime-assets">
                {Object.entries(props.voice.runtime.assets).map(([id, asset]) => (
                  <span key={id} data-ready={asset.state === 'ready'}>
                    {asset.state === 'ready' ? '✓' : '○'} {asset.label}
                  </span>
                ))}
              </div>
              {props.voice.runtime.state === 'setup-required' ||
              props.voice.runtime.state === 'error' ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    setFeedback('Penyiapan runtime RVC dimulai…')
                    void props.onVoiceRuntimeSetup().finally(() => setBusy(false))
                  }}
                >
                  <RefreshCw size={15} aria-hidden="true" /> Siapkan RVC
                </button>
              ) : null}
              {props.voice.runtime.error ? (
                <p className="runtime-error">
                  Penyiapan gagal ({props.voice.runtime.error}). Periksa koneksi lalu coba lagi;
                  Basic TTS tetap tersedia.
                </p>
              ) : null}
            </div>
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
              <p>Konversi lokal Kobo RVC v2 · RMVPE · HuBERT · 48 kHz</p>
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
              <label className="range-field labelled">
                <span>
                  Protection <b>{draft.voice.rvc.protect.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={draft.voice.rvc.protect}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      voice: {
                        ...draft.voice,
                        rvc: { ...draft.voice.rvc, protect: Number(event.target.value) }
                      }
                    })
                  }
                />
              </label>
              <div className="two-fields">
                <label className="field">
                  <span>Perangkat inferensi</span>
                  <select
                    value={draft.voice.rvc.device}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        voice: {
                          ...draft.voice,
                          rvc: {
                            ...draft.voice.rvc,
                            device: event.target.value as 'auto' | 'cpu' | 'cuda'
                          }
                        }
                      })
                    }
                  >
                    <option value="auto">Auto ({props.voice.deviceInfo.selected})</option>
                    <option value="cpu">CPU</option>
                    <option value="cuda" disabled={!props.voice.deviceInfo.cudaAvailable}>
                      CUDA
                      {props.voice.deviceInfo.cudaName
                        ? ` · ${props.voice.deviceInfo.cudaName}`
                        : ''}
                    </option>
                  </select>
                </label>
                <label className="field">
                  <span>Ekstraksi pitch</span>
                  <input value="RMVPE" readOnly />
                </label>
              </div>
            </div>
            <div className="voice-comparison" aria-label="Perbandingan suara">
              <div>
                <strong>Bandingkan suara</strong>
                <span>Keduanya memakai kalimat dan voice Edge TTS yang sama.</span>
              </div>
              <div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={voiceTestBusy !== null}
                  onClick={() => {
                    setVoiceTestBusy('basic')
                    setFeedback('Memutar tes Basic TTS…')
                    void props
                      .onVoiceTest(draft, 'basic')
                      .then(() => setFeedback('Tes Basic selesai diputar.'))
                      .finally(() => setVoiceTestBusy(null))
                  }}
                >
                  <Volume2 size={15} aria-hidden="true" />
                  {voiceTestBusy === 'basic' ? 'Memproses…' : 'Tes Basic'}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={voiceTestBusy !== null || !props.voice.rvc}
                  onClick={() => {
                    setVoiceTestBusy('rvc')
                    setFeedback('Mengonversi dan memutar tes Kobo RVC…')
                    void props
                      .onVoiceTest(draft, 'rvc')
                      .then(() => setFeedback('Tes RVC selesai diputar.'))
                      .finally(() => setVoiceTestBusy(null))
                  }}
                >
                  <Volume2 size={15} aria-hidden="true" />
                  {voiceTestBusy === 'rvc' ? 'Mengonversi…' : 'Tes RVC Kobo'}
                </button>
              </div>
              {!props.voice.rvc ? (
                <small>RVC aktif setelah runtime dan folder Kobo sama-sama berstatus ready.</small>
              ) : null}
            </div>
            {props.voice.lastMetrics ? <VoiceMetricsPanel voice={props.voice} /> : null}
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
            description="Pilih folder hasil ekstrak atau ZIP secara terpisah. Setiap pilihan langsung dipindai dan disimpan."
          >
            <AssetSettings
              paths={draft.assets}
              assets={props.assets}
              onPathsChanged={(assets) => setDraft((current) => ({ ...current, assets }))}
              onChoose={props.onChooseAsset}
              onApply={props.onApplyAsset}
              onRescan={props.onRescan}
            />
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
          <SettingsSection title="Tentang Yachiyo" description="Personal local build · versi 0.2.1">
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

function HermesDiagnosticsPanel({
  status,
  message,
  diagnostics
}: {
  status: HermesConnectionState
  message: string
  diagnostics: HermesConnectionDiagnostics
}): React.JSX.Element {
  const checkedAt = diagnostics.checkedAt
    ? new Date(diagnostics.checkedAt).toLocaleString('id-ID')
    : 'Belum diperiksa'
  return (
    <div className="hermes-diagnostics" aria-label="Diagnostik koneksi Hermes">
      <strong>Diagnostik aman</strong>
      <dl>
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Pesan</dt>
          <dd>{message}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{diagnostics.mode}</dd>
        </div>
        <div>
          <dt>Base URL</dt>
          <dd>{diagnostics.normalizedBaseUrl ?? '-'}</dd>
        </div>
        <div>
          <dt>Endpoint aktif</dt>
          <dd>{diagnostics.activeEndpoint ?? diagnostics.chatEndpoint ?? '-'}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{diagnostics.selectedModel || '-'}</dd>
        </div>
        <div>
          <dt>HTTP</dt>
          <dd>{diagnostics.httpStatus ?? '-'}</dd>
        </div>
        <div>
          <dt>Kategori</dt>
          <dd>{diagnostics.errorCategory}</dd>
        </div>
        <div>
          <dt>Timeout</dt>
          <dd>{Math.round(diagnostics.timeoutMs / 1_000)} detik</dd>
        </div>
        <div>
          <dt>Ringkasan respons</dt>
          <dd>{diagnostics.responseSummary ?? '-'}</dd>
        </div>
        <div>
          <dt>Pemeriksaan terakhir</dt>
          <dd>{checkedAt}</dd>
        </div>
      </dl>
      <small>API key, header Authorization, dan isi percakapan tidak ditampilkan.</small>
    </div>
  )
}

function VoiceMetricsPanel({ voice }: { voice: VoiceCapabilities }): React.JSX.Element {
  const metrics = voice.lastMetrics
  if (!metrics) return <></>
  return (
    <div className="voice-metrics" data-testid="voice-metrics">
      <div>
        <strong>Metrik konversi terakhir</strong>
        <span>{metrics.deviceName ?? metrics.device ?? voice.device}</span>
      </div>
      <dl>
        <div>
          <dt>Cold-start</dt>
          <dd>{formatMilliseconds(metrics.coldStartMs)}</dd>
        </div>
        <div>
          <dt>Konversi</dt>
          <dd>{formatMilliseconds(metrics.conversionMs)}</dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>{formatMilliseconds(metrics.audioDurationMs)}</dd>
        </div>
        <div>
          <dt>CPU</dt>
          <dd>{metrics.cpuPercent === undefined ? '—' : `${metrics.cpuPercent.toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt>Peak RAM</dt>
          <dd>{metrics.peakRamMb === undefined ? '—' : `${metrics.peakRamMb.toFixed(1)} MB`}</dd>
        </div>
        <div>
          <dt>FAISS</dt>
          <dd>{formatMilliseconds(metrics.indexMs)}</dd>
        </div>
      </dl>
      {voice.lastPlayback ? (
        <p className="playback-proof" data-source={voice.lastPlayback.source}>
          <Check size={14} aria-hidden="true" /> Playback WebAudio selesai · lip-sync puncak{' '}
          {voice.lastPlayback.maxLipSync.toFixed(2)}
        </p>
      ) : (
        <p className="playback-proof pending">Audio dibuat; menunggu playback selesai.</p>
      )}
    </div>
  )
}

function runtimeStateLabel(state: VoiceCapabilities['runtime']['state']): string {
  if (state === 'ready') return 'ready'
  if (state === 'downloading') return 'mengunduh'
  if (state === 'checking') return 'memeriksa'
  if (state === 'error') return 'gagal'
  return 'perlu setup'
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB'
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatMilliseconds(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return value >= 1_000 ? `${(value / 1_000).toFixed(2)} dtk` : `${value.toFixed(1)} ms`
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
