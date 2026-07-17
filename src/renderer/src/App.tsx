import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  Bell,
  Check,
  FlaskConical,
  MessageCircle,
  Minus,
  Move,
  MousePointer2,
  Settings,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'

import { avatarReducer, initialAvatarState } from '@shared/avatar-state'
import { clampAvatarTransform } from '@shared/avatar-transform'
import type {
  AppSettings,
  AppStatus,
  AvatarState,
  AvatarTransform,
  ChatEvent,
  ChatMessage,
  HermesConnectionStatus,
  LauncherStatus,
  PresentationMode,
  ProactiveEvent,
  Reminder,
  SettingsView,
  VoiceCapabilities
} from '@shared/types'

import { AvatarLab } from './components/AvatarLab'
import { AvatarTransformLayer } from './components/AvatarTransformLayer'
import { ChatPanel } from './components/ChatPanel'
import { CompanionComposer } from './components/CompanionComposer'
import { FallbackAvatar } from './components/FallbackAvatar'
import { Live2DAvatar, type Live2DAvatarHandle } from './components/Live2DAvatar'
import { Onboarding } from './components/Onboarding'
import { RemindersPanel } from './components/RemindersPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { StatusPill } from './components/StatusPill'
import { ResponseBubble } from './components/ResponseBubble'
import { useVoiceQueue } from './hooks/useVoiceQueue'
import {
  conversationReducer,
  createConversationState,
  latestAssistantMessage,
  WELCOME_MESSAGE
} from './state/conversation-store'

type Panel = 'settings' | 'lab' | 'reminders' | null
type AvatarBounds = { left: number; top: number; width: number; height: number }

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [conversation, dispatchConversation] = useReducer(conversationReducer, undefined, () =>
    createConversationState()
  )
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null)
  const [notice, setNotice] = useState('')
  const [fatalError, setFatalError] = useState('')
  const [live2dFailedScan, setLive2dFailedScan] = useState<string | null>(null)
  const [live2dReadyScan, setLive2dReadyScan] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<AvatarTransform | null>(null)
  const [avatarEditing, setAvatarEditing] = useState(false)
  const [avatarBounds, setAvatarBounds] = useState<AvatarBounds | null>(null)
  const [bubbleBottom, setBubbleBottom] = useState(560)
  const [avatar, dispatchAvatar] = useReducer(avatarReducer, initialAvatarState)
  const settingsRef = useRef<SettingsView | null>(null)
  const conversationRef = useRef(conversation)
  const latestHermesStatus = useRef<HermesConnectionStatus | null>(null)
  const live2dRef = useRef<Live2DAvatarHandle>(null)
  const avatarStageRef = useRef<HTMLElement>(null)
  const companionComposerRef = useRef<HTMLTextAreaElement>(null)
  const fullChatComposerRef = useRef<HTMLTextAreaElement>(null)
  const metadataRequests = useRef(new Set<string>())

  const applyStatus = useCallback((nextStatus: AppStatus): void => {
    const hermes = latestHermesStatus.current
    setStatus(hermes ? { ...nextStatus, connection: hermes.state, hermes } : nextStatus)
  }, [])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  useEffect(() => {
    const stage = avatarStageRef.current
    if (!stage) return
    const update = (): void => setBubbleBottom(stage.getBoundingClientRect().bottom)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [conversation.presentationMode])

  const setAvatarState = useCallback((state: AvatarState) => {
    dispatchAvatar({ type: 'transition', state })
  }, [])
  const setLipSync = useCallback((value: number) => dispatchAvatar({ type: 'lip-sync', value }), [])
  const { speak, speaking, stop } = useVoiceQueue({
    onAvatarState: setAvatarState,
    onLipSync: setLipSync
  })
  const refreshVoice = useCallback(async (): Promise<VoiceCapabilities> => {
    const voice = await window.yachiyo.getVoiceCapabilities()
    const nextStatus = await window.yachiyo.getAppStatus()
    applyStatus({ ...nextStatus, voice })
    return voice
  }, [applyStatus])

  const setPresentationMode = useCallback((mode: PresentationMode): void => {
    dispatchConversation({ type: 'presentation', mode })
    setPanel(null)
    if (mode === 'full-chat') {
      setAvatarEditing(false)
      setAvatarPreview(null)
    }
    void window.yachiyo.setPresentationMode(mode).catch(() => undefined)
    window.setTimeout(() => {
      const target =
        mode === 'full-chat' ? fullChatComposerRef.current : companionComposerRef.current
      target?.focus()
    }, 0)
  }, [])

  const applyChatEvent = useCallback(
    (event: ChatEvent): void => {
      if (event.type === 'started') return
      if (event.type === 'delta') {
        dispatchConversation({
          type: 'delta',
          requestId: event.requestId,
          text: event.text
        })
        dispatchAvatar({ type: 'transition', state: 'thinking' })
        return
      }
      if (event.type === 'metadata') {
        if (event.metadata.emotion) {
          metadataRequests.current.add(event.requestId)
          dispatchAvatar({ type: 'transition', state: event.metadata.emotion })
          live2dRef.current?.setExpression(event.metadata.emotion)
        }
        return
      }
      if (event.type === 'done') {
        dispatchConversation({ type: 'done', requestId: event.requestId, text: event.text })
        const currentSettings = settingsRef.current
        if (currentSettings?.voice.mode && currentSettings.voice.mode !== 'disabled') {
          void speak(event.text, currentSettings.voice)
        } else if (!metadataRequests.current.has(event.requestId)) {
          dispatchAvatar({ type: 'transition', state: 'idle' })
        } else {
          window.setTimeout(() => dispatchAvatar({ type: 'settle' }), 1_800)
        }
        metadataRequests.current.delete(event.requestId)
        return
      }
      if (event.type === 'error') {
        dispatchConversation({
          type: 'error',
          requestId: event.requestId,
          error: event.error,
          partialText: event.partialText
        })
        dispatchAvatar({ type: 'transition', state: 'error' })
        metadataRequests.current.delete(event.requestId)
        return
      }
      dispatchConversation({
        type: 'cancelled',
        requestId: event.requestId,
        partialText: event.partialText
      })
      dispatchAvatar({ type: 'transition', state: 'idle' })
      metadataRequests.current.delete(event.requestId)
    },
    [speak]
  )

  useEffect(() => {
    let active = true
    void Promise.all([
      window.yachiyo.getAppStatus(),
      window.yachiyo.getSettings(),
      window.yachiyo.listReminders()
    ])
      .then(([nextStatus, nextSettings, nextReminders]) => {
        if (!active) return
        applyStatus(nextStatus)
        setSettings(nextSettings)
        setReminders(nextReminders)
        dispatchConversation({
          type: 'configure',
          activeConversationId: nextSettings.connection.sessionId || 'desktop',
          presentationMode: nextSettings.desktop.restorePreviousPresentationMode
            ? nextSettings.desktop.lastPresentationMode
            : 'companion'
        })
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
  }, [applyStatus])

  useEffect(() => {
    const unsubscribeHermes = window.yachiyo.onHermesStatus((hermes) => {
      latestHermesStatus.current = hermes
      setStatus((current) => (current ? { ...current, connection: hermes.state, hermes } : current))
    })
    const unsubscribeChat = window.yachiyo.onChatEvent(applyChatEvent)
    const unsubscribeProactive = window.yachiyo.onProactiveEvent((event: ProactiveEvent) => {
      setActiveReminder(event.reminder)
      setAvatarState('reminder')
      void window.yachiyo.listReminders().then(setReminders)
    })
    const unsubscribeCommand = window.yachiyo.onAppCommand((command) => {
      if (command === 'chat') setPresentationMode('full-chat')
      else if (command === 'companion') setPresentationMode('companion')
      else if (command === 'mute') {
        stop()
        void window.yachiyo.getSettings().then(setSettings)
      } else setPanel(command)
    })
    return () => {
      unsubscribeHermes()
      unsubscribeChat()
      unsubscribeProactive()
      unsubscribeCommand()
    }
  }, [applyChatEvent, setAvatarState, setPresentationMode, stop])

  useEffect(() => {
    if (!avatarEditing) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setAvatarEditing(false)
      setAvatarPreview(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [avatarEditing])

  useEffect(() => {
    if (!status) return
    const launcherStatus: LauncherStatus =
      speaking || avatar.current === 'speaking'
        ? 'speaking'
        : avatar.current === 'listening'
          ? 'listening'
          : avatar.current === 'thinking'
            ? 'thinking'
            : conversation.unreadResponse
              ? 'unread'
              : status.hermes.state === 'online' || status.hermes.state === 'mock'
                ? 'online'
                : 'offline'
    void window.yachiyo.setLauncherStatus(launcherStatus).catch(() => undefined)
  }, [avatar, conversation.unreadResponse, speaking, status])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3_200)
    return () => clearTimeout(timer)
  }, [notice])

  const sendMessage = useCallback(
    (text: string): void => {
      const current = conversationRef.current
      const value = text.trim()
      if (!value || current.currentRequest) return
      const requestId = crypto.randomUUID()
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: value,
        createdAt: new Date().toISOString()
      }
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString()
      }
      const nextMessages = [...current.messages, userMessage]
      dispatchConversation({
        type: 'start',
        requestId,
        userMessage,
        assistantMessage
      })
      setAvatarState('thinking')
      void window.yachiyo
        .startChat({
          requestId,
          messages: nextMessages
            .filter(({ content }) => content.trim())
            .map(({ role, content }) => ({ role, content }))
        })
        .then((result) => {
          if (!result.ok) {
            setNotice(result.message)
            dispatchConversation({ type: 'start-failed', requestId })
          }
        })
        .catch(() => {
          setNotice('Permintaan chat tidak dapat dimulai.')
          setAvatarState('error')
          dispatchConversation({ type: 'start-failed', requestId })
        })
    },
    [setAvatarState]
  )

  const retryLastMessage = useCallback((): void => {
    const current = conversationRef.current
    if (current.currentRequest || !current.lastUserText) return
    const userIndex = lastUserMessageIndex(current.messages)
    if (userIndex < 0) return
    const requestId = crypto.randomUUID()
    const existingAssistant = current.lastAssistantId
      ? current.messages.find((message) => message.id === current.lastAssistantId)
      : null
    const assistantMessage: ChatMessage = {
      id: existingAssistant?.id ?? current.lastAssistantId ?? crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: existingAssistant?.createdAt ?? new Date().toISOString()
    }
    const requestMessages = current.messages.slice(0, userIndex + 1)
    dispatchConversation({ type: 'retry-start', requestId, assistantMessage })
    setAvatarState('thinking')
    void window.yachiyo
      .startChat({
        requestId,
        messages: requestMessages
          .filter(({ content }) => content.trim())
          .map(({ role, content }) => ({ role, content }))
      })
      .then((result) => {
        if (!result.ok) {
          setNotice(result.message)
          dispatchConversation({ type: 'start-failed', requestId })
        }
      })
      .catch(() => {
        setNotice('Permintaan retry tidak dapat dimulai.')
        setAvatarState('error')
        dispatchConversation({ type: 'start-failed', requestId })
      })
  }, [setAvatarState])

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
  const persistedAvatarTransform = avatarTransformFromSettings(settings)
  const activeAvatarTransform = clampAvatarTransform(avatarPreview ?? persistedAvatarTransform)
  const activeAssistant = conversation.activeAssistantId
    ? (conversation.messages.find((message) => message.id === conversation.activeAssistantId) ??
      null)
    : latestAssistantMessage(conversation.messages)
  const bubbleMessage =
    activeAssistant?.id === WELCOME_MESSAGE.id || !activeAssistant?.content.trim()
      ? null
      : activeAssistant
  const stopConversation = (): void => {
    if (conversation.currentRequest) void window.yachiyo.cancelChat(conversation.currentRequest)
    stop()
  }
  const showPttNotice = (): void =>
    setNotice(
      settings.privacy.microphoneEnabled
        ? 'Hermes STT belum terhubung; gunakan input teks untuk build ini.'
        : 'Aktifkan izin mikrofon di Pengaturan → Privasi.'
    )
  const saveAvatarTransform = async (): Promise<void> => {
    try {
      const next = await window.yachiyo.updateSettings({
        settings: {
          ...toAppSettings(settings),
          desktop: { ...settings.desktop, ...activeAvatarTransform }
        }
      })
      setSettings(next)
      setAvatarPreview(null)
      setAvatarEditing(false)
    } catch {
      setNotice('Transform avatar belum dapat disimpan.')
    }
  }

  return (
    <div
      className="app-shell"
      data-panel-open={panel !== null}
      data-avatar-state={avatar.current}
      data-presentation={conversation.presentationMode}
      data-avatar-editing={avatarEditing}
    >
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
            onClick={() => void window.yachiyo.minimizeWindow()}
            aria-label="Minimalkan Yachiyo"
          >
            <Minus size={17} aria-hidden="true" />
          </button>
          <button
            className="icon-button no-drag"
            type="button"
            onClick={() => void window.yachiyo.closeWindow()}
            aria-label="Tutup Yachiyo"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main
        ref={avatarStageRef}
        className="avatar-stage"
        aria-hidden={conversation.presentationMode === 'full-chat'}
      >
        <div className="ambient-grid" aria-hidden="true" />
        <div className="state-copy">
          <span>{stateLabel.eyebrow}</span>
          <strong>{stateLabel.title}</strong>
        </div>
        <AvatarTransformLayer
          transform={activeAvatarTransform}
          variant={useLive2D ? 'live2d' : 'fallback'}
          editing={avatarEditing}
          onTransformChange={setAvatarPreview}
          onBoundsChange={setAvatarBounds}
        >
          {useLive2D ? (
            <Live2DAvatar
              key={assets.scannedAt}
              ref={live2dRef}
              state={avatar.current}
              lipSync={avatar.lipSync}
              scale={activeAvatarTransform.scale}
              interactionEnabled={!avatarEditing}
              onActivate={() => setPresentationMode('full-chat')}
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
              scale={activeAvatarTransform.scale}
              interactionEnabled={!avatarEditing}
              onActivate={() => setPresentationMode('full-chat')}
            />
          )}
        </AvatarTransformLayer>
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
          {!activeAvatarTransform.avatarPositionLocked && !avatarEditing ? (
            <button
              className="avatar-edit-shortcut no-drag"
              type="button"
              onClick={() => setAvatarEditing(true)}
            >
              <Move size={12} aria-hidden="true" /> Atur posisi
            </button>
          ) : null}
        </div>
      </main>

      {conversation.presentationMode === 'companion' ? (
        <ResponseBubble
          message={bubbleMessage}
          avatarBounds={avatarBounds}
          availableBottom={bubbleBottom}
          streaming={Boolean(
            conversation.currentRequest && bubbleMessage?.id === conversation.activeAssistantId
          )}
          onOpenConversation={() => setPresentationMode('full-chat')}
        />
      ) : null}

      {activeReminder && conversation.presentationMode === 'companion' ? (
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

      {conversation.presentationMode === 'companion' ? (
        <CompanionComposer
          ref={companionComposerRef}
          draft={conversation.draft}
          busy={Boolean(conversation.currentRequest)}
          microphoneEnabled={settings.privacy.microphoneEnabled}
          state={avatar.current}
          speaking={speaking}
          onDraftChange={(value) => dispatchConversation({ type: 'draft', value })}
          onSend={() => sendMessage(conversation.draft)}
          onStop={stopConversation}
          onPtt={showPttNotice}
          onOpenFullChat={() => setPresentationMode('full-chat')}
        />
      ) : null}

      {conversation.presentationMode === 'companion' ? (
        <nav className="companion-dock no-drag" aria-label="Kontrol utama">
          <DockButton active={false} label="Chat" onClick={() => setPresentationMode('full-chat')}>
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
          <DockButton
            active={panel === 'settings'}
            label="Atur"
            onClick={() => setPanel('settings')}
          >
            <Settings aria-hidden="true" />
          </DockButton>
        </nav>
      ) : null}

      {conversation.presentationMode === 'companion' ? (
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
      ) : null}

      {conversation.presentationMode === 'full-chat' ? (
        <ChatPanel
          ref={fullChatComposerRef}
          messages={conversation.messages}
          draft={conversation.draft}
          busy={Boolean(conversation.currentRequest)}
          error={conversation.error}
          lastUserText={conversation.lastUserText}
          microphoneEnabled={settings.privacy.microphoneEnabled}
          onBack={() => setPresentationMode('companion')}
          onDraftChange={(value) => dispatchConversation({ type: 'draft', value })}
          onSend={sendMessage}
          onStop={stopConversation}
          onRetry={retryLastMessage}
          onClear={() => dispatchConversation({ type: 'clear' })}
          onPtt={showPttNotice}
        />
      ) : null}

      {avatarEditing ? (
        <div className="avatar-edit-banner no-drag" role="status">
          <Move size={16} aria-hidden="true" />
          <span>
            <strong>Mode edit posisi</strong> Seret avatar · Esc untuk batal
          </span>
          <button type="button" onClick={() => void saveAvatarTransform()}>
            <Check size={14} aria-hidden="true" /> Selesai
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              setAvatarEditing(false)
              setAvatarPreview(null)
            }}
            aria-label="Batalkan edit posisi avatar"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
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
          hermes={status.hermes}
          onClose={() => {
            setAvatarPreview(null)
            setPanel(null)
          }}
          onSave={async (view, apiKey) => {
            const plainSettings = toAppSettings(view)
            const next = await window.yachiyo.updateSettings({
              settings: plainSettings,
              ...(apiKey ? { apiKey } : {})
            })
            setSettings(next)
            setAvatarPreview(null)
            dispatchConversation({
              type: 'configure',
              activeConversationId: next.connection.sessionId || 'desktop',
              presentationMode: conversation.presentationMode
            })
            applyStatus(await window.yachiyo.getAppStatus())
            return next
          }}
          onTestConnection={async (payload) => {
            const result = await window.yachiyo.testConnection(payload)
            applyStatus(await window.yachiyo.getAppStatus())
            return result
          }}
          onReset={async () => {
            const next = await window.yachiyo.resetSettings()
            setSettings(next)
            setAvatarPreview(null)
            applyStatus(await window.yachiyo.getAppStatus())
            return next
          }}
          onChooseAsset={(request) => window.yachiyo.chooseAssetSource(request)}
          onApplyAsset={async (token) => {
            const result = await window.yachiyo.applyAssetSelection(token)
            setSettings(result.settings)
            applyStatus(await window.yachiyo.getAppStatus())
            return result
          }}
          onRescan={async () => {
            const assets = await window.yachiyo.scanAssets()
            applyStatus(await window.yachiyo.getAppStatus())
            return assets
          }}
          onVoiceTest={async (view, mode) => {
            await speak('Halo, ini perbandingan suara Yachiyo dalam bahasa Indonesia.', {
              ...view.voice,
              mode,
              rvc: { ...view.voice.rvc, f0Method: 'rmvpe' }
            })
            await refreshVoice()
          }}
          onVoiceRuntimeSetup={async () => {
            const voice = await window.yachiyo.setupVoiceRuntime()
            setStatus((current) => (current ? { ...current, voice } : current))
            return voice
          }}
          onVoiceRefresh={refreshVoice}
          onAvatarTransformPreview={(transform) =>
            setAvatarPreview(clampAvatarTransform(transform))
          }
          onAvatarEdit={(transform) => {
            const next = clampAvatarTransform(transform)
            if (next.avatarPositionLocked) return
            setAvatarPreview(next)
            setAvatarEditing(true)
            setPanel(null)
          }}
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

function avatarTransformFromSettings(settings: SettingsView): AvatarTransform {
  return clampAvatarTransform({
    scale: settings.desktop.scale,
    positionX: settings.desktop.positionX,
    positionY: settings.desktop.positionY,
    avatarAnchor: settings.desktop.avatarAnchor,
    avatarPositionLocked: settings.desktop.avatarPositionLocked
  })
}

function lastUserMessageIndex(messages: ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index
  }
  return -1
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
