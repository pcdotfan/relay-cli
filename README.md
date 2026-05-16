# relay-cli

Command-line interface for [relay.link](https://relay.link) — quote, bridge, and swap across chains from your terminal.

Wraps [`@relayprotocol/relay-sdk`](https://www.npmjs.com/package/@relayprotocol/relay-sdk) with flag-driven subcommands. EVM, Solana, and Bitcoin are supported via env-var private keys.

## Install

```bash
pnpm install
pnpm build               # bundles via tsdown → dist/index.mjs
node dist/index.mjs --help
```

Or link the binary globally:

```bash
pnpm link --global
relay --help
```

## Quickstart

```bash
# List chains
relay chains
relay chains --vm svm

# Search tokens on a chain
relay tokens --chain base --search USDC

# Read-only price (no keys required)
relay price --from base:ETH --to arb:ETH --amount 0.01
relay price --from solana:SOL --to bitcoin:BTC --amount 0.5

# Full quote using your env-derived sender
relay quote --from base:USDC --to arb:ETH --amount 100

# Execute a bridge (real funds — confirms unless --yes)
relay swap --from base:USDC --to arb:ETH --amount 100 --yes

# Check status of a previous bridge
relay status <requestId>

# Show your env-derived addresses
relay address
```

## Asset shorthand

```
<chain>:<token>
```

`chain` is a numeric id (e.g. `8453`) or a known alias: `eth`, `base`, `arb`, `op`, `polygon`, `zora`, `zksync`, `linea`, `scroll`, `blast`, `bsc`, `avalanche`, `solana`, `bitcoin`, and more. `token` is the native symbol (`ETH`, `SOL`, `BTC`), a token symbol (`USDC`, `WETH`), or the full contract address.

Examples: `eth:USDC`, `base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`, `solana:SOL`, `bitcoin:BTC`.

## Environment variables

| Var | Used for |
|---|---|
| `RELAY_EVM_PRIVATE_KEYS` | one or more 32-byte hex keys, **comma-separated** (with or without `0x`) |
| `RELAY_SOLANA_PRIVATE_KEYS` | base58 strings **or** JSON byte arrays, comma-separated |
| `RELAY_BITCOIN_PRIVATE_KEYS` | WIF-encoded mainnet keys, comma-separated (P2WPKH `bc1…` derived) |
| `RELAY_API_URL` | override Relay API base URL |
| `RELAY_API_KEY` | optional Relay API key |
| `RELAY_RPC_URL_<chainId>` | per-chain EVM RPC override (e.g. `RELAY_RPC_URL_8453`) |
| `RELAY_SOLANA_RPC_URL` | Solana RPC override |
| `RELAY_LOG_LEVEL` | SDK log level `0` (none) – `4` (verbose) |
| `RELAY_DEBUG` | set to anything to print stack traces on error |

The first key in each list is the default signer. Pass `--account <address>` to `quote`/`swap` to pick another. Singular `RELAY_*_PRIVATE_KEY` env names are still accepted as a fallback.

Read-only commands (`chains`, `tokens`, `price`, `quote --no-wallet`, `status`) don't need any keys.

## Global flags

- `--json` — JSON output to stdout; informational messages move to stderr
- `--quiet` — suppress progress text
- `--testnet` — point at `api.testnets.relay.link`
- `--api-url <url>` / `--api-key <key>` — override
- `--log-level <0-4>` — SDK verbosity

## Exit codes

- `0` success
- `1` runtime / SDK / HTTP error
- `2` bad flags or missing required env var
- `130` user declined the confirmation prompt

## Limitations

- v1 covers EVM, Solana, and Bitcoin. Sui / Tron / Lighter / Ton are not wired up yet.
- Operator-side APIs (app fees, fast fill, gasless batch) and onramp flows are out of scope.
- No keystore, no hardware-wallet/WalletConnect. Keys come from env vars — handle accordingly.
