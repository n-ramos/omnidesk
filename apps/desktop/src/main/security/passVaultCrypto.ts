import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from 'node:crypto'
import { PASSPHRASE_WORDLIST } from './passVaultWordlist'

// Primitives cryptographiques PURES du coffre omniPass (zero-knowledge). Aucun import Electron :
// ce module est testable en isolation (Node pur). La cle du coffre est DERIVEE du mot de passe
// maitre via scrypt (KDF memoire-dur, natif Node -> zero dependance native) ; les champs sont
// chiffres en AES-256-GCM avec cette cle. Sans le mot de passe maitre, rien n'est dechiffrable,
// meme si la base ET le trousseau OS fuient.
//
// Limite assumee (impossible a contourner sans add-on natif) : les `string` JavaScript sont
// immuables et restent dans le tas V8 jusqu'au passage du ramasse-miettes ; on ne peut purger
// (fill 0) que les Buffer. Un attaquant disposant d'un acces memoire au process deverrouille
// peut donc lire les secrets en clair -- c'est vrai de tout gestionnaire de mots de passe.

// --- Parametres KDF (OWASP 2023 pour scrypt : N >= 2^17, r = 8, p = 1) ---
const SCRYPT_N = 1 << 17 // 131072 : cout CPU/memoire (~128 Mo, ~250 ms).
const SCRYPT_R = 8
const SCRYPT_P = 1

// maxmem DOIT couvrir 128 * N * r (= 128 Mo ici) + la marge interne d'OpenSSL, sinon scrypt
// leve "memory limit exceeded" (defaut = 32 Mo). On prend une marge a 192 Mo.
const SCRYPT_MAXMEM = 192 * 1024 * 1024

export const KEY_LENGTH = 32 // AES-256
export const SALT_LENGTH = 16 // 128 bits
const IV_LENGTH = 12 // GCM standard (96 bits)
const AUTH_TAG_LENGTH = 16 // 128 bits

// Constante temoin chiffree pour le verificateur. Doit rester STABLE a vie (sinon coffres KO).
const VERIFIER_PLAINTEXT = Buffer.from('omnipass:verifier:v1', 'utf8')

// Parametres KDF serialises en base (pass_vault.kdf_params), versionnes pour pouvoir durcir N
// plus tard sans casser les coffres existants.
export interface KdfParams {
  algo: 'scrypt'
  N: number
  r: number
  p: number
  keyLength: number
  version: 1
}

// Options du generateur. Type local (le module ne depend pas de @shared) ; structurellement
// compatible avec PassPasswordGenOptions de models.ts -> le service le passe tel quel.
export interface PasswordGenOptions {
  length: number
  lowercase?: boolean
  uppercase?: boolean
  digits?: boolean
  symbols?: boolean
  excludeAmbiguous?: boolean
}

export const getDefaultKdfParams = (): KdfParams => ({
  algo: 'scrypt',
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  keyLength: KEY_LENGTH,
  version: 1,
})

export const generateSalt = (): Buffer => randomBytes(SALT_LENGTH)

// Wrapper Promise autour de scrypt natif : execute dans le threadpool libuv, NE BLOQUE PAS le
// thread principal (contrairement a scryptSync). Typage exact via la surcharge a options.
const deriveScrypt = (password: Buffer, salt: Buffer, params: KdfParams): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      params.keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },
      (error, derivedKey) => {
        if (error) {
          reject(error)
        } else {
          resolve(derivedKey)
        }
      },
    )
  })

// Derive la cle du coffre (32 o) depuis le mot de passe maitre + sel. Normalise en NFKC pour
// qu'une meme saisie (accents/composition Unicode) produise toujours la meme cle. Le mot de
// passe est copie en Buffer puis purge (fill 0) des la derivation terminee.
export const deriveVaultKey = async (
  masterPassword: string,
  salt: Buffer,
  params: KdfParams,
): Promise<Buffer> => {
  if (params.algo !== 'scrypt') {
    throw new Error(`Unsupported KDF algo: ${params.algo}`)
  }
  const password = Buffer.from(masterPassword.normalize('NFKC'), 'utf8')
  try {
    return await deriveScrypt(password, salt, params)
  } finally {
    password.fill(0)
  }
}

// --- Chiffrement de champ (AES-256-GCM) ---
// Format de stockage : base64( iv[12] || ciphertext || authTag[16] ). L'AAD (donnee
// authentifiee mais non chiffree) n'est PAS stockee : elle est recalculee au dechiffrement
// (cf. fieldAad). Elle lie chaque blob a son entree+champ : un attaquant ayant un acces en
// ecriture a la base ne peut pas deplacer un blob d'une ligne/colonne a une autre.
const encryptRaw = (key: Buffer, plaintext: Buffer, aad: Buffer): string => {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH })
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64')
}

const decryptRaw = (key: Buffer, blobB64: string, aad: Buffer): Buffer => {
  const blob = Buffer.from(blobB64, 'base64')
  if (blob.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext blob too short')
  }
  const iv = blob.subarray(0, IV_LENGTH)
  const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH)
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - AUTH_TAG_LENGTH)
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAAD(aad)
  decipher.setAuthTag(authTag)
  // final() leve si l'authTag est invalide (mauvaise cle, blob ou AAD altere).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// AAD canonique d'un champ : "<id de l'entree>:<nom du champ>".
export const fieldAad = (recordId: string, field: string): Buffer =>
  Buffer.from(`${recordId}:${field}`, 'utf8')

export const encryptField = (vaultKey: Buffer, plaintext: string, aad: Buffer): string =>
  encryptRaw(vaultKey, Buffer.from(plaintext, 'utf8'), aad)

// Dechiffre un champ. Leve si la cle est fausse ou la donnee corrompue/alteree.
export const decryptField = (vaultKey: Buffer, blobB64: string, aad: Buffer): string => {
  const out = decryptRaw(vaultKey, blobB64, aad)
  try {
    return out.toString('utf8')
  } finally {
    out.fill(0)
  }
}

// --- Verificateur de mot de passe maitre ---
// On chiffre une constante temoin avec la cle derivee. Au deverrouillage, on re-derive une cle
// candidate et on tente de dechiffrer : l'echec d'authentification GCM = mauvais mot de passe.
const VERIFIER_AAD = Buffer.from('omnipass:verifier', 'utf8')

export const createVerifier = (vaultKey: Buffer): string =>
  encryptRaw(vaultKey, VERIFIER_PLAINTEXT, VERIFIER_AAD)

// Retourne true/false ; ne leve PAS sur mauvais mot de passe (echec attendu). La comparaison
// finale est timing-safe par principe (la verification du tag GCM l'est deja par construction).
export const verifyVerifier = (vaultKey: Buffer, verifierB64: string): boolean => {
  let decrypted: Buffer
  try {
    decrypted = decryptRaw(vaultKey, verifierB64, VERIFIER_AAD)
  } catch {
    return false
  }
  return (
    decrypted.length === VERIFIER_PLAINTEXT.length &&
    timingSafeEqual(decrypted, VERIFIER_PLAINTEXT)
  )
}

// --- Generateur de mot de passe ---
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{}:;,.?'
const AMBIGUOUS = 'O0oIl1|`'

const pick = (alphabet: string): string => alphabet.charAt(randomInt(0, alphabet.length))

// Utilise crypto.randomInt (rejection sampling integre -> aucun biais de modulo). Garantit au
// moins un caractere de chaque classe demandee (si la longueur le permet), puis melange.
export const generatePassword = (options: PasswordGenOptions): string => {
  const removeAmbiguous = (alphabet: string): string =>
    options.excludeAmbiguous ? [...alphabet].filter((c) => !AMBIGUOUS.includes(c)).join('') : alphabet

  const pools: string[] = []
  if (options.lowercase) pools.push(removeAmbiguous(LOWERCASE))
  if (options.uppercase) pools.push(removeAmbiguous(UPPERCASE))
  if (options.digits) pools.push(removeAmbiguous(DIGITS))
  if (options.symbols) pools.push(removeAmbiguous(SYMBOLS))

  const activePools = pools.filter((pool) => pool.length > 0)
  if (activePools.length === 0) {
    throw new Error('Empty character pool')
  }

  const length = Math.max(1, Math.floor(options.length))
  const everything = activePools.join('')
  const chars: string[] = []

  for (const pool of activePools) {
    if (chars.length < length) {
      chars.push(pick(pool))
    }
  }
  while (chars.length < length) {
    chars.push(pick(everything))
  }

  // Melange de Fisher-Yates (les premieres positions ne sont pas figees sur une classe donnee).
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1)
    const ci = chars[i]
    const cj = chars[j]
    if (ci !== undefined && cj !== undefined) {
      chars[i] = cj
      chars[j] = ci
    }
  }

  return chars.join('')
}

export interface PassphraseGenOptions {
  words: number
  separator?: string
  capitalize?: boolean
  includeNumber?: boolean
}

// Genere une phrase secrete : `words` mots tires de la wordlist embarquee (via randomInt, sans
// biais), joints par un separateur. Options : capitaliser chaque mot, ajouter un groupe numerique.
export const generatePassphrase = (options: PassphraseGenOptions): string => {
  const count = Math.max(1, Math.floor(options.words))
  const separator = options.separator ?? '-'
  const parts: string[] = []
  for (let i = 0; i < count; i += 1) {
    let word = PASSPHRASE_WORDLIST[randomInt(0, PASSPHRASE_WORDLIST.length)] ?? ''
    if (options.capitalize) {
      word = word.charAt(0).toUpperCase() + word.slice(1)
    }
    parts.push(word)
  }
  if (options.includeNumber) {
    parts.push(String(randomInt(0, 1000)).padStart(3, '0'))
  }
  return parts.join(separator)
}

// --- Code de recuperation (M3) ---
// Alphabet base32 sans caracteres ambigus (0/1/I/L/O/U exclus). 5 groupes de 5 => 25 caracteres,
// ~122 bits d'entropie. Le code est une 2e voie d'acces (a conserver hors ligne).
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_AAD = Buffer.from('omnipass:recovery', 'utf8')
const EXPORT_AAD = Buffer.from('omnipass:export:v1', 'utf8')

export const generateRecoveryCode = (): string => {
  const groups: string[] = []
  for (let group = 0; group < 5; group += 1) {
    let chunk = ''
    for (let i = 0; i < 5; i += 1) {
      chunk += RECOVERY_ALPHABET.charAt(randomInt(0, RECOVERY_ALPHABET.length))
    }
    groups.push(chunk)
  }
  return groups.join('-')
}

// Tolere la saisie (tirets, espaces, minuscules) avant derivation.
export const normalizeRecoveryCode = (code: string): string => code.toUpperCase().replace(/[^0-9A-Z]/g, '')

// Enveloppe / desenveloppe la cle du coffre (32 o) avec une cle d'enrobage (derivee du code de
// recuperation). AES-256-GCM, AAD fixe. Le wrap stocke la cle base64 chiffree.
export const wrapVaultKey = (wrappingKey: Buffer, vaultKey: Buffer): string =>
  encryptField(wrappingKey, vaultKey.toString('base64'), RECOVERY_AAD)

export const unwrapVaultKey = (wrappingKey: Buffer, wrappedB64: string): Buffer =>
  Buffer.from(decryptField(wrappingKey, wrappedB64, RECOVERY_AAD), 'base64')

// --- Sauvegarde chiffree (M3) ---
// Exporte un JSON clair (entrees + dossiers dechiffres) re-chiffre par une cle derivee d'un mot de
// passe d'export (nouveau sel). Fichier autonome, versionne. Async (scrypt).
interface ExportEnvelope {
  v: 1
  kdf: KdfParams
  salt: string
  blob: string
}

export const exportVault = async (plainJson: string, exportPassword: string): Promise<string> => {
  const salt = generateSalt()
  const params = getDefaultKdfParams()
  const key = await deriveVaultKey(exportPassword, salt, params)
  try {
    const envelope: ExportEnvelope = {
      v: 1,
      kdf: params,
      salt: salt.toString('base64'),
      blob: encryptField(key, plainJson, EXPORT_AAD),
    }
    return JSON.stringify(envelope)
  } finally {
    key.fill(0)
  }
}

export const importVault = async (fileContent: string, exportPassword: string): Promise<string> => {
  let envelope: ExportEnvelope
  try {
    envelope = JSON.parse(fileContent) as ExportEnvelope
  } catch {
    throw new Error('Invalid backup file')
  }
  if (envelope.v !== 1 || !envelope.kdf || !envelope.salt || !envelope.blob) {
    throw new Error('Invalid backup file')
  }
  const key = await deriveVaultKey(exportPassword, Buffer.from(envelope.salt, 'base64'), envelope.kdf)
  try {
    return decryptField(key, envelope.blob, EXPORT_AAD)
  } finally {
    key.fill(0)
  }
}
