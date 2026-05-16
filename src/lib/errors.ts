export class RelayCliError extends Error {
  readonly exitCode: number
  readonly code: string
  readonly cause?: unknown

  constructor(opts: {
    message: string
    code?: string
    exitCode?: number
    cause?: unknown
  }) {
    super(opts.message)
    this.name = 'RelayCliError'
    this.code = opts.code ?? 'cli_error'
    this.exitCode = opts.exitCode ?? 1
    this.cause = opts.cause
  }
}

export const errBadInput = (message: string, cause?: unknown) =>
  new RelayCliError({ message, code: 'bad_input', exitCode: 2, cause })

export const errMissingEnv = (envVar: string, hint?: string) =>
  new RelayCliError({
    message: `Missing required env var ${envVar}${hint ? `. ${hint}` : ''}`,
    code: 'missing_env',
    exitCode: 2
  })

export const errUserAborted = () =>
  new RelayCliError({
    message: 'Aborted by user.',
    code: 'user_aborted',
    exitCode: 130
  })

export function describeError(err: unknown): string {
  if (err instanceof RelayCliError) return err.message
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>
    if (typeof anyErr.message === 'string') return anyErr.message
    if (anyErr.response && typeof anyErr.response === 'object') {
      const resp = anyErr.response as Record<string, unknown>
      const data = resp.data
      if (data) return typeof data === 'string' ? data : JSON.stringify(data)
    }
  }
  return String(err)
}
