import { getQuote } from '@relayprotocol/relay-sdk'
import { ensureClient } from '../lib/client.js'
import { parseAsset } from '../lib/assets.js'
import { parseAmount, formatAmount } from '../lib/amounts.js'
import { buildSignerForChain } from '../lib/wallet.js'
import {
  c,
  header,
  kv,
  isJson,
  printHuman,
  printJson
} from '../lib/output.js'
import { RelayCliError } from '../lib/errors.js'

export type QuoteOpts = {
  from: string
  to: string
  amount: string
  exactOutput?: boolean
  recipient?: string
  slippage?: string
  noWallet?: boolean
  testnet?: boolean
}

export async function quoteCommand(opts: QuoteOpts) {
  await ensureClient({ testnet: opts.testnet })
  const fromAsset = await parseAsset(opts.from)
  const toAsset = await parseAsset(opts.to)

  const tradeType = opts.exactOutput ? 'EXACT_OUTPUT' : 'EXACT_INPUT'
  const refAsset = opts.exactOutput ? toAsset : fromAsset
  const baseAmount = parseAmount(opts.amount, refAsset.decimals)

  let user: string | undefined
  let recipient = opts.recipient
  const signer = opts.noWallet
    ? undefined
    : await tryBuildSigner(fromAsset.chain)

  if (signer) {
    user = signer.address
    if (!recipient) recipient = signer.address
  }

  const options: Record<string, unknown> = {}
  if (opts.slippage !== undefined) {
    options.slippageTolerance = opts.slippage
  }

  const quote = await getQuote(
    {
      chainId: fromAsset.chain.id,
      currency: fromAsset.address,
      toChainId: toAsset.chain.id,
      toCurrency: toAsset.address,
      tradeType,
      amount: baseAmount,
      user,
      recipient,
      options: Object.keys(options).length ? options : undefined
    },
    !signer
  )

  if (isJson()) {
    printJson(quote)
    return
  }

  renderQuoteSummary(quote, {
    fromAsset,
    toAsset,
    user,
    recipient
  })
}

async function tryBuildSigner(chain: Awaited<ReturnType<typeof parseAsset>>['chain']) {
  try {
    return await buildSignerForChain(chain)
  } catch (e) {
    if (e instanceof RelayCliError && e.code === 'missing_env') {
      return undefined
    }
    throw e
  }
}

export function renderQuoteSummary(
  quote: Awaited<ReturnType<typeof getQuote>>,
  ctx: {
    fromAsset: Awaited<ReturnType<typeof parseAsset>>
    toAsset: Awaited<ReturnType<typeof parseAsset>>
    user?: string
    recipient?: string
  }
) {
  const details = quote.details
  const inCurrency = details?.currencyIn?.currency
  const outCurrency = details?.currencyOut?.currency
  const inAmt = details?.currencyIn?.amount
  const outAmt = details?.currencyOut?.amount
  const minOut = details?.currencyOut?.minimumAmount
  const rate = details?.rate
  const usdIn = details?.currencyIn?.amountUsd
  const usdOut = details?.currencyOut?.amountUsd
  const slippage = (details as any)?.slippageTolerance
  const eta = details?.timeEstimate

  header(
    `Quote  ${c.dim(`${ctx.fromAsset.chain.displayName} → ${ctx.toAsset.chain.displayName}`)}`
  )
  kv(
    'You pay',
    `${formatAmount(inAmt, inCurrency?.decimals, inCurrency?.symbol)}${usdIn ? c.dim(`  ($${usdIn})`) : ''}`
  )
  kv(
    'You receive',
    `${formatAmount(outAmt, outCurrency?.decimals, outCurrency?.symbol)}${usdOut ? c.dim(`  ($${usdOut})`) : ''}`
  )
  if (minOut) {
    kv('Minimum out', formatAmount(minOut, outCurrency?.decimals, outCurrency?.symbol))
  }
  if (rate) kv('Rate', String(rate))
  if (eta !== undefined) kv('ETA', `${eta}s`)
  if (slippage?.destination?.percent) {
    kv('Slippage', `${slippage.destination.percent}%`)
  }
  if (ctx.user) kv('From', ctx.user)
  if (ctx.recipient && ctx.recipient !== ctx.user) kv('Recipient', ctx.recipient)

  const stepCount = quote.steps?.length ?? 0
  if (stepCount > 0) {
    printHuman()
    printHuman(c.dim(`  ${stepCount} execution step${stepCount === 1 ? '' : 's'}:`))
    for (const step of quote.steps ?? []) {
      printHuman(
        `    ${c.dim('•')} ${c.bold(String(step.action ?? step.id))}${
          step.description ? c.dim(' — ' + step.description) : ''
        }`
      )
    }
  }

  const relayerFeeUsd = (quote.fees as any)?.relayer?.amountUsd
  const gasFeeUsd = (quote.fees as any)?.gas?.amountUsd
  if (relayerFeeUsd || gasFeeUsd) {
    printHuman()
    if (relayerFeeUsd) kv('Relayer fee', `$${relayerFeeUsd}`)
    if (gasFeeUsd) kv('Gas fee', `$${gasFeeUsd}`)
  }
}
