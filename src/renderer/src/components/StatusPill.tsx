import { CircleAlert, CloudOff, Radio, Wifi } from 'lucide-react'

import type { AppStatus } from '@shared/types'

export function StatusPill({ status }: { status: AppStatus | null }): React.JSX.Element {
  const connection = status?.connection ?? 'connecting'
  const content =
    connection === 'mock'
      ? { icon: Radio, label: 'Mock lokal', tone: 'mock' }
      : connection === 'connected'
        ? { icon: Wifi, label: 'Hermes online', tone: 'online' }
        : connection === 'auth-error'
          ? { icon: CircleAlert, label: 'Key ditolak', tone: 'error' }
          : { icon: CloudOff, label: 'Hermes offline', tone: 'offline' }
  const Icon = content.icon
  return (
    <span className="status-pill no-drag" data-tone={content.tone}>
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      {content.label}
    </span>
  )
}
