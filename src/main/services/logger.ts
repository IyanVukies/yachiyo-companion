import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { redactSecrets } from '../../shared/text'

type Level = 'error' | 'warn' | 'info' | 'debug'

const PRIORITY: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 }

export class AppLogger {
  constructor(
    private readonly filePath: string,
    private level: Level = 'info'
  ) {}

  setLevel(level: Level): void {
    this.level = level
  }

  error(message: string, detail?: unknown): void {
    void this.write('error', message, detail)
  }

  warn(message: string, detail?: unknown): void {
    void this.write('warn', message, detail)
  }

  info(message: string, detail?: unknown): void {
    void this.write('info', message, detail)
  }

  debug(message: string, detail?: unknown): void {
    void this.write('debug', message, detail)
  }

  async tail(maxBytes = 32_000): Promise<string> {
    try {
      const content = await readFile(this.filePath, 'utf8')
      return content.slice(-maxBytes)
    } catch {
      return ''
    }
  }

  private async write(level: Level, message: string, detail?: unknown): Promise<void> {
    if (PRIORITY[level] > PRIORITY[this.level]) return
    const suffix = detail === undefined ? '' : ` ${safeSerialize(detail)}`
    const line = redactSecrets(
      `${new Date().toISOString()} ${level.toUpperCase()} ${message}${suffix}`
    )
    const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    target(line)

    try {
      await mkdir(dirname(this.filePath), { recursive: true })
      await this.rotateIfNeeded()
      const previous = await readFile(this.filePath, 'utf8').catch(() => '')
      await writeFile(this.filePath, `${previous}${line}\n`, 'utf8')
    } catch {
      // Logging must never take down the application.
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    const details = await stat(this.filePath).catch(() => null)
    if (details && details.size > 1_000_000) {
      await rename(this.filePath, `${this.filePath}.1`).catch(() => undefined)
    }
  }
}

function safeSerialize(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}
