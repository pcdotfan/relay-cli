import {
  createWalletClient,
  http,
  type WalletClient,
  type Chain as ViemChain
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  Connection,
  Keypair,
  type VersionedTransaction
} from '@solana/web3.js'
import bs58 from 'bs58'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from 'tiny-secp256k1'
import { ECPairFactory } from 'ecpair'
import { adaptSolanaWallet } from '@relayprotocol/relay-svm-wallet-adapter'
import { adaptBitcoinWallet } from '@relayprotocol/relay-bitcoin-wallet-adapter'
import type { AdaptedWallet, RelayChain } from '@relayprotocol/relay-sdk'
import { errMissingEnv, RelayCliError } from './errors.js'

bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)

export type Signer =
  | { kind: 'evm'; wallet: WalletClient; address: `0x${string}` }
  | { kind: 'svm'; wallet: AdaptedWallet; address: string }
  | { kind: 'bvm'; wallet: AdaptedWallet; address: string }

const EVM_ENV = 'RELAY_EVM_PRIVATE_KEYS'
const SVM_ENV = 'RELAY_SOLANA_PRIVATE_KEYS'
const BVM_ENV = 'RELAY_BITCOIN_PRIVATE_KEYS'
const EVM_ENV_LEGACY = 'RELAY_EVM_PRIVATE_KEY'
const SVM_ENV_LEGACY = 'RELAY_SOLANA_PRIVATE_KEY'
const BVM_ENV_LEGACY = 'RELAY_BITCOIN_PRIVATE_KEY'

export async function buildSignerForChain(
  chain: RelayChain,
  account?: string
): Promise<Signer> {
  switch (chain.vmType) {
    case 'evm':
      return buildEvmSigner(chain, account)
    case 'svm':
      return buildSolanaSigner(chain, account)
    case 'bvm':
      return buildBitcoinSigner(account)
    default:
      throw new RelayCliError({
        message: `Unsupported chain vmType '${chain.vmType ?? 'unknown'}' for chain ${chain.displayName}`,
        code: 'unsupported_vm',
        exitCode: 2
      })
  }
}

export function getEvmAddresses(): `0x${string}`[] {
  return readKeys(EVM_ENV, EVM_ENV_LEGACY).map(
    (k) => privateKeyToAccount(normalizeHexKey(k)).address
  )
}

export function getSolanaAddresses(): string[] {
  return readKeys(SVM_ENV, SVM_ENV_LEGACY).map((k) =>
    parseSolanaKeypair(k).publicKey.toBase58()
  )
}

export function getBitcoinAddresses(): string[] {
  return readKeys(BVM_ENV, BVM_ENV_LEGACY).map((k) => deriveBitcoinAddress(k))
}

function buildEvmSigner(chain: RelayChain, accountFilter?: string): Signer {
  const keys = readKeys(EVM_ENV, EVM_ENV_LEGACY)
  if (keys.length === 0) throw errMissingEnv(EVM_ENV)

  const candidates = keys.map((k) => privateKeyToAccount(normalizeHexKey(k)))
  const account = pickEvm(candidates, accountFilter)

  if (!chain.viemChain) {
    throw new RelayCliError({
      message: `Chain ${chain.displayName} has no viem chain config`,
      code: 'chain_config'
    })
  }

  const rpcUrl = pickEvmRpcUrl(chain)
  const walletClient = createWalletClient({
    account,
    chain: chain.viemChain as ViemChain,
    transport: rpcUrl ? http(rpcUrl) : http()
  })

  return { kind: 'evm', wallet: walletClient, address: account.address }
}

function buildSolanaSigner(chain: RelayChain, accountFilter?: string): Signer {
  const keys = readKeys(SVM_ENV, SVM_ENV_LEGACY)
  if (keys.length === 0) throw errMissingEnv(SVM_ENV)

  const candidates = keys.map((k) => parseSolanaKeypair(k))
  const keypair = pickSolana(candidates, accountFilter)
  const address = keypair.publicKey.toBase58()

  const rpcUrl =
    process.env.RELAY_SOLANA_RPC_URL ??
    chain.httpRpcUrl ??
    'https://api.mainnet-beta.solana.com'
  const connection = new Connection(rpcUrl, { commitment: 'confirmed' })

  const signAndSend = async (transaction: VersionedTransaction) => {
    transaction.sign([keypair])
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, maxRetries: 5 }
    )
    return { signature }
  }

  const adapted = adaptSolanaWallet(address, chain.id, connection, signAndSend)
  return { kind: 'svm', wallet: adapted, address }
}

function buildBitcoinSigner(accountFilter?: string): Signer {
  const keys = readKeys(BVM_ENV, BVM_ENV_LEGACY)
  if (keys.length === 0)
    throw errMissingEnv(BVM_ENV, 'Provide WIF-encoded mainnet private key(s).')

  const candidates = keys.map((k) => ECPair.fromWIF(k, bitcoin.networks.bitcoin))
  const keyPair = pickBitcoin(candidates, accountFilter)
  const pubkey = Buffer.from(keyPair.publicKey)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey,
    network: bitcoin.networks.bitcoin
  })
  if (!address) throw new RelayCliError({ message: 'Failed to derive BTC P2WPKH address' })

  const signer = {
    publicKey: pubkey,
    sign: (hash: Buffer) => Buffer.from(keyPair.sign(hash))
  }

  const signPsbt = async (
    _addr: string,
    psbt: bitcoin.Psbt
  ): Promise<string> => {
    psbt.signAllInputs(signer)
    return psbt.toBase64()
  }

  const adapted = adaptBitcoinWallet(address, signPsbt, pubkey.toString('hex'))
  return { kind: 'bvm', wallet: adapted, address }
}

function pickEvm(
  accounts: ReturnType<typeof privateKeyToAccount>[],
  filter?: string
) {
  if (!filter) return accounts[0]!
  const lower = filter.toLowerCase()
  const match = accounts.find((a) => a.address.toLowerCase() === lower)
  if (!match) {
    throw notFound(
      filter,
      accounts.map((a) => a.address),
      'EVM'
    )
  }
  return match
}

function pickSolana(keypairs: Keypair[], filter?: string) {
  if (!filter) return keypairs[0]!
  const match = keypairs.find((k) => k.publicKey.toBase58() === filter)
  if (!match) {
    throw notFound(
      filter,
      keypairs.map((k) => k.publicKey.toBase58()),
      'Solana'
    )
  }
  return match
}

function pickBitcoin(
  ecPairs: ReturnType<typeof ECPair.fromWIF>[],
  filter?: string
) {
  if (!filter) return ecPairs[0]!
  const match = ecPairs.find((kp) => {
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(kp.publicKey),
      network: bitcoin.networks.bitcoin
    })
    return address === filter
  })
  if (!match) {
    const all = ecPairs.map((kp) => {
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(kp.publicKey),
        network: bitcoin.networks.bitcoin
      })
      return address ?? '?'
    })
    throw notFound(filter, all, 'Bitcoin')
  }
  return match
}

function notFound(filter: string, available: string[], label: string) {
  return new RelayCliError({
    message: `--account ${filter} not found in ${label} keys. Available: ${available.join(', ')}`,
    code: 'account_not_found',
    exitCode: 2
  })
}

function readKeys(primary: string, legacy: string): string[] {
  const raw = process.env[primary] ?? process.env[legacy]
  if (!raw) return []
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
}

function deriveBitcoinAddress(wif: string): string {
  const keyPair = ECPair.fromWIF(wif, bitcoin.networks.bitcoin)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: bitcoin.networks.bitcoin
  })
  if (!address)
    throw new RelayCliError({ message: 'Failed to derive Bitcoin P2WPKH address' })
  return address
}

function pickEvmRpcUrl(chain: RelayChain): string | undefined {
  const override = process.env[`RELAY_RPC_URL_${chain.id}`]
  if (override) return override
  return chain.httpRpcUrl
}

function normalizeHexKey(raw: string): `0x${string}` {
  const trimmed = raw.trim()
  const withPrefix = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new RelayCliError({
      message: `${EVM_ENV} entry must be a 32-byte hex string (with or without 0x prefix).`,
      code: 'bad_env',
      exitCode: 2
    })
  }
  return withPrefix as `0x${string}`
}

function parseSolanaKeypair(raw: string): Keypair {
  const trimmed = raw.trim()
  let secret: Uint8Array
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed) as number[]
      secret = Uint8Array.from(arr)
    } catch (e) {
      throw new RelayCliError({
        message: `${SVM_ENV}: invalid JSON byte array`,
        code: 'bad_env',
        exitCode: 2,
        cause: e
      })
    }
  } else {
    try {
      secret = bs58.decode(trimmed)
    } catch (e) {
      throw new RelayCliError({
        message: `${SVM_ENV}: invalid base58 secret key`,
        code: 'bad_env',
        exitCode: 2,
        cause: e
      })
    }
  }
  if (secret.length !== 64) {
    throw new RelayCliError({
      message: `${SVM_ENV}: expected 64-byte secret key, got ${secret.length} bytes`,
      code: 'bad_env',
      exitCode: 2
    })
  }
  return Keypair.fromSecretKey(secret)
}
