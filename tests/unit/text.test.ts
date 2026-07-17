import { describe, expect, it } from 'vitest'

import { redactSecrets, splitSentenceChunks } from '../../src/shared/text'

describe('text utilities', () => {
  it('splits speech at sentence boundaries and keeps every word', () => {
    const chunks = splitSentenceChunks('Halo dunia. Apa kabar? Baik… Terima kasih!', 30)

    expect(chunks).toEqual(['Halo dunia.', 'Apa kabar?', 'Baik…', 'Terima kasih!'])
  })

  it('hard-splits an oversized sentence without exceeding the limit', () => {
    const chunks = splitSentenceChunks('satu dua tiga empat lima enam tujuh delapan', 16)

    expect(chunks.every((chunk) => chunk.length <= 16)).toBe(true)
    expect(chunks.join(' ')).toBe('satu dua tiga empat lima enam tujuh delapan')
  })

  it('redacts bearer tokens and common secret fields', () => {
    const input = 'Authorization: Bearer super-secret api_key="abc123" password=hunter2 token: xyz'
    const output = redactSecrets(input)

    expect(output).not.toContain('super-secret')
    expect(output).not.toContain('abc123')
    expect(output).not.toContain('hunter2')
    expect(output).not.toContain('xyz')
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(4)
  })
})
