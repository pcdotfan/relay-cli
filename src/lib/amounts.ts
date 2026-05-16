import { parseUnits, formatUnits } from 'viem'
import { errBadInput } from './errors.js'

export function parseAmount(value: string, decimals: number): string {
  if (!/^\d*\.?\d+$/.test(value)) {
    throw errBadInput(`Invalid amount: ${value}`)
  }
  try {
    return parseUnits(value, decimals).toString()
  } catch (e) {
    throw errBadInput(`Failed to parse amount '${value}' with ${decimals} decimals`, e)
  }
}

export function formatAmount(
  baseUnits: string | bigint | undefined,
  decimals: number | undefined,
  symbol?: string,
  maxFractionDigits = 6
): string {
  if (baseUnits === undefined || baseUnits === null || decimals === undefined) {
    return symbol ? `? ${symbol}` : '?'
  }
  try {
    const bi = typeof baseUnits === 'bigint' ? baseUnits : BigInt(baseUnits)
    const raw = formatUnits(bi, decimals)
    const trimmed = trimDecimals(raw, maxFractionDigits)
    return symbol ? `${trimmed} ${symbol}` : trimmed
  } catch {
    return symbol ? `${baseUnits} ${symbol}` : String(baseUnits)
  }
}

function trimDecimals(value: string, maxFractionDigits: number): string {
  const [intPart, fracPart = ''] = value.split('.')
  if (!fracPart) return intPart!
  const truncated = fracPart.slice(0, maxFractionDigits).replace(/0+$/, '')
  return truncated ? `${intPart}.${truncated}` : intPart!
}
