import { once } from 'node:events'

import type { ElectronApplication } from '@playwright/test'

export async function quitApplication(application: ElectronApplication): Promise<boolean> {
  const child = application.process()
  if (child.exitCode !== null) return true
  await application.evaluate(({ app }) => app.quit()).catch(() => undefined)
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<false>((resolvePromise) => setTimeout(() => resolvePromise(false), 8_000))
  ])
  if (!exited) child.kill()
  return exited
}
