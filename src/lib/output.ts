import pc from 'picocolors'

export type OutputMode = 'human' | 'json'

let currentMode: OutputMode = 'human'
let quiet = false

export function setOutputMode(mode: OutputMode) {
  currentMode = mode
}

export function setQuiet(q: boolean) {
  quiet = q
}

export function getMode(): OutputMode {
  return currentMode
}

export function isQuiet(): boolean {
  return quiet
}

export function isJson(): boolean {
  return currentMode === 'json'
}

export function useColor(): boolean {
  return currentMode === 'human' && process.stdout.isTTY === true
}

export const c = {
  bold: (s: string) => (useColor() ? pc.bold(s) : s),
  dim: (s: string) => (useColor() ? pc.dim(s) : s),
  green: (s: string) => (useColor() ? pc.green(s) : s),
  red: (s: string) => (useColor() ? pc.red(s) : s),
  yellow: (s: string) => (useColor() ? pc.yellow(s) : s),
  cyan: (s: string) => (useColor() ? pc.cyan(s) : s),
  magenta: (s: string) => (useColor() ? pc.magenta(s) : s),
  gray: (s: string) => (useColor() ? pc.gray(s) : s)
}

export function printHuman(line: string = '') {
  if (currentMode === 'json' || quiet) return
  process.stdout.write(line + '\n')
}

export function printInfo(line: string) {
  if (quiet) return
  if (currentMode === 'json') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export function printJson(data: unknown) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

export function printNdjson(data: unknown) {
  process.stdout.write(JSON.stringify(data) + '\n')
}

export function printError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (currentMode === 'json') {
    process.stderr.write(
      JSON.stringify({ error: message, code: (err as any)?.code ?? 'error' }) +
        '\n'
    )
  } else {
    process.stderr.write(c.red(`Error: `) + message + '\n')
  }
}

export function kv(key: string, value: string | number | undefined | null) {
  if (value === undefined || value === null || value === '') return
  printHuman(`  ${c.dim(key.padEnd(14))}  ${value}`)
}

export function header(title: string) {
  printHuman()
  printHuman(c.bold(title))
}
