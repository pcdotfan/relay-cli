import { axios } from '@relayprotocol/relay-sdk'
import { ensureClient } from '../lib/client.js'
import { explorerTxUrl } from '../lib/chains.js'
import { c, header, isJson, kv, printHuman, printJson } from '../lib/output.js'
import { errBadInput } from '../lib/errors.js'

export type StatusOpts = {
  testnet?: boolean
}

type StatusResponse = {
  status?: string
  details?: string
  inTxHashes?: string[]
  txHashes?: string[]
  time?: number
  originChainId?: number
  destinationChainId?: number
  quoteCreatedAt?: number
}

export async function statusCommand(requestId: string, opts: StatusOpts) {
  if (!requestId) throw errBadInput('Missing requestId')
  const client = await ensureClient({ testnet: opts.testnet })

  const res = await axios.get<StatusResponse>(
    `${client.baseApiUrl}/intents/status/v2`,
    { params: { requestId } }
  )
  const data = res.data

  if (isJson()) {
    printJson(data)
    return
  }

  header(`Status  ${c.dim(requestId)}`)
  kv('State', data.status ?? '-')
  if (data.details) kv('Details', data.details)
  kv('Origin', String(data.originChainId ?? '-'))
  kv('Destination', String(data.destinationChainId ?? '-'))
  if (data.time) kv('Updated', new Date(data.time * 1000).toISOString())

  const origin = client.chains.find((ch) => ch.id === data.originChainId)
  const dest = client.chains.find((ch) => ch.id === data.destinationChainId)

  if (data.inTxHashes?.length) {
    printHuman()
    printHuman(c.dim('  Origin tx:'))
    for (const tx of data.inTxHashes) {
      const url = explorerTxUrl(origin, tx)
      printHuman(`    ${c.cyan(tx)}${url ? c.dim('  ' + url) : ''}`)
    }
  }
  if (data.txHashes?.length) {
    printHuman()
    printHuman(c.dim('  Destination tx:'))
    for (const tx of data.txHashes) {
      const url = explorerTxUrl(dest, tx)
      printHuman(`    ${c.cyan(tx)}${url ? c.dim('  ' + url) : ''}`)
    }
  }
}
