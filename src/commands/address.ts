import {
  getEvmAddresses,
  getSolanaAddresses,
  getBitcoinAddresses
} from '../lib/wallet.js'
import { c, header, isJson, printHuman, printJson } from '../lib/output.js'
import { RelayCliError } from '../lib/errors.js'

export type AddressOpts = {
  vm?: 'evm' | 'svm' | 'bvm'
}

export function addressCommand(opts: AddressOpts) {
  const results: Record<'evm' | 'svm' | 'bvm', string[]> = {
    evm: [],
    svm: [],
    bvm: []
  }

  const requestedVms: ('evm' | 'svm' | 'bvm')[] = opts.vm
    ? [opts.vm]
    : ['evm', 'svm', 'bvm']

  for (const vm of requestedVms) {
    try {
      if (vm === 'evm') results.evm = getEvmAddresses()
      if (vm === 'svm') results.svm = getSolanaAddresses()
      if (vm === 'bvm') results.bvm = getBitcoinAddresses()
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
  printGroup(
    'EVM',
    results.evm,
    'RELAY_EVM_PRIVATE_KEYS'
  )
  printGroup(
    'Solana',
    results.svm,
    'RELAY_SOLANA_PRIVATE_KEYS'
  )
  printGroup(
    'Bitcoin',
    results.bvm,
    'RELAY_BITCOIN_PRIVATE_KEYS'
  )
}

function printGroup(label: string, addrs: string[], envName: string) {
  if (addrs.length === 0) {
    printHuman(`  ${c.dim((label + ':').padEnd(10))}  ${c.dim(`(no ${envName})`)}`)
    return
  }
  if (addrs.length === 1) {
    printHuman(`  ${(label + ':').padEnd(10)}  ${addrs[0]}`)
    return
  }
  printHuman(`  ${(label + ':').padEnd(10)}  ${c.dim(`(${addrs.length} keys)`)}`)
  addrs.forEach((addr, i) => {
    printHuman(`    ${c.dim(`#${i + 1}`)}  ${addr}`)
  })
}
