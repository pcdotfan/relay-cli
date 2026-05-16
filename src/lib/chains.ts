import { type RelayChain } from '@relayprotocol/relay-sdk'
import { errBadInput } from './errors.js'
import { ensureClient } from './client.js'

const ALIASES: Record<string, number> = {
  eth: 1,
  ethereum: 1,
  mainnet: 1,
  base: 8453,
  arb: 42161,
  arbitrum: 42161,
  op: 10,
  optimism: 10,
  polygon: 137,
  matic: 137,
  zora: 7777777,
  zksync: 324,
  linea: 59144,
  scroll: 534352,
  blast: 81457,
  mode: 34443,
  manta: 169,
  metal: 1750,
  unichain: 130,
  ink: 57073,
  taiko: 167000,
  bsc: 56,
  bnb: 56,
  avalanche: 43114,
  avax: 43114,
  gnosis: 100,
  bera: 80094,
  berachain: 80094,
  abstract: 2741,
  hyperliquid: 999,
  solana: 792703809,
  sol: 792703809,
  bitcoin: 8253038,
  btc: 8253038,
  sepolia: 11155111,
  'base-sepolia': 84532,
  'arb-sepolia': 421614,
  'op-sepolia': 11155420
}

export async function resolveChain(input: string | number): Promise<RelayChain> {
  const client = await ensureClient()
  const chains = client.chains

  if (typeof input === 'number' || /^\d+$/.test(String(input))) {
    const id = Number(input)
    const chain = chains.find((c) => c.id === id)
    if (!chain) throw errBadInput(`Unknown chain id: ${id}`)
    return chain
  }

  const key = String(input).toLowerCase().trim()
  const aliased = ALIASES[key]
  if (aliased) {
    const chain = chains.find((c) => c.id === aliased)
    if (chain) return chain
  }

  const byName = chains.find(
    (c) =>
      c.name?.toLowerCase() === key || c.displayName?.toLowerCase() === key
  )
  if (byName) return byName

  throw errBadInput(
    `Unknown chain '${input}'. Try a numeric id, or one of: eth, base, arb, op, polygon, solana, bitcoin, …`
  )
}

export function summarizeChain(chain: RelayChain) {
  return {
    id: chain.id,
    name: chain.displayName ?? chain.name,
    vmType: chain.vmType,
    nativeCurrency: chain.currency?.symbol,
    explorer: chain.explorerUrl,
    deposit: chain.depositEnabled !== false
  }
}

export function explorerTxUrl(
  chain: RelayChain | undefined,
  txHash: string
): string | undefined {
  if (!chain?.explorerUrl) return undefined
  const path = chain.explorerPaths?.transaction ?? 'tx'
  return `${chain.explorerUrl.replace(/\/$/, '')}/${path}/${txHash}`
}
