import {
  createClient,
  getClient,
  MAINNET_RELAY_API,
  TESTNET_RELAY_API,
  LogLevel,
  type RelayClient
} from '@relayprotocol/relay-sdk'
import { configureDynamicChains } from '@relayprotocol/relay-sdk/chain-utils'

export type ClientOptions = {
  apiUrl?: string
  apiKey?: string
  testnet?: boolean
  logLevel?: number
}

let initialized = false

export async function ensureClient(opts: ClientOptions = {}): Promise<RelayClient> {
  if (initialized) return getClient()

  const baseApiUrl =
    opts.apiUrl ??
    process.env.RELAY_API_URL ??
    (opts.testnet ? TESTNET_RELAY_API : MAINNET_RELAY_API)

  const apiKey = opts.apiKey ?? process.env.RELAY_API_KEY

  const envLogLevel = process.env.RELAY_LOG_LEVEL
    ? Number(process.env.RELAY_LOG_LEVEL)
    : undefined
  const logLevel = (opts.logLevel ?? envLogLevel ?? LogLevel.None) as LogLevel

  createClient({
    baseApiUrl,
    apiKey,
    source: 'relay-cli',
    logLevel
  })

  await configureDynamicChains()
  initialized = true
  return getClient()
}

export function getRelayClient(): RelayClient {
  return getClient()
}
