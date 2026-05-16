import { ensureClient } from '../lib/client.js'
import { resolveChain } from '../lib/chains.js'
import { listTokens } from '../lib/assets.js'
import { c, isJson, printHuman, printJson } from '../lib/output.js'

export type TokensOpts = {
  chain: string
  search?: string
  limit?: string
  testnet?: boolean
}

export async function tokensCommand(opts: TokensOpts) {
  await ensureClient({ testnet: opts.testnet })
  const chain = await resolveChain(opts.chain)
  const limit = opts.limit ? Math.min(Math.max(Number(opts.limit), 1), 100) : 20

  const tokens = await listTokens(chain.id, {
    term: opts.search,
    limit
  })

  if (isJson()) {
    printJson(tokens)
    return
  }

  if (tokens.length === 0) {
    printHuman(c.dim(`No tokens found on ${chain.displayName}.`))
    return
  }

  const rows = tokens.map((t) => ({
    symbol: t.symbol ?? '-',
    name: t.name ?? '-',
    decimals: String(t.decimals ?? '-'),
    address: t.address ?? '-',
    verified: t.metadata?.verified ? '✓' : ' '
  }))

  const sW = Math.max(...rows.map((r) => r.symbol.length), 6)
  const nW = Math.min(Math.max(...rows.map((r) => r.name.length), 4), 24)
  const dW = 8

  printHuman(c.bold(`  Tokens on ${chain.displayName} (id ${chain.id})`))
  printHuman()
  printHuman(
    c.dim(
      `  V  ${'SYMBOL'.padEnd(sW)}  ${'NAME'.padEnd(nW)}  ${'DECIMALS'.padStart(dW)}  ADDRESS`
    )
  )
  for (const r of rows) {
    const name = r.name.length > nW ? r.name.slice(0, nW - 1) + '…' : r.name
    printHuman(
      `  ${c.green(r.verified)}  ${r.symbol.padEnd(sW)}  ${name.padEnd(nW)}  ${r.decimals.padStart(dW)}  ${c.dim(r.address)}`
    )
  }
}
