import { axios, type RelayChain } from '@relayprotocol/relay-sdk'
import { resolveChain } from './chains.js'
import { ensureClient } from './client.js'
import { errBadInput, RelayCliError } from './errors.js'

export type ResolvedAsset = {
  chain: RelayChain
  address: string
  symbol: string
  name?: string
  decimals: number
  isNative: boolean
}

type Currency = {
  chainId?: number
  address?: string
  symbol?: string
  name?: string
  decimals?: number
  vmType?: string
  metadata?: { logoURI?: string; verified?: boolean; isNative?: boolean }
}

export async function parseAsset(input: string): Promise<ResolvedAsset> {
  if (!input.includes(':')) {
    throw errBadInput(
      `Asset '${input}' must be in 'chain:token' form (e.g. base:USDC, eth:0xA0b8…)`
    )
  }
  const [rawChain, rawToken] = input.split(':') as [string, string]
  if (!rawChain || !rawToken) {
    throw errBadInput(`Asset '${input}' is malformed; expected 'chain:token'.`)
  }
  const chain = await resolveChain(rawChain)
  return resolveCurrency(chain, rawToken.trim())
}

export async function resolveCurrency(
  chain: RelayChain,
  token: string
): Promise<ResolvedAsset> {
  const nativeSymbol = chain.currency?.symbol?.toUpperCase()
  const looksLikeNative =
    token.toUpperCase() === nativeSymbol ||
    token.toLowerCase() === 'native' ||
    (chain.vmType === 'evm' && /^0x0+$/.test(token)) ||
    (chain.vmType === 'svm' && token === '11111111111111111111111111111111')

  if (looksLikeNative) {
    if (!chain.currency?.address || chain.currency.decimals === undefined) {
      throw new RelayCliError({
        message: `Chain ${chain.displayName} is missing native currency config`,
        code: 'chain_config'
      })
    }
    return {
      chain,
      address: chain.currency.address,
      symbol: chain.currency.symbol ?? 'NATIVE',
      name: chain.currency.name,
      decimals: chain.currency.decimals,
      isNative: true
    }
  }

  if (looksLikeAddress(chain, token)) {
    const found = await fetchCurrencyByAddress(chain.id, token)
    if (found) {
      return toResolved(chain, found)
    }
    throw errBadInput(
      `Token address ${token} not found on ${chain.displayName} (id ${chain.id}).`
    )
  }

  const matches = await searchCurrencies(chain.id, token)
  if (matches.length === 0) {
    throw errBadInput(
      `No token matching '${token}' on ${chain.displayName} (id ${chain.id}). Try using the contract address.`
    )
  }
  const verified = matches.filter((m) => m.metadata?.verified)
  const pool = verified.length > 0 ? verified : matches
  const exact = pool.filter(
    (m) => m.symbol?.toUpperCase() === token.toUpperCase()
  )
  const candidates = exact.length > 0 ? exact : pool

  if (candidates.length > 1) {
    const names = candidates
      .slice(0, 5)
      .map((m) => `  ${m.symbol} — ${m.name ?? ''} (${m.address})`)
      .join('\n')
    throw errBadInput(
      `Ambiguous token '${token}' on ${chain.displayName}. Candidates:\n${names}\nPass the contract address instead.`
    )
  }
  return toResolved(chain, candidates[0]!)
}

function looksLikeAddress(chain: RelayChain, token: string): boolean {
  if (chain.vmType === 'evm') return /^0x[0-9a-fA-F]{40}$/.test(token)
  if (chain.vmType === 'svm') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)
  if (chain.vmType === 'bvm') return token.startsWith('bc1') || token.startsWith('tb1')
  return token.startsWith('0x')
}

function toResolved(chain: RelayChain, c: Currency): ResolvedAsset {
  if (!c.address || c.decimals === undefined || !c.symbol) {
    throw new RelayCliError({
      message: `Currency record incomplete for ${c.symbol ?? c.address ?? '?'}`,
      code: 'currency_incomplete'
    })
  }
  return {
    chain,
    address: c.address,
    symbol: c.symbol,
    name: c.name,
    decimals: c.decimals,
    isNative: c.metadata?.isNative === true
  }
}

async function fetchCurrencyByAddress(
  chainId: number,
  address: string
): Promise<Currency | undefined> {
  const client = await ensureClient()
  const res = await axios.post<Currency[]>(
    `${client.baseApiUrl}/currencies/v2`,
    { chainIds: [chainId], address, limit: 1 }
  )
  return res.data?.[0]
}

async function searchCurrencies(
  chainId: number,
  term: string
): Promise<Currency[]> {
  const client = await ensureClient()
  const res = await axios.post<Currency[]>(
    `${client.baseApiUrl}/currencies/v2`,
    { chainIds: [chainId], term, limit: 20, useExternalSearch: true }
  )
  return res.data ?? []
}

export async function listTokens(
  chainId: number,
  options: { term?: string; limit?: number } = {}
): Promise<Currency[]> {
  const client = await ensureClient()
  const res = await axios.post<Currency[]>(
    `${client.baseApiUrl}/currencies/v2`,
    {
      chainIds: [chainId],
      term: options.term,
      limit: options.limit ?? 20,
      useExternalSearch: options.term ? true : false,
      defaultList: options.term ? false : true
    }
  )
  return res.data ?? []
}
