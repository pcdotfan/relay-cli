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

export async function buildSignerForChain(chain: RelayChain): Promise<Signer> {
  switch (chain.vmType) {
    case 'evm':
      return buildEvmSigner(chain)
    case 'svm':
      return buildSolanaSigner(chain)
    case 'bvm':
      return buildBitcoinSigner()
    default:
      throw new RelayCliError({
        message: `Unsupported chain vmType '${chain.vmType ?? 'unknown'}' for chain ${chain.displayName}`,
        code: 'unsupported_vm',
        exitCode: 2
      })
  }
}

export function getEvmAddress(): `0x${string}` {
  const key = process.env.RELAY_EVM_PRIVATE_KEY
  if (!key) throw errMissingEnv('RELAY_EVM_PRIVATE_KEY')
  return privateKeyToAccount(normalizeHexKey(key)).address
}

export function getSolanaAddress(): string {
  const key = process.env.RELAY_SOLANA_PRIVATE_KEY
  if (!key) throw errMissingEnv('RELAY_SOLANA_PRIVATE_KEY')
  return parseSolanaKeypair(key).publicKey.toBase58()
}

export function getBitcoinAddress(): string {
  const key = process.env.RELAY_BITCOIN_PRIVATE_KEY
  if (!key)
    throw errMissingEnv(
      'RELAY_BITCOIN_PRIVATE_KEY',
      'Provide a WIF-encoded mainnet private key.'
    )
  const keyPair = ECPair.fromWIF(key, bitcoin.networks.bitcoin)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: bitcoin.networks.bitcoin
  })
  if (!address) throw new RelayCliError({ message: 'Failed to derive Bitcoin P2WPKH address' })
  return address
}

function buildEvmSigner(chain: RelayChain): Signer {
  const key = process.env.RELAY_EVM_PRIVATE_KEY
  if (!key) throw errMissingEnv('RELAY_EVM_PRIVATE_KEY')
  const account = privateKeyToAccount(normalizeHexKey(key))

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

function buildSolanaSigner(chain: RelayChain): Signer {
  const key = process.env.RELAY_SOLANA_PRIVATE_KEY
  if (!key) throw errMissingEnv('RELAY_SOLANA_PRIVATE_KEY')

  const keypair = parseSolanaKeypair(key)
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

function buildBitcoinSigner(): Signer {
  const key = process.env.RELAY_BITCOIN_PRIVATE_KEY
  if (!key)
    throw errMissingEnv(
      'RELAY_BITCOIN_PRIVATE_KEY',
      'Provide a WIF-encoded mainnet private key.'
    )

  const keyPair = ECPair.fromWIF(key, bitcoin.networks.bitcoin)
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
      message: 'RELAY_EVM_PRIVATE_KEY must be a 32-byte hex string (with or without 0x prefix).',
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
        message: 'RELAY_SOLANA_PRIVATE_KEY: invalid JSON byte array',
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
        message: 'RELAY_SOLANA_PRIVATE_KEY: invalid base58 secret key',
        code: 'bad_env',
        exitCode: 2,
        cause: e
      })
    }
  }
  if (secret.length !== 64) {
    throw new RelayCliError({
      message: `RELAY_SOLANA_PRIVATE_KEY: expected 64-byte secret key, got ${secret.length} bytes`,
      code: 'bad_env',
      exitCode: 2
    })
  }
  return Keypair.fromSecretKey(secret)
}
