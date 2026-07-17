import { describe, expect, it } from 'vitest'

import {
  sanitizeYachiyoVisibleText,
  YachiyoControlEnvelopeParser
} from '../../src/main/services/yachiyo-control-parser'

describe('YachiyoControlEnvelopeParser', () => {
  it('withholds split tag prefixes and exposes only visible text', () => {
    const parser = new YachiyoControlEnvelopeParser()
    const deltas = [
      parser.push('Jawaban aman.<yachi'),
      parser.push('yo_control>{"emotion":"happy","motion":"nod"}</yachiyo_'),
      parser.push('control> Lanjut.')
    ]
    const result = parser.finish()

    expect(deltas).toEqual(['Jawaban aman.', '', ' Lanjut.'])
    expect(deltas.join('')).toBe('Jawaban aman. Lanjut.')
    expect(result).toEqual({
      text: 'Jawaban aman. Lanjut.',
      metadata: { emotion: 'happy', motion: 'nod' }
    })
    expect(JSON.stringify({ deltas, result })).not.toContain('yachiyo_control')
  })

  it('drops unterminated envelopes and partial reserved markers fail-closed', () => {
    const parser = new YachiyoControlEnvelopeParser()

    expect(parser.push('Tetap terlihat.<yachiyo_control>{"emotion":"happy"}')).toBe(
      'Tetap terlihat.'
    )
    expect(parser.finish()).toEqual({ text: 'Tetap terlihat.', metadata: null })
    expect(sanitizeYachiyoVisibleText('Aman</yachiyo_')).toBe('Aman')
  })

  it('strips orphan closing tags even when split across chunks', () => {
    const parser = new YachiyoControlEnvelopeParser()

    expect(parser.push('Teks</yachiyo_')).toBe('Teks')
    expect(parser.push('control> akhir')).toBe(' akhir')
    expect(parser.finish().text).toBe('Teks akhir')
  })

  it('allowlists metadata and ignores malformed or unsupported control values', () => {
    const parser = new YachiyoControlEnvelopeParser()
    parser.push(
      '<yachiyo_control>{"emotion":"execute","motion":"wave","importance":"high","requires_response":true,"command":"run"}</yachiyo_control>Halo'
    )

    expect(parser.finish()).toEqual({
      text: 'Halo',
      metadata: { motion: 'wave', importance: 'high', requiresResponse: true }
    })
  })
})
