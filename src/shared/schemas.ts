import { z } from 'zod'

export const avatarStateSchema = z.enum([
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
])

export const connectionModeSchema = z.enum(['mock', 'hermes'])
export const voiceModeSchema = z.enum(['rvc', 'basic', 'disabled'])
export const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug'])

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const localPathSchema = z.string().trim().max(1024)

export const rvcSettingsSchema = z
  .object({
    pitch: z.number().int().min(-24).max(24),
    indexRate: z.number().min(0).max(1),
    protect: z.number().min(0).max(0.5),
    f0Method: z.enum(['rmvpe', 'harvest', 'crepe', 'pm']),
    device: z.enum(['auto', 'cpu', 'cuda']),
    checkpointPath: localPathSchema,
    indexPath: localPathSchema
  })
  .strict()

export const settingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    onboardingComplete: z.boolean(),
    connection: z
      .object({
        mode: connectionModeSchema,
        baseUrl: z.string().trim().max(2048),
        model: z.string().trim().min(1).max(160),
        timeoutMs: z.number().int().min(5_000).max(120_000),
        streaming: z.boolean(),
        retryCount: z.number().int().min(0).max(3),
        sessionId: z.string().trim().max(160)
      })
      .strict(),
    voice: z
      .object({
        mode: voiceModeSchema,
        ttsVoice: z.string().trim().min(1).max(160),
        speed: z.number().min(0.5).max(2),
        pitch: z.number().min(-50).max(50),
        volume: z.number().min(0).max(1),
        rvc: rvcSettingsSchema
      })
      .strict(),
    proactive: z
      .object({
        enabled: z.boolean(),
        timezone: z.literal('Asia/Jakarta'),
        quietStart: timeSchema,
        quietEnd: timeSchema,
        dailyLimit: z.number().int().min(0).max(20),
        minimumGapMinutes: z.number().int().min(5).max(1_440),
        morningGreeting: z.boolean(),
        eveningReview: z.boolean(),
        inactivityCheckIn: z.boolean()
      })
      .strict(),
    desktop: z
      .object({
        alwaysOnTop: z.boolean(),
        clickThrough: z.boolean(),
        autoStart: z.boolean(),
        scale: z.number().min(0.65).max(1.5),
        windowBounds: z
          .object({
            x: z.number().int(),
            y: z.number().int(),
            width: z.number().int().min(360).max(900),
            height: z.number().int().min(560).max(1_200)
          })
          .strict()
          .nullable()
      })
      .strict(),
    assets: z
      .object({
        live2dRoot: localPathSchema,
        voiceRoot: localPathSchema,
        cubismCorePath: localPathSchema
      })
      .strict(),
    privacy: z
      .object({
        saveConversation: z.boolean(),
        microphoneEnabled: z.boolean()
      })
      .strict(),
    logging: z
      .object({
        level: logLevelSchema
      })
      .strict()
  })
  .strict()

export type Settings = z.infer<typeof settingsSchema>

export const defaultSettings: Settings = {
  schemaVersion: 1,
  onboardingComplete: false,
  connection: {
    mode: 'mock',
    baseUrl: '',
    model: 'yachiyo-mock',
    timeoutMs: 30_000,
    streaming: true,
    retryCount: 1,
    sessionId: 'desktop'
  },
  voice: {
    mode: 'basic',
    ttsVoice: 'id-ID-GadisNeural',
    speed: 1,
    pitch: 0,
    volume: 1,
    rvc: {
      pitch: 0,
      indexRate: 0.5,
      protect: 0.33,
      f0Method: 'rmvpe',
      device: 'auto',
      checkpointPath: '',
      indexPath: ''
    }
  },
  proactive: {
    enabled: true,
    timezone: 'Asia/Jakarta',
    quietStart: '23:00',
    quietEnd: '07:00',
    dailyLimit: 5,
    minimumGapMinutes: 90,
    morningGreeting: true,
    eveningReview: true,
    inactivityCheckIn: false
  },
  desktop: {
    alwaysOnTop: true,
    clickThrough: false,
    autoStart: false,
    scale: 1,
    windowBounds: null
  },
  assets: {
    live2dRoot: '',
    voiceRoot: '',
    cubismCorePath: ''
  },
  privacy: {
    saveConversation: false,
    microphoneEnabled: false
  },
  logging: {
    level: 'info'
  }
}

export const settingsUpdateSchema = z
  .object({
    settings: settingsSchema,
    apiKey: z.string().max(4096).optional(),
    clearApiKey: z.boolean().optional()
  })
  .strict()

export const chatRoleSchema = z.enum(['system', 'user', 'assistant'])

export const chatMessageSchema = z
  .object({
    id: z.uuid(),
    role: chatRoleSchema,
    content: z.string().max(100_000),
    createdAt: z.iso.datetime()
  })
  .strict()

export const chatStartSchema = z
  .object({
    requestId: z.uuid(),
    messages: z
      .array(
        z
          .object({
            role: chatRoleSchema,
            content: z.string().trim().min(1).max(20_000)
          })
          .strict()
      )
      .min(1)
      .max(100)
  })
  .strict()

export const requestIdSchema = z.uuid()

export const connectionTestSchema = z
  .object({
    mode: connectionModeSchema,
    baseUrl: z.string().trim().max(2048),
    model: z.string().trim().min(1).max(160),
    timeoutMs: z.number().int().min(5_000).max(120_000),
    apiKey: z.string().max(4096).optional()
  })
  .strict()

export const assetKindSchema = z.enum(['live2d', 'voice', 'cubism-core'])
export const assetSelectionRequestSchema = z.discriminatedUnion('source', [
  z
    .object({
      kind: z.enum(['live2d', 'voice']),
      source: z.literal('folder')
    })
    .strict(),
  z
    .object({
      kind: z.enum(['live2d', 'voice']),
      source: z.literal('zip')
    })
    .strict(),
  z
    .object({
      kind: z.literal('cubism-core'),
      source: z.literal('file')
    })
    .strict()
])
export const assetSelectionTokenSchema = z
  .object({
    token: z.uuid()
  })
  .strict()
export const booleanSchema = z.boolean()
export const reminderActionSchema = z
  .object({
    id: z.uuid(),
    action: z.enum(['snooze-10', 'snooze-60', 'dismiss'])
  })
  .strict()

export const reminderScheduleSchema = z
  .object({
    kind: z.enum(['custom', 'event', 'deadline']),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500),
    scheduledAt: z.iso.datetime()
  })
  .strict()

export const voiceRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(2_000),
    mode: voiceModeSchema,
    voice: z.string().trim().min(1).max(160),
    speed: z.number().min(0.5).max(2),
    pitch: z.number().min(-50).max(50),
    rvc: rvcSettingsSchema
  })
  .strict()
