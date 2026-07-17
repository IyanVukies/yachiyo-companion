import { useState } from 'react'
import { ArrowRight, Check, Radio, ShieldCheck, Sparkles, Volume2 } from 'lucide-react'

import type { AssetStatus, SettingsView } from '@shared/types'

type Props = {
  settings: SettingsView
  assets: AssetStatus
  onComplete: () => Promise<void>
}

export function Onboarding({ settings, assets, onComplete }: Props): React.JSX.Element {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  return (
    <div className="onboarding-backdrop no-drag">
      <section className="onboarding" aria-labelledby="onboarding-title">
        <div className="onboarding-progress" aria-label={`Langkah ${String(step + 1)} dari 3`}>
          {[0, 1, 2].map((item) => (
            <span key={item} data-active={item <= step} />
          ))}
        </div>

        {step === 0 ? (
          <div className="onboarding-page">
            <span className="onboarding-icon">
              <Sparkles aria-hidden="true" />
            </span>
            <span className="eyebrow">Selamat datang</span>
            <h1 id="onboarding-title">
              Teman desktop yang tetap tenang saat layanan lain offline.
            </h1>
            <p>
              Yachiyo dapat berjalan dengan avatar fallback dan Hermes mock. Kamu tidak perlu API
              key untuk mulai mencoba.
            </p>
            <ul>
              <li>
                <Check size={15} aria-hidden="true" /> Tidak perlu terminal
              </li>
              <li>
                <Check size={15} aria-hidden="true" /> Secret dimasukkan hanya di aplikasi
              </li>
              <li>
                <Check size={15} aria-hidden="true" /> Ctrl+Shift+F12 selalu memulihkan klik
              </li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="onboarding-page">
            <span className="onboarding-icon">
              <ShieldCheck aria-hidden="true" />
            </span>
            <span className="eyebrow">Pemeriksaan lokal</span>
            <h1 id="onboarding-title">
              {assets.live2d.sourceKind === 'none' && assets.voice.sourceKind === 'none'
                ? 'Aset eksternal belum dipilih.'
                : 'Asetmu diperiksa tanpa menebak isinya.'}
            </h1>
            <div className="onboarding-status-list">
              <div data-ready={assets.live2d.expressions.length === 8}>
                <span>Mao runtime</span>
                <strong>
                  {assets.live2d.expressions.length} ekspresi · {assets.live2d.motions.length}{' '}
                  motion
                </strong>
              </div>
              <div data-ready={assets.live2d.hasCore}>
                <span>Cubism Core</span>
                <strong>
                  {assets.live2d.hasCore
                    ? 'Siap'
                    : 'Perlu dipasang setelah menerima lisensi Live2D'}
                </strong>
              </div>
              <div data-ready={assets.voice.checkpoint !== null}>
                <span>Kobo RVC</span>
                <strong>
                  {assets.voice.checkpoint ? 'Model v2 48k terdeteksi' : 'Belum ditemukan'}
                </strong>
              </div>
            </div>
            <p className="onboarding-note">
              Fallback avatar dan Basic TTS tetap dapat dipakai walaupun runtime berat belum
              lengkap.
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="onboarding-page">
            <span className="onboarding-icon">
              <Radio aria-hidden="true" />
            </span>
            <span className="eyebrow">Siap digunakan</span>
            <h1 id="onboarding-title">Mulai aman dengan mock lokal.</h1>
            <div className="ready-lines">
              <div>
                <Radio size={18} aria-hidden="true" />
                <span>
                  <strong>Hermes mock</strong> Streaming tanpa key
                </span>
              </div>
              <div>
                <Volume2 size={18} aria-hidden="true" />
                <span>
                  <strong>{settings.voice.mode === 'disabled' ? 'Suara mati' : 'Basic TTS'}</strong>{' '}
                  RVC fallback otomatis
                </span>
              </div>
              <div>
                <ShieldCheck size={18} aria-hidden="true" />
                <span>
                  <strong>Privasi</strong> Mikrofon mati sampai diizinkan
                </span>
              </div>
            </div>
            <p>
              Hermes VPS dapat ditambahkan kapan saja dari Pengaturan. API key tidak pernah perlu
              dikirim lewat chat.
            </p>
          </div>
        ) : null}

        <footer className="onboarding-actions">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((value) => value - 1)}>
              Kembali
            </button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => setStep((value) => value + 1)}
            >
              Lanjut <ArrowRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void onComplete().finally(() => setBusy(false))
              }}
            >
              Buka Yachiyo <Sparkles size={15} aria-hidden="true" />
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
