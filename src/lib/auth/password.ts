/**
 * Hashing de contrasenas (brief seccion 55).
 * scrypt de node:crypto — sin dependencias nativas, con sal por usuario
 * y comparacion en tiempo constante.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const PREFIX = 'scrypt'

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return `${PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [prefix, saltHex, hashHex] = stored.split('$')
  if (prefix !== PREFIX || !saltHex || !hashHex) return false
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH)
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(derived, expected)
}

/** Requisitos minimos de contrasena para altas y restablecimientos. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.'
  if (!/[a-z]/.test(password)) return 'La contraseña debe incluir una minúscula.'
  if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir una mayúscula.'
  if (!/\d/.test(password)) return 'La contraseña debe incluir un número.'
  return null
}
