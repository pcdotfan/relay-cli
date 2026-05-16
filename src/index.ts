#!/usr/bin/env node
import { Command, Option } from 'commander'
import {
  setOutputMode,
  setQuiet,
  printError,
  c,
  printHuman
} from './lib/output.js'
import { describeError, RelayCliError } from './lib/errors.js'

import { chainsCommand } from './commands/chains.js'
import { tokensCommand } from './commands/tokens.js'
import { priceCommand } from './commands/price.js'
import { quoteCommand } from './commands/quote.js'
import { swapCommand } from './commands/swap.js'
import { statusCommand } from './commands/status.js'
import { addressCommand } from './commands/address.js'

const VERSION = '0.1.0'

const program = new Command()
program
  .name('relay')
  .summary('quote, bridge, and swap across chains from your terminal')
  .description(
    [
      'Command-line interface for relay.link.',
      '',
      'Wraps @relayprotocol/relay-sdk with flag-driven subcommands.',
      'Assets use shorthand `<chain>:<token>` (e.g. base:USDC, eth:0x…, solana:SOL).',
      'Signing reads from env: RELAY_EVM_PRIVATE_KEY, RELAY_SOLANA_PRIVATE_KEY,',
      'RELAY_BITCOIN_PRIVATE_KEY. Read-only commands need no keys.'
    ].join('\n')
  )
  .version(VERSION, '-V, --version', 'print version and exit')
  .addOption(new Option('--json', 'emit JSON to stdout (machine-readable)'))
  .addOption(new Option('--quiet', 'suppress informational stdout/stderr lines'))
  .addOption(
    new Option(
      '--testnet',
      'use Relay testnet API (api.testnets.relay.link) instead of mainnet'
    )
  )
  .addOption(
    new Option('--api-url <url>', 'override Relay API base URL (mirrors RELAY_API_URL)')
  )
  .addOption(
    new Option('--api-key <key>', 'Relay API key (mirrors RELAY_API_KEY)')
  )
  .addOption(
    new Option(
      '--log-level <n>',
      'SDK log verbosity: 0=none, 1=error, 2=warn, 3=info, 4=verbose'
    )
  )
  .addHelpText(
    'after',
    [
      '',
      'Environment variables:',
      '  RELAY_EVM_PRIVATE_KEY        32-byte hex key for EVM chains',
      '  RELAY_SOLANA_PRIVATE_KEY     base58 or JSON byte array (64 bytes)',
      '  RELAY_BITCOIN_PRIVATE_KEY    WIF-encoded mainnet key (P2WPKH derived)',
      '  RELAY_API_URL, RELAY_API_KEY override defaults',
      '  RELAY_RPC_URL_<chainId>      per-chain EVM RPC override',
      '  RELAY_SOLANA_RPC_URL         Solana RPC override',
      '  RELAY_LOG_LEVEL              same as --log-level',
      '  RELAY_DEBUG                  set to print stack traces on error',
      '',
      'Examples:',
      '  $ relay chains --vm svm',
      '  $ relay tokens --chain base --search USDC',
      '  $ relay price --from base:ETH --to arb:ETH --amount 0.01',
      '  $ relay swap  --from base:USDC --to arb:ETH --amount 100 --yes',
      '  $ relay status 0x1234…',
      '',
      'Exit codes: 0 ok · 1 runtime/SDK error · 2 bad input or missing env · 130 user aborted',
      ''
    ].join('\n')
  )
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals()
    if (opts.json) setOutputMode('json')
    if (opts.quiet) setQuiet(true)
    if (opts.apiUrl) process.env.RELAY_API_URL = opts.apiUrl
    if (opts.apiKey) process.env.RELAY_API_KEY = opts.apiKey
    if (opts.logLevel !== undefined)
      process.env.RELAY_LOG_LEVEL = String(opts.logLevel)
  })

program
  .command('chains')
  .summary('list supported chains')
  .description(
    [
      'List every chain Relay can quote on, with its numeric id, VM type,',
      'display name, and native currency. Output respects the global --json flag.',
      '',
      'Chain ids come from the live Relay chain config, fetched once at startup.'
    ].join('\n')
  )
  .option(
    '--vm <type>',
    'filter by VM type: evm, svm, bvm, tvm, suivm, hypevm, lvm, tonvm'
  )
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ relay chains',
      '  $ relay chains --vm bvm',
      '  $ relay --json chains | jq \'.[] | select(.vmType=="svm")\'',
      ''
    ].join('\n')
  )
  .action(async (opts, cmd) => {
    const g = cmd.optsWithGlobals()
    await chainsCommand({ testnet: g.testnet, vm: opts.vm })
  })

program
  .command('tokens')
  .summary('list tokens on a chain')
  .description(
    [
      'List tokens on one chain via the /currencies/v2 endpoint. Use --search to',
      'filter by symbol or name (falls back to external indexers for unknown tokens).',
      'Verified tokens are marked with a check in the V column.'
    ].join('\n')
  )
  .requiredOption(
    '-c, --chain <chain>',
    'chain id (e.g. 8453) or alias (eth, base, arb, op, polygon, solana, bitcoin, …)'
  )
  .option('-s, --search <q>', 'filter by token symbol, name, or address')
  .option('--limit <n>', 'maximum results to return (1-100)', '20')
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ relay tokens -c base',
      '  $ relay tokens -c base -s USDC',
      '  $ relay tokens -c solana --search wif --limit 5',
      '  $ relay --json tokens -c arb -s WETH',
      ''
    ].join('\n')
  )
  .action(async (opts, cmd) => {
    const g = cmd.optsWithGlobals()
    await tokensCommand({
      chain: opts.chain,
      search: opts.search,
      limit: opts.limit,
      testnet: g.testnet
    })
  })

program
  .command('price')
  .summary('get a price quote (no wallet required)')
  .description(
    [
      'Fetch a Relay quote without a signer. Uses dead-address defaults for',
      'user/recipient so you only pay for an HTTP call.',
      '',
      'Default trade type is EXACT_INPUT (amount is what you send). Use --exact-output',
      'to interpret amount as the destination amount to receive.'
    ].join('\n')
  )
  .requiredOption(
    '--from <asset>',
    "origin asset in 'chain:token' form, e.g. base:USDC or eth:0xA0b8…"
  )
  .requiredOption(
    '--to <asset>',
    "destination asset in 'chain:token' form, e.g. arb:ETH"
  )
  .requiredOption(
    '--amount <n>',
    'amount in human units (e.g. 0.01, 100); refers to origin unless --exact-output'
  )
  .option('--exact-output', 'interpret --amount as destination amount to receive')
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ relay price --from base:ETH    --to arb:ETH   --amount 0.01',
      '  $ relay price --from solana:SOL  --to bitcoin:BTC --amount 0.5',
      '  $ relay price --from eth:USDC    --to base:ETH  --amount 100 --exact-output',
      ''
    ].join('\n')
  )
  .action(async (opts, cmd) => {
    const g = cmd.optsWithGlobals()
    await priceCommand({
      from: opts.from,
      to: opts.to,
      amount: opts.amount,
      exactOutput: opts.exactOutput,
      testnet: g.testnet
    })
  })

program
  .command('quote')
  .summary('full quote using your env-derived sender')
  .description(
    [
      'Fetch a quote using your env-derived sender address (so the quote includes',
      'sender-specific fees, allowance checks, and capabilities). Does NOT execute.',
      '',
      'Requires the relevant RELAY_*_PRIVATE_KEY for the origin chain unless',
      '--no-wallet is passed (then dead-address defaults are used, like `price`).'
    ].join('\n')
  )
  .requiredOption('--from <asset>', "origin asset, e.g. 'base:USDC'")
  .requiredOption('--to <asset>', "destination asset, e.g. 'arb:ETH'")
  .requiredOption('--amount <n>', 'amount in human units')
  .option('--exact-output', 'interpret --amount as destination amount to receive')
  .option('--recipient <addr>', 'destination address (defaults to sender)')
  .option(
    '--slippage <bps>',
    'slippage tolerance in basis points (e.g. 100 = 1%)'
  )
  .option(
    '--no-wallet',
    'skip env wallet; quote with dead-address defaults instead'
  )
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ RELAY_EVM_PRIVATE_KEY=0x… relay quote --from base:USDC --to arb:ETH --amount 100',
      '  $ relay quote --from base:ETH --to arb:ETH --amount 0.01 --no-wallet',
      '  $ relay quote --from eth:USDC --to op:USDC --amount 50 --recipient 0xabc…',
      '  $ relay quote --from base:ETH --to zora:ETH --amount 0.05 --slippage 50',
      ''
    ].join('\n')
  )
  .action(async (opts, cmd) => {
    const g = cmd.optsWithGlobals()
    await quoteCommand({
      from: opts.from,
      to: opts.to,
      amount: opts.amount,
      exactOutput: opts.exactOutput,
      recipient: opts.recipient,
      slippage: opts.slippage,
      noWallet: opts.wallet === false,
      testnet: g.testnet
    })
  })

program
  .command('swap')
  .summary('execute a cross-chain swap or bridge')
  .description(
    [
      'Quote, confirm, then execute a cross-chain swap or bridge using the',
      'env-derived signer for the origin chain. Streams each execution step',
      '(approval, deposit, fill) and prints tx hashes as they land.',
      '',
      'Prompts for y/N confirmation after showing the quote unless --yes.',
      'Real funds — verify the quote summary before confirming.'
    ].join('\n')
  )
  .requiredOption('--from <asset>', "origin asset, e.g. 'base:USDC'")
  .requiredOption('--to <asset>', "destination asset, e.g. 'arb:ETH'")
  .requiredOption('--amount <n>', 'amount in human units')
  .option('--exact-output', 'interpret --amount as destination amount to receive')
  .option('--recipient <addr>', 'destination address (defaults to sender)')
  .option(
    '--slippage <bps>',
    'slippage tolerance in basis points (e.g. 100 = 1%)'
  )
  .option('-y, --yes', 'skip the y/N confirmation prompt')
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ relay swap --from base:USDC --to arb:ETH --amount 100',
      '  $ relay swap --from solana:SOL --to base:ETH --amount 1 --yes',
      '  $ relay swap --from eth:ETH --to base:ETH --amount 0.05 --recipient 0xabc…',
      '  $ relay --json swap --from base:ETH --to arb:ETH --amount 0.01 -y',
      '',
      'On success, the requestId is printed — feed it to `relay status` to track.',
      ''
    ].join('\n')
  )
  .action(async (opts, cmd) => {
    const g = cmd.optsWithGlobals()
    await swapCommand({
      from: opts.from,
      to: opts.to,
      amount: opts.amount,
      exactOutput: opts.exactOutput,
      recipient: opts.recipient,
      slippage: opts.slippage,
      yes: opts.yes,
      testnet: g.testnet
    })
  })

program
  .command('status')
  .argument('<requestId>', 'request id printed by `relay swap` or from /requests')
  .summary('check the status of a previous Relay intent')
  .description(
    [
      'Fetch the status of a previous Relay intent via /intents/status/v2.',
      'Prints state (waiting | pending | success | failure | refund), origin and',
      'destination tx hashes with explorer links, and the last-updated timestamp.'
    ].join('\n')
  )
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ relay status 0x341b28c6467bfbffb72ad78ec5ddf1f77b8f9c79be134223e3248a7d4fcd43b6',
      '  $ relay --json status 0x341b… | jq .status',
      ''
    ].join('\n')
  )
  .action(async (requestId: string, _opts, cmd) => {
    const g = cmd.optsWithGlobals()
    await statusCommand(requestId, { testnet: g.testnet })
  })

program
  .command('address')
  .summary('print addresses derived from env private keys')
  .description(
    [
      'Print the addresses derived from each RELAY_*_PRIVATE_KEY env var. Useful',
      'for confirming which account will sign before running `swap`.',
      '',
      'Without --vm, prints all three (showing placeholders for unset keys).',
      'With --vm, errors out if that key is missing.'
    ].join('\n')
  )
  .option('--vm <type>', 'show only one VM: evm, svm, or bvm')
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ relay address',
      '  $ relay address --vm evm',
      '  $ relay --json address',
      ''
    ].join('\n')
  )
  .action((opts) => {
    addressCommand({ vm: opts.vm })
  })

program.parseAsync(process.argv).catch((err) => {
  printError(err instanceof Error ? err : new Error(describeError(err)))
  if (process.env.RELAY_DEBUG) {
    printHuman(c.dim(String((err as Error)?.stack ?? err)))
  }
  const exitCode = err instanceof RelayCliError ? err.exitCode : 1
  process.exit(exitCode)
})
