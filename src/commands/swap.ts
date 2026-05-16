import { getQuote, execute } from '@relayprotocol/relay-sdk'
import { ensureClient } from '../lib/client.js'
import { parseAsset } from '../lib/assets.js'
import { parseAmount } from '../lib/amounts.js'
import { buildSignerForChain } from '../lib/wallet.js'
import { makeProgressHandler } from '../lib/progress.js'
import { renderQuoteSummary } from './quote.js'
import {
  c,
  header,
  isJson,
  isQuiet,
  printHuman,
  printJson,
  printInfo
} from '../lib/output.js'
import { errUserAborted } from '../lib/errors.js'
import readline from 'node:readline/promises'

export type SwapOpts = {
  from: string
  to: string
  amount: string
  exactOutput?: boolean
  recipient?: string
  slippage?: string
  yes?: boolean
  testnet?: boolean
}

export async function swapCommand(opts: SwapOpts) {
  await ensureClient({ testnet: opts.testnet })
  const fromAsset = await parseAsset(opts.from)
  const toAsset = await parseAsset(opts.to)

  const tradeType = opts.exactOutput ? 'EXACT_OUTPUT' : 'EXACT_INPUT'
  const refAsset = opts.exactOutput ? toAsset : fromAsset
  const baseAmount = parseAmount(opts.amount, refAsset.decimals)

  const signer = await buildSignerForChain(fromAsset.chain)
  const recipient = opts.recipient ?? signer.address

  const options: Record<string, unknown> = {}
  if (opts.slippage !== undefined) {
    options.slippageTolerance = opts.slippage
  }

  const quote = await getQuote({
    chainId: fromAsset.chain.id,
    currency: fromAsset.address,
    toChainId: toAsset.chain.id,
    toCurrency: toAsset.address,
    tradeType,
    amount: baseAmount,
    user: signer.address,
    recipient,
    options: Object.keys(options).length ? options : undefined
  })

  if (!isJson()) {
    renderQuoteSummary(quote, {
      fromAsset,
      toAsset,
      user: signer.address,
      recipient
    })
  }

  if (!opts.yes) {
    await confirm(`\nProceed with swap from ${signer.address}? [y/N] `)
  }

  if (!isJson() && !isQuiet()) {
    header('Executing')
  }

  const onProgress = makeProgressHandler()
  const exec = await execute({
    quote,
    wallet: signer.wallet as any,
    onProgress
  })

  if (isJson()) {
    printJson({
      status: 'submitted',
      requestId: extractRequestId(exec.data),
      txHashes: extractAllTxHashes(exec.data),
      data: exec.data
    })
    return
  }

  printHuman()
  printHuman(c.green('✓ Swap submitted.'))
  const requestId = extractRequestId(exec.data)
  if (requestId) {
    printInfo(c.dim(`  request id: ${requestId}`))
    printInfo(c.dim(`  → relay status ${requestId}`))
  }
}

async function confirm(prompt: string) {
  if (!process.stdin.isTTY) {
    throw errUserAborted()
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr
  })
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase()
    if (answer !== 'y' && answer !== 'yes') {
      throw errUserAborted()
    }
  } finally {
    rl.close()
  }
}

function extractRequestId(execData: any): string | undefined {
  if (!execData?.steps) return undefined
  for (const step of execData.steps) {
    if (step.requestId) return step.requestId
  }
  return undefined
}

function extractAllTxHashes(execData: any): { txHash: string; chainId: number }[] {
  const out: { txHash: string; chainId: number }[] = []
  for (const step of execData?.steps ?? []) {
    for (const item of step.items ?? []) {
      for (const t of item.txHashes ?? []) out.push(t)
      for (const t of item.internalTxHashes ?? []) out.push(t)
    }
  }
  return out
}
