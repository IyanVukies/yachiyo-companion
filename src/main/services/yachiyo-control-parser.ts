import type { AvatarMetadata } from '../../shared/types'

const OPEN_TAG = '<yachiyo_control>'
const CLOSE_TAG = '</yachiyo_control>'
const RESERVED_TAGS = [OPEN_TAG, CLOSE_TAG] as const
const MAX_CONTROL_BODY_LENGTH = 64 * 1024

export type YachiyoControlParseResult = {
  text: string
  metadata: AvatarMetadata | null
}

/**
 * Removes Avatar Director control envelopes before model text leaves the main process.
 * Potential tag prefixes are retained between pushes so a marker split across model
 * content deltas can never be exposed as visible text.
 */
export class YachiyoControlEnvelopeParser {
  private mode: 'visible' | 'control' = 'visible'
  private pending = ''
  private controlBody = ''
  private controlBodyOverflow = false
  private visibleText = ''
  private metadata: AvatarMetadata | null = null
  private finished = false

  push(chunk: string): string {
    if (this.finished) throw new Error('Yachiyo control parser sudah diselesaikan.')
    if (!chunk) return ''

    this.pending += chunk
    let emitted = ''

    for (;;) {
      if (this.mode === 'control') {
        const closingIndex = indexOfAsciiCaseInsensitive(this.pending, CLOSE_TAG)
        if (closingIndex >= 0) {
          this.appendControlBody(this.pending.slice(0, closingIndex))
          this.pending = this.pending.slice(closingIndex + CLOSE_TAG.length)
          this.applyControlMetadata()
          this.mode = 'visible'
          continue
        }

        const retainedLength = longestReservedPrefixSuffix(this.pending, [CLOSE_TAG])
        const consumableLength = this.pending.length - retainedLength
        this.appendControlBody(this.pending.slice(0, consumableLength))
        this.pending = this.pending.slice(consumableLength)
        break
      }

      const marker = nextReservedMarker(this.pending)
      if (marker) {
        emitted += this.pending.slice(0, marker.index)
        this.pending = this.pending.slice(marker.index + marker.tag.length)
        if (marker.tag === OPEN_TAG) {
          this.mode = 'control'
          this.controlBody = ''
          this.controlBodyOverflow = false
        }
        // An orphan closing tag is reserved protocol syntax too, so it is discarded.
        continue
      }

      const retainedLength = longestReservedPrefixSuffix(this.pending, RESERVED_TAGS)
      const consumableLength = this.pending.length - retainedLength
      emitted += this.pending.slice(0, consumableLength)
      this.pending = this.pending.slice(consumableLength)
      break
    }

    this.visibleText += emitted
    return emitted
  }

  finish(): YachiyoControlParseResult {
    if (!this.finished) {
      // `pending` is either an incomplete reserved marker or content inside an
      // unterminated envelope. Both are dropped fail-closed.
      this.pending = ''
      this.controlBody = ''
      this.controlBodyOverflow = false
      this.finished = true
    }
    return { text: this.visibleText, metadata: this.metadata }
  }

  private appendControlBody(value: string): void {
    if (!value || this.controlBodyOverflow) return
    const remaining = MAX_CONTROL_BODY_LENGTH - this.controlBody.length
    if (value.length > remaining) {
      this.controlBody += value.slice(0, Math.max(0, remaining))
      this.controlBodyOverflow = true
      return
    }
    this.controlBody += value
  }

  private applyControlMetadata(): void {
    if (!this.controlBodyOverflow) {
      try {
        const parsed = JSON.parse(this.controlBody.trim()) as unknown
        const metadata = parseAvatarMetadata(parsed)
        if (metadata) this.metadata = { ...(this.metadata ?? {}), ...metadata }
      } catch {
        // Malformed control data stays hidden and cannot affect avatar state.
      }
    }
    this.controlBody = ''
    this.controlBodyOverflow = false
  }
}

export function sanitizeYachiyoVisibleText(text: string): string {
  const parser = new YachiyoControlEnvelopeParser()
  parser.push(text)
  return parser.finish().text
}

export function parseAvatarMetadata(value: unknown): AvatarMetadata | null {
  if (!isRecord(value)) return null

  const metadata: AvatarMetadata = {}
  const emotions = new Set([
    'idle',
    'listening',
    'thinking',
    'speaking',
    'happy',
    'concerned',
    'confused',
    'reminder',
    'success',
    'error'
  ])
  const motions = new Set(['idle', 'nod', 'wave', 'celebrate', 'concerned'])

  if (typeof value.emotion === 'string' && emotions.has(value.emotion)) {
    metadata.emotion = value.emotion as NonNullable<AvatarMetadata['emotion']>
  }
  if (typeof value.motion === 'string' && motions.has(value.motion)) {
    metadata.motion = value.motion as NonNullable<AvatarMetadata['motion']>
  }
  if (['low', 'normal', 'high'].includes(String(value.importance))) {
    metadata.importance = value.importance as NonNullable<AvatarMetadata['importance']>
  }
  if (typeof value.requires_response === 'boolean') {
    metadata.requiresResponse = value.requires_response
  }

  return Object.keys(metadata).length > 0 ? metadata : null
}

function nextReservedMarker(value: string): { index: number; tag: string } | null {
  let result: { index: number; tag: string } | null = null
  for (const tag of RESERVED_TAGS) {
    const index = indexOfAsciiCaseInsensitive(value, tag)
    if (index >= 0 && (!result || index < result.index)) result = { index, tag }
  }
  return result
}

function indexOfAsciiCaseInsensitive(value: string, search: string): number {
  return value.toLowerCase().indexOf(search)
}

function longestReservedPrefixSuffix(value: string, tags: readonly string[]): number {
  const normalized = value.toLowerCase()
  let longest = 0
  for (const tag of tags) {
    const maximum = Math.min(normalized.length, tag.length - 1)
    for (let length = maximum; length > longest; length -= 1) {
      if (normalized.endsWith(tag.slice(0, length))) {
        longest = length
        break
      }
    }
  }
  return longest
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
