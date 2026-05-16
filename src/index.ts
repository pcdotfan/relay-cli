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
  .description(
    'Command-line interface for relay.link — quote, bridge, and swap across chains.'
  )
  .version(VERSION)
  .addOption(new Option('--json', 'emit JSON to stdout'))
  .addOption(new Option('--quiet', 'suppress informational output'))
  .addOption(new Option('--testnet', 'use Relay testnet API'))
  .addOption(new Option('--api-url <url>', 'override Relay API base URL'))
  .addOption(new Option('--api-key <key>', 'Relay API key'))
  .addOption(new Option('--log-level <n>', 'SDK log level 0-4'))
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals()
    if (opts.json) setOutputMode('json')
    if (opts.quiet) setQuiet(true)
    if (opts.apiUrl) process.env.RELAY_API_URL = opts.apiUrl
    if (opts.apiKey) process.env.RELAY_API_KEY = opts.apiKey
    if (opts.logLevel !== undefined) process.env.RELAY_LOG_LEVEL = String(opts.logLevel)
  })

program
  .command('chains')
  .description('List supported chains')
  .option('--vm <type>', 'filter by vm type (evm|svm|bvm|tvm|suivm)')
  .action(async (opts, cmd) => {
    const g = cmd.optsWithGlobals()
    await chainsCommand({ testnet: g.testnet, vm: opts.vm })
  })

program
  .command('tokens')
  .description('List tokens on a chain')
  .requiredOption('-c, --chain <chain>', 'chain id or alias (eth, base, solana, …)')
  .option('-s, --search <q>', 'search term')
  .option('--limit <n>', 'maximum results (default 20)')
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
  .description('Get a price quote (no wallet required)')
  .requiredOption('--from <asset>', "origin asset, e.g. 'base:USDC'")
  .requiredOption('--to <asset>', "destination asset, e.g. 'arb:ETH'")
  .requiredOption('--amount <n>', 'amount in human units')
  .option('--exact-output', 'amount refers to destination (default origin)')
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
  .description('Full quote using your env-derived sender')
  .requiredOption('--from <asset>', "origin asset, e.g. 'base:USDC'")
  .requiredOption('--to <asset>', "destination asset, e.g. 'arb:ETH'")
  .requiredOption('--amount <n>', 'amount in human units')
  .option('--exact-output', 'amount refers to destination (default origin)')
  .option('--recipient <addr>', 'override recipient address')
  .option('--slippage <bps>', 'slippage tolerance in basis points')
  .option('--no-wallet', 'do not use env wallet; use dead-address defaults')
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
  .description('Quote and execute a cross-chain swap/bridge')
  .requiredOption('--from <asset>', "origin asset, e.g. 'base:USDC'")
  .requiredOption('--to <asset>', "destination asset, e.g. 'arb:ETH'")
  .requiredOption('--amount <n>', 'amount in human units')
  .option('--exact-output', 'amount refers to destination (default origin)')
  .option('--recipient <addr>', 'override recipient address')
  .option('--slippage <bps>', 'slippage tolerance in basis points')
  .option('-y, --yes', 'skip confirmation prompt')
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
  .command('status <requestId>')
  .description('Fetch status of a Relay intent')
  .action(async (requestId: string, _opts, cmd) => {
    const g = cmd.optsWithGlobals()
    await statusCommand(requestId, { testnet: g.testnet })
  })

program
  .command('address')
  .description('Print addresses derived from env private keys')
  .option('--vm <type>', 'show only one (evm|svm|bvm)')
  .action((opts) => {
    addressCommand({ vm: opts.vm })
  })

program.parseAsync(process.argv).catch((err) => {
  printError(
    err instanceof Error
      ? err
      : new Error(describeError(err))
  )
  if (process.env.RELAY_DEBUG) {
    printHuman(c.dim(String((err as Error)?.stack ?? err)))
  }
  const exitCode = err instanceof RelayCliError ? err.exitCode : 1
  process.exit(exitCode)
})
