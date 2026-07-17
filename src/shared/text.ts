const SENTENCE_END = /([.!?…]+[”'\])}]?|\n+)/u

export function splitSentenceChunks(input: string, maxLength = 280): string[] {
  const normalized = input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
  if (!normalized) return []

  const chunks: string[] = []
  let buffer = ''

  for (const piece of normalized.split(SENTENCE_END)) {
    if (!piece) continue
    buffer += piece

    if (SENTENCE_END.test(piece) || buffer.length >= maxLength) {
      flushByLength(buffer, chunks, maxLength)
      buffer = ''
    }
  }

  if (buffer.trim()) flushByLength(buffer, chunks, maxLength)
  return chunks
}

function flushByLength(value: string, chunks: string[], maxLength: number): void {
  let remaining = value.trim()
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(' ', maxLength)
    if (splitAt < Math.floor(maxLength * 0.5)) splitAt = maxLength
    chunks.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining) chunks.push(remaining)
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(
      /("?(?:api[_-]?key|token|secret|password)"?\s*[:=]\s*["']?)[^"'\s,;}]+/gi,
      '$1[REDACTED]'
    )
}
