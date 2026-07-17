// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusPill } from '../../src/renderer/src/components/StatusPill'
import type { AppStatus, HermesConnectionStatus } from '../../src/shared/types'

describe('Hermes status badge', () => {
  it('renders Hermes online immediately from the synchronized connection state', () => {
    const status = appStatus({
      state: 'online',
      message: 'Hermes online dan chat runtime aktif.'
    })

    render(<StatusPill status={status} />)

    expect(screen.getByText('Hermes online')).toBeVisible()
    expect(screen.getByLabelText(/Hermes online dan chat runtime aktif/)).toBeVisible()
  })

  it('renders the safe offline reason without exposing credentials', () => {
    const status = appStatus({
      state: 'offline',
      message: 'Connection refused. Kemungkinan SSH tunnel tidak aktif.'
    })

    render(<StatusPill status={status} />)

    expect(screen.getByText('Hermes offline')).toBeVisible()
    expect(screen.getByTitle(/SSH tunnel tidak aktif/)).toBeVisible()
  })
})

function appStatus(value: Pick<HermesConnectionStatus, 'state' | 'message'>): AppStatus {
  const hermes: HermesConnectionStatus = {
    ...value,
    diagnostics: {
      mode: 'hermes',
      phase: 'models',
      normalizedBaseUrl: 'http://127.0.0.1:20129/v1',
      modelsEndpoint: 'http://127.0.0.1:20129/v1/models',
      chatEndpoint: 'http://127.0.0.1:20129/v1/chat/completions',
      activeEndpoint: 'http://127.0.0.1:20129/v1/models',
      selectedModel: 'hermes-agent',
      httpStatus: value.state === 'online' ? 200 : null,
      errorCategory: value.state === 'online' ? 'none' : 'connection',
      timeoutMs: 30_000,
      responseSummary: null,
      checkedAt: '2026-07-17T10:00:00.000Z'
    }
  }
  return {
    version: '0.2.1-test',
    connection: hermes.state,
    hermes,
    mockServerReady: true,
    trayReady: true,
    clickThrough: false,
    alwaysOnTop: true,
    autoStart: false,
    voice: {} as AppStatus['voice'],
    assets: {} as AppStatus['assets'],
    recoveryShortcut: 'Ctrl+Shift+F12'
  }
}
