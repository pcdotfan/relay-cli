import {
  getEvmAddress,
  getSolanaAddress,
  getBitcoinAddress
} from '../lib/wallet.js'
import { c, header, isJson, kv, printJson } from '../lib/output.js'
import { RelayCliError } from '../lib/errors.js'

export type AddressOpts = {
  vm?: 'evm' | 'svm' | 'bvm'
}

export function addressCommand(opts: AddressOpts) {
  const results: Record<string, string> = {}

  const requestedVms: ('evm' | 'svm' | 'bvm')[] = opts.vm
    ? [opts.vm]
    : ['evm', 'svm', 'bvm']

  for (const vm of requestedVms) {
    try {
      if (vm === 'evm') results.evm = getEvmAddress()
      if (vm === 'svm') results.svm = getSolanaAddress()
      if (vm === 'bvm') results.bvm = getBitcoinAddress()
    } catch (e) {
      if (e instanceof RelayCliError && e.code === 'missing_env') {
        if (opts.vm) throw e
        continue
      }
      throw e
    }
  }

  if (isJson()) {
    printJson(results)
    return
  }

  header('Addresses')
  kv('EVM', results.evm ?? c.dim('(no RELAY_EVM_PRIVATE_KEY)'))
  kv('Solana', results.svm ?? c.dim('(no RELAY_SOLANA_PRIVATE_KEY)'))
  kv('Bitcoin', results.bvm ?? c.dim('(no RELAY_BITCOIN_PRIVATE_KEY)'))
}
