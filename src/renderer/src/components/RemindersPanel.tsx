import { useMemo, useState } from 'react'
import { BellRing, CalendarPlus, Clock3, X } from 'lucide-react'

import type { Reminder } from '@shared/types'

type Props = {
  reminders: Reminder[]
  onClose: () => void
  onTest: () => Promise<string>
  onSchedule: (payload: {
    kind: 'custom' | 'event' | 'deadline'
    title: string
    body: string
    scheduledAt: string
  }) => Promise<string>
}

export function RemindersPanel({
  reminders,
  onClose,
  onTest,
  onSchedule
}: Props): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [when, setWhen] = useState(defaultLocalDateTime)
  const [feedback, setFeedback] = useState('')
  const upcoming = useMemo(
    () =>
      [...reminders]
        .filter((reminder) => !reminder.dismissedAt)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, 12),
    [reminders]
  )

  return (
    <section className="sheet reminder-sheet no-drag" aria-label="Pengingat lokal">
      <header className="sheet-header">
        <div>
          <span className="eyebrow">Proaktif, tetap tenang</span>
          <h2>Pengingat lokal</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Tutup pengingat"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="reminder-scroll">
        <button
          className="test-reminder"
          type="button"
          onClick={() => void onTest().then(setFeedback)}
        >
          <BellRing size={18} aria-hidden="true" />
          <span>
            <strong>Kirim notifikasi tes</strong>
            <small>Quiet hours dan batas harian tetap dihormati.</small>
          </span>
        </button>

        <form
          className="reminder-form"
          onSubmit={(event) => {
            event.preventDefault()
            const date = new Date(when)
            if (!title.trim() || !body.trim() || Number.isNaN(date.getTime())) return
            void onSchedule({
              kind: 'custom',
              title: title.trim(),
              body: body.trim(),
              scheduledAt: date.toISOString()
            }).then((message) => {
              setFeedback(message)
              setTitle('')
              setBody('')
            })
          }}
        >
          <h3>
            <CalendarPlus size={16} aria-hidden="true" /> Tambah pengingat
          </h3>
          <label>
            <span>Judul</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
            />
          </label>
          <label>
            <span>Isi</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={500}
              rows={2}
            />
          </label>
          <label>
            <span>Waktu</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!title.trim() || !body.trim()}>
            Simpan
          </button>
        </form>

        {feedback ? (
          <p className="inline-feedback" role="status">
            {feedback}
          </p>
        ) : null}

        <section className="reminder-list-section">
          <h3>
            <Clock3 size={16} aria-hidden="true" /> Tersimpan
          </h3>
          {upcoming.length ? (
            <div className="reminder-list">
              {upcoming.map((reminder) => (
                <article key={reminder.id}>
                  <span>{reminder.title}</span>
                  <p>{reminder.body}</p>
                  <time dateTime={reminder.scheduledAt}>
                    {new Intl.DateTimeFormat('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Jakarta'
                    }).format(new Date(reminder.scheduledAt))}
                  </time>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              Belum ada pengingat. Kalender dan email tidak disimulasikan.
            </p>
          )}
        </section>
      </div>
    </section>
  )
}

function defaultLocalDateTime(): string {
  const date = new Date(Date.now() + 60 * 60_000)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
