import { useState } from 'react'

import type { AvatarState } from '@shared/types'

type Props = {
  state: AvatarState
  lipSync: number
  scale: number
  onActivate: () => void
  interactionEnabled?: boolean
}

export function FallbackAvatar({
  state,
  lipSync,
  scale,
  onActivate,
  interactionEnabled = true
}: Props): React.JSX.Element {
  const [look, setLook] = useState<'left' | 'center' | 'right'>('center')
  const mouth = Math.min(4, Math.round(lipSync * 4))
  const scaleStep = scale < 0.85 ? 'small' : scale > 1.15 ? 'large' : 'normal'

  return (
    <button
      className="fallback-avatar no-drag"
      type="button"
      data-state={state}
      data-mouth={mouth}
      data-look={look}
      data-scale={scaleStep}
      style={{ '--fallback-avatar-scale': scale } as React.CSSProperties}
      aria-label={
        interactionEnabled ? 'Buka chat dengan Yachiyo' : 'Avatar Yachiyo sedang diatur posisinya'
      }
      onClick={() => {
        if (interactionEnabled) onActivate()
      }}
      onPointerMove={(event) => {
        if (!interactionEnabled) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const ratio = (event.clientX - bounds.left) / bounds.width
        setLook(ratio < 0.4 ? 'left' : ratio > 0.6 ? 'right' : 'center')
      }}
      onPointerLeave={() => {
        if (interactionEnabled) setLook('center')
      }}
    >
      <span className="avatar-aura" aria-hidden="true" />
      <svg
        className="avatar-figure"
        viewBox="0 0 260 330"
        role="img"
        aria-label="Avatar fallback Yachiyo"
      >
        <defs>
          <linearGradient id="hood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#243a59" />
            <stop offset="1" stopColor="#101a30" />
          </linearGradient>
          <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#effffb" />
            <stop offset="1" stopColor="#b7eadf" />
          </linearGradient>
        </defs>
        <g className="avatar-body">
          <path className="hood-tail" d="M66 262c-28 20-37 50-15 59 17 7 39-15 48-39z" />
          <path
            className="hood-body"
            d="M72 169c11-33 36-52 58-52s47 19 58 52l27 114c-25 24-145 24-170 0z"
          />
          <path className="hood-ear hood-ear-left" d="M78 125 91 58l45 66z" />
          <path className="hood-ear hood-ear-right" d="m182 125-13-67-45 66z" />
          <path
            className="face"
            d="M75 142c0-44 24-77 55-77s55 33 55 77c0 49-23 83-55 83s-55-34-55-83z"
          />
          <path
            className="face-mark"
            d="M85 112c14-23 76-23 90 0-17-8-27-4-45 11-18-15-28-19-45-11z"
          />
          <g className="eyes">
            <ellipse className="eye eye-left" cx="108" cy="147" rx="8" ry="11" />
            <ellipse className="eye eye-right" cx="152" cy="147" rx="8" ry="11" />
            <circle className="eye-shine" cx="105" cy="143" r="2.4" />
            <circle className="eye-shine" cx="149" cy="143" r="2.4" />
          </g>
          <path className="brow brow-left" d="M96 126c8-6 16-6 23-1" />
          <path className="brow brow-right" d="M141 125c7-5 15-5 23 1" />
          <path className="mouth mouth-0" d="M120 179c7 6 13 6 20 0" />
          <ellipse className="mouth mouth-open" cx="130" cy="183" rx="10" ry="3" />
          <path
            className="chest-star"
            d="m130 245 7 14 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z"
          />
          <path className="mantle-line" d="M82 224c29 24 67 24 96 0" />
        </g>
      </svg>
      <span className="avatar-spark spark-one" aria-hidden="true" />
      <span className="avatar-spark spark-two" aria-hidden="true" />
      <span className="avatar-spark spark-three" aria-hidden="true" />
    </button>
  )
}
