import { ensureClient } from '../lib/client.js'
import { summarizeChain } from '../lib/chains.js'
import { c, isJson, printHuman, printJson } from '../lib/output.js'

export type ChainsOpts = {
  testnet?: boolean
  vm?: string
}

export async function chainsCommand(opts: ChainsOpts) {
  const client = await ensureClient({ testnet: opts.testnet })
  let chains = client.chains

  if (opts.vm) {
    const vm = opts.vm.toLowerCase()
    chains = chains.filter((ch) => (ch.vmType ?? '').toLowerCase() === vm)
  }

  if (isJson()) {
    printJson(chains.map(summarizeChain))
    return
  }

  const rows = chains
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((ch) => ({
      id: String(ch.id),
      vm: ch.vmType ?? '-',
      name: ch.displayName ?? ch.name,
      symbol: ch.currency?.symbol ?? '-'
    }))

  const idW = Math.max(...rows.map((r) => r.id.length), 2)
  const vmW = Math.max(...rows.map((r) => r.vm.length), 2)
  const nameW = Math.max(...rows.map((r) => r.name.length), 4)

  printHuman(
    c.bold(
      `  ${'ID'.padEnd(idW)}  ${'VM'.padEnd(vmW)}  ${'NAME'.padEnd(nameW)}  NATIVE`
    )
  )
  for (const r of rows) {
    printHuman(
      `  ${r.id.padEnd(idW)}  ${r.vm.padEnd(vmW)}  ${r.name.padEnd(nameW)}  ${r.symbol}`
    )
  }
  printHuman(c.dim(`\n${chains.length} chains`))
}
