import type { ChatMessage, NormalizedError, PresentationMode } from '@shared/types'

export const WELCOME_MESSAGE: ChatMessage = {
  id: '00000000-0000-4000-8000-000000000001',
  role: 'assistant',
  content: 'Halo. Aku siap menemanimu. Status di atas menunjukkan koneksi yang sedang digunakan.',
  createdAt: new Date(0).toISOString()
}

export type ConversationState = {
  activeConversationId: string
  messages: ChatMessage[]
  streamingResponse: string
  draft: string
  currentRequest: string | null
  activeAssistantId: string | null
  lastAssistantId: string | null
  error: NormalizedError | null
  lastUserText: string
  retrying: boolean
  unreadResponse: boolean
  presentationMode: PresentationMode
}

export type ConversationAction =
  | { type: 'draft'; value: string }
  | { type: 'configure'; activeConversationId: string; presentationMode: PresentationMode }
  | { type: 'presentation'; mode: PresentationMode }
  | {
      type: 'start'
      requestId: string
      userMessage: ChatMessage
      assistantMessage: ChatMessage
      retrying?: boolean
    }
  | { type: 'retry-start'; requestId: string; assistantMessage: ChatMessage }
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'done'; requestId: string; text: string }
  | { type: 'error'; requestId: string; error: NormalizedError; partialText: string }
  | { type: 'cancelled'; requestId: string; partialText: string }
  | { type: 'start-failed'; requestId: string }
  | { type: 'clear' }
  | { type: 'mark-read' }

export function createConversationState(
  presentationMode: PresentationMode = 'companion',
  activeConversationId = 'desktop'
): ConversationState {
  return {
    activeConversationId,
    messages: [WELCOME_MESSAGE],
    streamingResponse: '',
    draft: '',
    currentRequest: null,
    activeAssistantId: null,
    lastAssistantId: null,
    error: null,
    lastUserText: '',
    retrying: false,
    unreadResponse: false,
    presentationMode
  }
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case 'draft':
      return { ...state, draft: action.value }
    case 'configure':
      return {
        ...state,
        activeConversationId: action.activeConversationId || state.activeConversationId,
        presentationMode: action.presentationMode
      }
    case 'presentation':
      return {
        ...state,
        presentationMode: action.mode,
        unreadResponse: action.mode === 'full-chat' ? false : state.unreadResponse
      }
    case 'start':
      return {
        ...state,
        messages: [...state.messages, action.userMessage, action.assistantMessage],
        streamingResponse: '',
        draft: '',
        currentRequest: action.requestId,
        activeAssistantId: action.assistantMessage.id,
        lastAssistantId: action.assistantMessage.id,
        error: null,
        lastUserText: action.userMessage.content,
        retrying: action.retrying ?? false,
        unreadResponse: false
      }
    case 'retry-start': {
      const assistantExists = state.messages.some(
        (message) => message.id === action.assistantMessage.id
      )
      return {
        ...state,
        messages: assistantExists
          ? replaceAssistant(state.messages, action.assistantMessage.id, '')
          : [...state.messages, action.assistantMessage],
        streamingResponse: '',
        currentRequest: action.requestId,
        activeAssistantId: action.assistantMessage.id,
        lastAssistantId: action.assistantMessage.id,
        error: null,
        retrying: true,
        unreadResponse: false
      }
    }
    case 'delta': {
      if (action.requestId !== state.currentRequest || !state.activeAssistantId) return state
      const streamingResponse = state.streamingResponse + action.text
      return {
        ...state,
        streamingResponse,
        messages: replaceAssistant(state.messages, state.activeAssistantId, streamingResponse)
      }
    }
    case 'done':
      if (action.requestId !== state.currentRequest) return state
      return {
        ...state,
        messages: state.activeAssistantId
          ? replaceAssistant(state.messages, state.activeAssistantId, action.text)
          : state.messages,
        streamingResponse: action.text,
        currentRequest: null,
        activeAssistantId: null,
        error: null,
        retrying: false,
        unreadResponse: state.presentationMode !== 'full-chat'
      }
    case 'error':
      if (action.requestId !== state.currentRequest) return state
      return finishPartial(state, action.partialText, action.error)
    case 'cancelled':
      if (action.requestId !== state.currentRequest) return state
      return finishPartial(state, action.partialText, null)
    case 'start-failed':
      if (action.requestId !== state.currentRequest) return state
      return {
        ...state,
        messages: state.activeAssistantId
          ? state.messages.filter((message) => message.id !== state.activeAssistantId)
          : state.messages,
        streamingResponse: '',
        currentRequest: null,
        activeAssistantId: null,
        retrying: false
      }
    case 'clear':
      return {
        ...createConversationState(state.presentationMode, state.activeConversationId),
        draft: state.draft
      }
    case 'mark-read':
      return { ...state, unreadResponse: false }
  }
}

export function latestAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  return (
    [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.content.trim()) ?? null
  )
}

function finishPartial(
  state: ConversationState,
  partialText: string,
  error: NormalizedError | null
): ConversationState {
  const messages = state.activeAssistantId
    ? partialText
      ? replaceAssistant(state.messages, state.activeAssistantId, partialText)
      : state.messages.filter((message) => message.id !== state.activeAssistantId)
    : state.messages
  return {
    ...state,
    messages,
    streamingResponse: partialText,
    currentRequest: null,
    activeAssistantId: null,
    error,
    retrying: false
  }
}

function replaceAssistant(
  messages: ChatMessage[],
  assistantId: string,
  content: string
): ChatMessage[] {
  return messages.map((message) => (message.id === assistantId ? { ...message, content } : message))
}
