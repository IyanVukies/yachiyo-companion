import { describe, expect, it } from 'vitest'

import {
  conversationReducer,
  createConversationState,
  latestAssistantMessage
} from '../../src/renderer/src/state/conversation-store'

const userMessage = {
  id: '10000000-0000-4000-8000-000000000001',
  role: 'user' as const,
  content: 'Halo Hermes',
  createdAt: '2026-07-18T00:00:00.000Z'
}
const assistantMessage = {
  id: '20000000-0000-4000-8000-000000000001',
  role: 'assistant' as const,
  content: '',
  createdAt: '2026-07-18T00:00:01.000Z'
}

describe('shared conversation store', () => {
  it('keeps one message array and active stream while switching presentation modes', () => {
    let state = conversationReducer(createConversationState(), {
      type: 'start',
      requestId: '30000000-0000-4000-8000-000000000001',
      userMessage,
      assistantMessage
    })
    state = conversationReducer(state, {
      type: 'delta',
      requestId: '30000000-0000-4000-8000-000000000001',
      text: 'Respons sedang '
    })
    const messages = state.messages
    const request = state.currentRequest
    const streaming = state.streamingResponse

    const fullChat = conversationReducer(state, { type: 'presentation', mode: 'full-chat' })

    expect(fullChat.messages).toBe(messages)
    expect(fullChat.currentRequest).toBe(request)
    expect(fullChat.streamingResponse).toBe(streaming)
    expect(latestAssistantMessage(fullChat.messages)?.content).toBe('Respons sedang ')
  })

  it('exposes the same final response to full chat and the companion bubble', () => {
    let state = conversationReducer(createConversationState(), {
      type: 'start',
      requestId: '30000000-0000-4000-8000-000000000001',
      userMessage,
      assistantMessage
    })
    state = conversationReducer(state, {
      type: 'done',
      requestId: '30000000-0000-4000-8000-000000000001',
      text: 'Jawaban bersama'
    })

    const bubbleMessage = latestAssistantMessage(state.messages)
    const fullChatMessage = state.messages.find((message) => message.id === assistantMessage.id)
    expect(bubbleMessage).toBe(fullChatMessage)
    expect(state.unreadResponse).toBe(true)
  })

  it('retries by clearing the same assistant message without duplicating the user', () => {
    let state = conversationReducer(createConversationState(), {
      type: 'start',
      requestId: '30000000-0000-4000-8000-000000000001',
      userMessage,
      assistantMessage
    })
    state = conversationReducer(state, {
      type: 'done',
      requestId: '30000000-0000-4000-8000-000000000001',
      text: 'Jawaban pertama'
    })
    state = conversationReducer(state, {
      type: 'retry-start',
      requestId: '30000000-0000-4000-8000-000000000002',
      assistantMessage
    })

    expect(state.messages.filter((message) => message.role === 'user')).toEqual([userMessage])
    expect(state.messages.filter((message) => message.id === assistantMessage.id)).toHaveLength(1)
    expect(state.messages.find((message) => message.id === assistantMessage.id)?.content).toBe('')
    expect(state.activeAssistantId).toBe(assistantMessage.id)
    expect(state.retrying).toBe(true)
  })
})
