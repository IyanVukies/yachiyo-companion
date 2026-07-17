import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  Bell,
  FlaskConical,
  MessageCircle,
  Minus,
  MousePointer2,
  Settings,
  Volume2,
  VolumeX
} from 'lucide-react'

import { avatarReducer, initialAvatarState, type AvatarAction } from '@shared/avatar-state'
import type {
  AppSettings,
  AppStatus,
  AvatarState,
  ChatEvent,
  ChatMessage,
  NormalizedError,
  ProactiveEvent,
  Reminder,
  SettingsView
} from '@shared/types'

import { AvatarLab } from './components/AvatarLab'
import { ChatPanel } from './components/ChatPanel'
import { FallbackAvatar } from './components/FallbackAvatar'
import { Live2DAvatar, type Live2DAvatarHandle } from './components/Live2DAvatar'
import { Onboarding } from './components/Onboarding'
import { RemindersPanel } from './components/RemindersPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { StatusPill } from './components/StatusPill'
import { useVoiceQueue } from './hooks/useVoiceQueue'

type Panel = 'chat' | 'settings' | 'lab' | 'reminders' | null

const WELCOME_MESSAGE: ChatMessage = {
  id: '00000000-0000-4000-8000-000000000001',
  role: 'assistant',
  content:
    'Halo. Aku berjalan dengan Hermes mock lokal, jadi kita bisa langsung menguji chat tanpa API key.',
  createdAt: new Date(0).toISOString()
}

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const [currentRequest, setCurrentRequest] = useState<string | null>(null)
  const [chatError, setChatError] = useState<NormalizedError | null>(null)
  const [lastUserText, setLastUserText] = useState('')
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null)
  const [notice, setNotice] = useState('')
  const [fatalError, setFatalError] = useState('')
  const [live2dFailedScan, setLive2dFailedScan] = useState<string | null>(null)
  const [live2dReadyScan, setLive2dReadyScan] = useState<string | null>(null)
  const [avatar, dispatchAvatar] = useReducer(avatarReducer, initialAvatarState)
  const requestAssistantIds = useRef(new Map<string, string>())
  const settingsRef = useRef<SettingsView | null>(null)
  const live2dRef = useRef<Live2DAvatarHandle>(null)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const setAvatarState = useCallback((state: AvatarState) => {
    dispatchAvatar({ type: 'transition', state })
  }, [])
  const setLipSync = useCallback((value: number) => dispatchAvatar({ type: 'lip-sync', value }), [])
  const { speak, speaking, stop } = useVoiceQueue({
    onAvatarState: setAvatarState,
    onLipSync: setLipSync
  })

  useEffect(() => {
    let active = true
    void Promise.all([
      window.yachiyo.getAppStatus(),
      window.yachiyo.getSettings(),
      window.yachiyo.listReminders()
    ])
      .then(([nextStatus, nextSettings, nextReminders]) => {
        if (!active) return
        setStatus(nextStatus)
        setSettings(nextSettings)
        setReminders(nextReminders)
      })
      .catch(() => {
        if (active) {
          setFatalError(
            'Aplikasi tidak dapat membaca layanan lokal. Tutup lalu buka kembali Yachiyo.'
          )
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const unsubscribeChat = window.yachiyo.onChatEvent((event) => {
      handleChatEvent(
        event,
        requestAssistantIds.current,
        setMessages,
        setCurrentRequest,
        setChatError,
        dispatchAvatar,
        (text) => {
          const currentSettings = settingsRef.current
          if (currentSettings) void speak(text, currentSettings.voice)
        }
      )
    })
    const unsubscribeProactive = window.yachiyo.onProactiveEvent((event: ProactiveEvent) => {
      setActiveReminder(event.reminder)
      setAvatarState('reminder')
      void window.yachiyo.listReminders().then(setReminders)
    })
    const unsubscribeCommand = window.yachiyo.onAppCommand((command) => setPanel(command))
    return () => {
      unsubscribeChat()
      unsubscribeProactive()
      unsubscribeCommand()
    }
  }, [setAvatarState, speak])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3_200)
    return () => clearTimeout(timer)
  }, [notice])

  const sendMessage = useCallback(
    (text: string): void => {
      if (currentRequest) return
      const requestId = crypto.randomUUID()
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString()
      }
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString()
      }
      requestAssistantIds.current.set(requestId, assistantMessage.id)
      const nextMessages = [...messages, userMessage]
      setMessages([...nextMessages, assistantMessage])
      setLastUserText(text)
      setChatError(null)
      setCurrentRequest(requestId)
      setAvatarState('thinking')
      void window.yachiyo
        .startChat({
          requestId,
          messages: nextMessages.map(({ role, content }) => ({ role, content }))
        })
        .then((result) => {
          if (!result.ok) {
            setCurrentRequest(null)
            setNotice(result.message)
          }
        })
        .catch(() => {
          setCurrentRequest(null)
          setNotice('Permintaan chat tidak dapat dimulai.')
          setAvatarState('error')
        })
    },
    [currentRequest, messages, setAvatarState]
  )

  if (fatalError) {
    return (
      <main className="fatal-screen no-drag">
        <span>Y</span>
        <h1>Yachiyo perlu dibuka ulang</h1>
        <p>{fatalError}</p>
        <small>Data pengaturan tetap aman.</small>
      </main>
    )
  }

  if (!settings || !status) {
    return (
      <main className="loading-screen">
        <span className="loading-orbit" aria-hidden="true" />
        <p>Menyiapkan Yachiyo…</p>
      </main>
    )
  }

  const assets = status.assets
  const stateLabel = avatarLabel(avatar.current)
  const live2dReady = live2dReadyScan === assets.scannedAt
  const useLive2D = assets.live2d.state === 'ready' && live2dFailedScan !== assets.scannedAt

  return (
    <div className="app-shell" data-panel-open={panel !== null} data-avatar-state={avatar.current}>
      <header className="app-header drag-region">
        <div className="brand-lockup">
          <span className="brand-mark">Y</span>
          <div>
            <strong>Yachiyo</strong>
            <span>desktop companion</span>
          </div>
        </div>
        <div className="header-actions">
          <StatusPill status={status} />
          <button
            className="icon-button no-drag"
            type="button"
            onClick={() => void window.yachiyo.hideWindow()}
            aria-label="Sembunyikan ke tray"
          >
            <Minus size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="avatar-stage">
        <div className="ambient-grid" aria-hidden="true" />
        <div className="state-copy">
          <span>{stateLabel.eyebrow}</span>
          <strong>{stateLabel.title}</strong>
        </div>
        {useLive2D ? (
          <Live2DAvatar
            key={assets.scannedAt}
            ref={live2dRef}
            state={avatar.current}
            lipSync={avatar.lipSync}
            scale={settings.desktop.scale}
            onActivate={() => setPanel('chat')}
            onReady={() => setLive2dReadyScan(assets.scannedAt)}
            onError={() => {
              setLive2dFailedScan(assets.scannedAt)
              setLive2dReadyScan(null)
              setNotice('Runtime Mao gagal dimulai; avatar fallback tetap tersedia.')
            }}
          />
        ) : (
          <FallbackAvatar
            state={avatar.current}
            lipSync={avatar.lipSync}
            scale={settings.desktop.scale}
            onActivate={() => setPanel('chat')}
          />
        )}
        <div className="avatar-caption">
          <span data-tone={live2dReady ? 'ready' : 'fallback'}>
            {live2dReady ? 'Mao runtime aktif' : 'Fallback aktif'}
          </span>
          <p>
            {live2dReady
              ? 'Klik avatar untuk bicara.'
              : assets.live2d.hasCore
                ? 'Runtime Mao sedang dimuat atau memakai fallback aman.'
                : assets.live2d.state === 'missing'
                  ? 'Mao belum dipilih; avatar fallback siap digunakan.'
                  : 'Mao terdeteksi; Cubism Core resmi belum dipasang.'}
          </p>
        </div>
      </main>

      {activeReminder ? (
        <aside className="reminder-toast no-drag" aria-live="assertive">
          <span className="reminder-toast-icon">
            <Bell size={17} aria-hidden="true" />
          </span>
          <div>
            <strong>{activeReminder.title}</strong>
            <p>{activeReminder.body}</p>
            <div>
              <button
                type="button"
                onClick={() => {
                  void window.yachiyo
                    .actOnReminder({ id: activeReminder.id, action: 'snooze-10' })
                    .then(() => setActiveReminder(null))
                }}
              >
                10 menit
              </button>
              <button
                type="button"
                onClick={() => {
                  void window.yachiyo
                    .actOnReminder({ id: activeReminder.id, action: 'dismiss' })
                    .then(() => setActiveReminder(null))
                }}
              >
                Selesai
              </button>
            </div>
          </div>
        </aside>
      ) : null}

      <nav className="companion-dock no-drag" aria-label="Kontrol utama">
        <DockButton active={panel === 'chat'} label="Chat" onClick={() => setPanel('chat')}>
          <MessageCircle aria-hidden="true" />
        </DockButton>
        <DockButton
          active={speaking}
          label={speaking ? 'Stop' : 'Suara'}
          onClick={() => {
            if (speaking) stop()
            else void speak('Halo, suara Yachiyo siap digunakan.', settings.voice)
          }}
        >
          {speaking ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </DockButton>
        <DockButton
          active={panel === 'reminders'}
          label="Ingat"
          onClick={() => setPanel('reminders')}
        >
          <Bell aria-hidden="true" />
        </DockButton>
        <DockButton active={panel === 'lab'} label="Lab" onClick={() => setPanel('lab')}>
          <FlaskConical aria-hidden="true" />
        </DockButton>
        <DockButton active={panel === 'settings'} label="Atur" onClick={() => setPanel('settings')}>
          <Settings aria-hidden="true" />
        </DockButton>
      </nav>

      <button
        className="click-through-hint no-drag"
        type="button"
        onClick={() => {
          void window.yachiyo
            .setClickThrough(true)
            .then(() => setNotice('Mode tembus klik aktif · Ctrl+Shift+F12 untuk pulih.'))
        }}
        aria-label="Aktifkan mode tembus klik"
      >
        <MousePointer2 size={13} aria-hidden="true" />
      </button>

      {panel === 'chat' ? (
        <ChatPanel
          messages={messages}
          busy={Boolean(currentRequest)}
          error={chatError}
          lastUserText={lastUserText}
          microphoneEnabled={settings.privacy.microphoneEnabled}
          onClose={() => setPanel(null)}
          onSend={sendMessage}
          onStop={() => {
            if (currentRequest) void window.yachiyo.cancelChat(currentRequest)
            stop()
          }}
          onRetry={() => sendMessage(lastUserText)}
          onClear={() => {
            setMessages([WELCOME_MESSAGE])
            setChatError(null)
            setLastUserText('')
          }}
          onPtt={() =>
            setNotice(
              settings.privacy.microphoneEnabled
                ? 'Hermes STT belum terhubung; gunakan input teks untuk build ini.'
                : 'Aktifkan izin mikrofon di Pengaturan → Privasi.'
            )
          }
        />
      ) : null}

      {panel === 'lab' ? (
        <AvatarLab
          assets={assets}
          lipSync={avatar.lipSync}
          onClose={() => setPanel(null)}
          onState={(state) => {
            setAvatarState(state)
            if (!['speaking', 'listening', 'thinking'].includes(state)) {
              setTimeout(() => dispatchAvatar({ type: 'settle' }), 1_800)
            }
          }}
          onLipSync={setLipSync}
          runtimeReady={live2dReady}
          onExpression={(name) => {
            const started = live2dRef.current?.setExpression(name) ?? false
            if (!started) setNotice('Ekspresi belum dapat dijalankan.')
            return started
          }}
          onMotion={(group, index) => {
            const started = live2dRef.current?.startMotion(group, index) ?? false
            if (!started) setNotice('Motion belum dapat dijalankan.')
            return started
          }}
        />
      ) : null}

      {panel === 'reminders' ? (
        <RemindersPanel
          reminders={reminders}
          onClose={() => setPanel(null)}
          onTest={async () => {
            const result = await window.yachiyo.sendTestReminder()
            setReminders(await window.yachiyo.listReminders())
            return result.message
          }}
          onSchedule={async (payload) => {
            const result = await window.yachiyo.scheduleReminder(payload)
            setReminders(await window.yachiyo.listReminders())
            return result.message
          }}
        />
      ) : null}

      {panel === 'settings' ? (
        <SettingsPanel
          settings={settings}
          assets={assets}
          voice={status.voice}
          onClose={() => setPanel(null)}
          onSave={async (view, apiKey) => {
            const plainSettings = toAppSettings(view)
            const next = await window.yachiyo.updateSettings({
              settings: plainSettings,
              ...(apiKey ? { apiKey } : {})
            })
            setSettings(next)
            setStatus(await window.yachiyo.getAppStatus())
            return next
          }}
          onReset={async () => {
            const next = await window.yachiyo.resetSettings()
            setSettings(next)
            setStatus(await window.yachiyo.getAppStatus())
            return next
          }}
          onChooseAsset={(request) => window.yachiyo.chooseAssetSource(request)}
          onApplyAsset={async (token) => {
            const result = await window.yachiyo.applyAssetSelection(token)
            setSettings(result.settings)
            setStatus(await window.yachiyo.getAppStatus())
            return result
          }}
          onRescan={async () => {
            const assets = await window.yachiyo.scanAssets()
            setStatus(await window.yachiyo.getAppStatus())
            return assets
          }}
          onVoiceTest={(view) => void speak('Halo, ini tes suara Yachiyo.', view.voice)}
        />
      ) : null}

      {!settings.onboardingComplete ? (
        <Onboarding
          settings={settings}
          assets={assets}
          onComplete={async () => {
            const plainSettings = toAppSettings(settings)
            setSettings(
              await window.yachiyo.updateSettings({
                settings: { ...plainSettings, onboardingComplete: true }
              })
            )
          }}
        />
      ) : null}

      {notice ? (
        <div className="app-notice no-drag" role="status">
          {notice}
        </div>
      ) : null}
    </div>
  )
}

function DockButton({
  active,
  label,
  onClick,
  children
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button type="button" data-active={active} onClick={onClick} aria-label={label}>
      {children}
      <span>{label}</span>
    </button>
  )
}

function handleChatEvent(
  event: ChatEvent,
  requestMap: Map<string, string>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setCurrentRequest: React.Dispatch<React.SetStateAction<string | null>>,
  setError: React.Dispatch<React.SetStateAction<NormalizedError | null>>,
  dispatchAvatar: React.Dispatch<AvatarAction>,
  speak: (text: string) => void
): void {
  const assistantId = requestMap.get(event.requestId)
  if (event.type === 'delta' && assistantId) {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId ? { ...message, content: message.content + event.text } : message
      )
    )
    dispatchAvatar({ type: 'transition', state: 'thinking' })
    return
  }
  if (event.type === 'metadata') {
    if (event.metadata.emotion)
      dispatchAvatar({ type: 'transition', state: event.metadata.emotion })
    return
  }
  if (event.type === 'done') {
    if (assistantId) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, content: event.text } : message
        )
      )
    }
    setCurrentRequest(null)
    setError(null)
    requestMap.delete(event.requestId)
    speak(event.text)
    return
  }
  if (event.type === 'error') {
    if (assistantId && event.partialText) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, content: event.partialText } : message
        )
      )
    }
    setCurrentRequest(null)
    setError(event.error)
    dispatchAvatar({ type: 'transition', state: 'error' })
    requestMap.delete(event.requestId)
    return
  }
  if (event.type === 'cancelled') {
    setCurrentRequest(null)
    dispatchAvatar({ type: 'transition', state: 'idle' })
    requestMap.delete(event.requestId)
  }
}

function avatarLabel(state: AvatarState): { eyebrow: string; title: string } {
  const labels: Record<AvatarState, { eyebrow: string; title: string }> = {
    idle: { eyebrow: 'Hadirmu terdeteksi', title: 'Aku di sini.' },
    listening: { eyebrow: 'Mendengarkan', title: 'Silakan bicara.' },
    thinking: { eyebrow: 'Hermes sedang bekerja', title: 'Sebentar…' },
    speaking: { eyebrow: 'Membacakan jawaban', title: 'Dengarkan ya.' },
    happy: { eyebrow: 'Kabar baik', title: 'Senang mendengarnya.' },
    concerned: { eyebrow: 'Perlu perhatian', title: 'Kita cek pelan-pelan.' },
    confused: { eyebrow: 'Butuh konteks', title: 'Boleh diperjelas?' },
    reminder: { eyebrow: 'Pengingat lokal', title: 'Ada sesuatu untukmu.' },
    success: { eyebrow: 'Selesai', title: 'Sudah beres.' },
    error: { eyebrow: 'Fallback tetap aktif', title: 'Ada yang tidak tersambung.' }
  }
  return labels[state]
}

function toAppSettings(view: SettingsView): AppSettings {
  return {
    schemaVersion: view.schemaVersion,
    onboardingComplete: view.onboardingComplete,
    connection: view.connection,
    voice: view.voice,
    proactive: view.proactive,
    desktop: view.desktop,
    assets: view.assets,
    privacy: view.privacy,
    logging: view.logging
  }
}
