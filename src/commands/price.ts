import { getQuote } from '@relayprotocol/relay-sdk'
import { ensureClient } from '../lib/client.js'
import { parseAsset } from '../lib/assets.js'
import { parseAmount, formatAmount } from '../lib/amounts.js'
import { c, header, kv, isJson, printJson } from '../lib/output.js'

export type PriceOpts = {
  from: string
  to: string
  amount: string
  exactOutput?: boolean
  testnet?: boolean
}

export async function priceCommand(opts: PriceOpts) {
  await ensureClient({ testnet: opts.testnet })
  const fromAsset = await parseAsset(opts.from)
  const toAsset = await parseAsset(opts.to)

  const tradeType = opts.exactOutput ? 'EXACT_OUTPUT' : 'EXACT_INPUT'
  const refAsset = opts.exactOutput ? toAsset : fromAsset
  const baseAmount = parseAmount(opts.amount, refAsset.decimals)

  const quote = await getQuote(
    {
      chainId: fromAsset.chain.id,
      currency: fromAsset.address,
      toChainId: toAsset.chain.id,
      toCurrency: toAsset.address,
      tradeType,
      amount: baseAmount
    },
    true
  )

  if (isJson()) {
    printJson(quote)
    return
  }

  const details = quote.details
  const inCurrency = details?.currencyIn?.currency
  const outCurrency = details?.currencyOut?.currency
  const inAmt = details?.currencyIn?.amount
  const outAmt = details?.currencyOut?.amount
  const minOut = details?.currencyOut?.minimumAmount
  const rate = details?.rate
  const usdIn = details?.currencyIn?.amountUsd
  const usdOut = details?.currencyOut?.amountUsd
  const timeEst = details?.timeEstimate

  header('Price')
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
  if (timeEst !== undefined) kv('ETA', `${timeEst}s`)
  if (quote.fees) {
    const totalFee = (quote.fees as any).relayer?.amountUsd
    if (totalFee) kv('Relayer fee', `$${totalFee}`)
  }
}
