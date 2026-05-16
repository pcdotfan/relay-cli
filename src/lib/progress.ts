import type { ProgressData } from '@relayprotocol/relay-sdk'
import { c, printHuman, printNdjson, isJson, isQuiet } from './output.js'
import { explorerTxUrl } from './chains.js'
import { getRelayClient } from './client.js'

type StepKey = string

const seenStepStatus = new Map<StepKey, 'pending' | 'active' | 'done' | 'error'>()
const seenTxs = new Set<string>()

export function resetProgressState() {
  seenStepStatus.clear()
  seenTxs.clear()
}

export function makeProgressHandler() {
  resetProgressState()
  return (data: ProgressData) => {
    if (isJson()) {
      printNdjson({
        event: 'progress',
        currentStep: data.currentStep?.id,
        currentStepItemStatus: data.currentStepItem?.status,
        progressState: data.currentStepItem?.progressState,
        txHashes: data.txHashes,
        error: data.error
      })
      return
    }
    if (isQuiet()) return

    renderStepStates(data)
    renderNewTxHashes(data)

    if (data.error) {
      printHuman(c.red(`✗ Error: ${stringifyErr(data.error)}`))
    }
  }
}

function renderStepStates(data: ProgressData) {
  const steps = data.steps ?? []
  for (const step of steps) {
    const id = String(step.id ?? step.action ?? Math.random())
    const allComplete = step.items?.every((i) => i.status === 'complete')
    const isActive = data.currentStep?.id === step.id && !allComplete
    const hasError = step.items?.some((i) => i.error)

    let status: 'pending' | 'active' | 'done' | 'error' = 'pending'
    if (hasError) status = 'error'
    else if (allComplete) status = 'done'
    else if (isActive) status = 'active'

    const prev = seenStepStatus.get(id)
    if (prev === status) continue
    seenStepStatus.set(id, status)

    const icon =
      status === 'done'
        ? c.green('✓')
        : status === 'error'
          ? c.red('✗')
          : status === 'active'
            ? c.cyan('⠿')
            : c.dim('▢')
    const label = step.action ?? step.id ?? 'step'
    const desc = step.description ? c.dim(` — ${step.description}`) : ''
    const sub = data.currentStepItem?.progressState
      ? c.dim(` [${data.currentStepItem.progressState}]`)
      : ''
    printHuman(`  ${icon} ${c.bold(String(label))}${desc}${status === 'active' ? sub : ''}`)
  }
}

function renderNewTxHashes(data: ProgressData) {
  const client = getRelayClient()
  const allHashes: { txHash: string; chainId: number }[] = []
  for (const step of data.steps ?? []) {
    for (const item of step.items ?? []) {
      for (const t of item.txHashes ?? []) {
        allHashes.push({ txHash: t.txHash, chainId: t.chainId })
      }
      for (const t of item.internalTxHashes ?? []) {
        allHashes.push({ txHash: t.txHash, chainId: t.chainId })
      }
    }
  }
  for (const t of data.txHashes ?? []) {
    allHashes.push({ txHash: t.txHash, chainId: t.chainId })
  }
  for (const tx of allHashes) {
    const key = `${tx.chainId}:${tx.txHash}`
    if (seenTxs.has(key)) continue
    seenTxs.add(key)
    const chain = client.chains.find((cc) => cc.id === tx.chainId)
    const url = explorerTxUrl(chain, tx.txHash)
    printHuman(
      `    ${c.dim('tx')} ${c.cyan(tx.txHash)}${url ? c.dim('  ' + url) : ''}`
    )
  }
}

function stringifyErr(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as any
    return e.message ?? JSON.stringify(err)
  }
  return String(err)
}
