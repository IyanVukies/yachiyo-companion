import { CircleAlert, CloudOff, LoaderCircle, Radio, Wifi } from 'lucide-react'

import type { AppStatus } from '@shared/types'

export function StatusPill({ status }: { status: AppStatus | null }): React.JSX.Element {
  const connection = status?.connection ?? 'idle'
  const content =
    connection === 'mock'
      ? { icon: Radio, label: 'Mock lokal', tone: 'mock' }
      : connection === 'online'
        ? { icon: Wifi, label: 'Hermes online', tone: 'online' }
        : connection === 'checking' || connection === 'idle'
          ? { icon: LoaderCircle, label: 'Menghubungkan Hermes', tone: 'checking' }
          : connection === 'authentication-error'
            ? { icon: CircleAlert, label: 'Key ditolak', tone: 'error' }
            : connection === 'timeout'
              ? { icon: CloudOff, label: 'Hermes timeout', tone: 'offline' }
              : connection === 'server-error'
                ? { icon: CircleAlert, label: 'Server Hermes error', tone: 'error' }
                : connection === 'response-error'
                  ? { icon: CircleAlert, label: 'Respons Hermes error', tone: 'error' }
                  : { icon: CloudOff, label: 'Hermes offline', tone: 'offline' }
  const Icon = content.icon
  return (
    <span
      className="status-pill no-drag"
      data-tone={content.tone}
      title={status?.hermes.message ?? content.label}
      aria-label={`${content.label}. ${status?.hermes.message ?? ''}`.trim()}
    >
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      {content.label}
    </span>
  )
}
