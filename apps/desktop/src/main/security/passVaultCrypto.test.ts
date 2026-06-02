import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  type KdfParams,
  createVerifier,
  decryptField,
  deriveVaultKey,
  encryptField,
  exportVault,
  fieldAad,
  generatePassphrase,
  generatePassword,
  generateRecoveryCode,
  generateSalt,
  importVault,
  normalizeRecoveryCode,
  unwrapVaultKey,
  verifyVerifier,
  wrapVaultKey,
} from './passVaultCrypto'
import { PASSPHRASE_WORDLIST } from './passVaultWordlist'

// Parametres scrypt alleges : on teste les PROPRIETES (determinisme, authentification), pas le
// cout. Inutile de payer ~250 ms par derivation reelle.
const CHEAP_PARAMS: KdfParams = {
  algo: 'scrypt',
  N: 1 << 10,
  r: 8,
  p: 1,
  keyLength: 32,
  version: 1,
}

describe('deriveVaultKey', () => {
  it('est deterministe pour un meme mot de passe et un meme sel', async () => {
    const salt = generateSalt()
    const a = await deriveVaultKey('mot-de-passe-maitre', salt, CHEAP_PARAMS)
    const b = await deriveVaultKey('mot-de-passe-maitre', salt, CHEAP_PARAMS)
    expect(a).toHaveLength(32)
    expect(a.equals(b)).toBe(true)
  })

  it('produit des cles differentes avec des sels differents', async () => {
    const a = await deriveVaultKey('identique', generateSalt(), CHEAP_PARAMS)
    const b = await deriveVaultKey('identique', generateSalt(), CHEAP_PARAMS)
    expect(a.equals(b)).toBe(false)
  })

  it('normalise le mot de passe en NFKC (formes Unicode equivalentes -> meme cle)', async () => {
    const salt = generateSalt()
    // 'e' + accent combinant (NFD) vs 'e accent precompose' (NFC) -> doivent converger.
    const decomposed = 'café'
    const composed = 'café'
    const a = await deriveVaultKey(decomposed, salt, CHEAP_PARAMS)
    const b = await deriveVaultKey(composed, salt, CHEAP_PARAMS)
    expect(a.equals(b)).toBe(true)
  })
})

describe('encryptField / decryptField', () => {
  const key = randomBytes(32)
  const aad = fieldAad('entry-1', 'password')

  it('round-trip : dechiffre exactement ce qui a ete chiffre', () => {
    const blob = encryptField(key, 's3cr3t-p@ss', aad)
    expect(decryptField(key, blob, aad)).toBe('s3cr3t-p@ss')
  })

  it('produit un ciphertext different a chaque appel (IV aleatoire)', () => {
    expect(encryptField(key, 'meme-valeur', aad)).not.toBe(encryptField(key, 'meme-valeur', aad))
  })

  it('leve avec une mauvaise cle', () => {
    const blob = encryptField(key, 'secret', aad)
    expect(() => decryptField(randomBytes(32), blob, aad)).toThrow()
  })

  it('leve si l AAD differe (anti-deplacement de blob)', () => {
    const blob = encryptField(key, 'secret', fieldAad('entry-1', 'password'))
    expect(() => decryptField(key, blob, fieldAad('entry-2', 'password'))).toThrow()
    expect(() => decryptField(key, blob, fieldAad('entry-1', 'notes'))).toThrow()
  })

  it('leve si le blob est altere', () => {
    const blob = encryptField(key, 'secret', aad)
    const raw = Buffer.from(blob, 'base64')
    raw[raw.length - 1] = raw.readUInt8(raw.length - 1) ^ 0xff // corrompt l authTag
    expect(() => decryptField(key, raw.toString('base64'), aad)).toThrow()
  })
})

describe('verificateur de mot de passe maitre', () => {
  it('valide la bonne cle et rejette les autres sans lever', () => {
    const good = randomBytes(32)
    const verifier = createVerifier(good)
    expect(verifyVerifier(good, verifier)).toBe(true)
    expect(verifyVerifier(randomBytes(32), verifier)).toBe(false)
  })
})

describe('generatePassword', () => {
  it('respecte la longueur demandee', () => {
    expect(generatePassword({ length: 32, lowercase: true, digits: true })).toHaveLength(32)
  })

  it('n utilise que les classes demandees', () => {
    const pwd = generatePassword({ length: 64, digits: true })
    expect(pwd).toMatch(/^[0-9]+$/)
  })

  it('exclut les caracteres ambigus quand demande', () => {
    const pwd = generatePassword({ length: 200, digits: true, excludeAmbiguous: true })
    expect(pwd).not.toMatch(/[01]/)
  })

  it('leve si aucune classe de caracteres n est activee', () => {
    expect(() => generatePassword({ length: 16 })).toThrow()
  })
})

describe('generatePassphrase', () => {
  const wordSet = new Set(PASSPHRASE_WORDLIST)

  it('genere le nombre de mots demande', () => {
    expect(generatePassphrase({ words: 5, separator: '-' }).split('-')).toHaveLength(5)
  })

  it('respecte le separateur', () => {
    expect(generatePassphrase({ words: 4, separator: '.' }).split('.')).toHaveLength(4)
  })

  it('ajoute un groupe numerique quand demande', () => {
    const parts = generatePassphrase({ words: 3, separator: '-', includeNumber: true }).split('-')
    expect(parts).toHaveLength(4)
    expect(parts[parts.length - 1] ?? '').toMatch(/^[0-9]{3}$/)
  })

  it('ne tire que des mots de la wordlist', () => {
    for (const word of generatePassphrase({ words: 8, separator: ' ' }).split(' ')) {
      expect(wordSet.has(word.toLowerCase())).toBe(true)
    }
  })
})

describe('code de recuperation', () => {
  const alphabet = new Set('23456789ABCDEFGHJKMNPQRSTVWXYZ')

  it('genere un code de 5 groupes de 5 caracteres de l alphabet', () => {
    const groups = generateRecoveryCode().split('-')
    expect(groups).toHaveLength(5)
    for (const group of groups) {
      expect(group).toHaveLength(5)
      for (const ch of group) {
        expect(alphabet.has(ch)).toBe(true)
      }
    }
  })

  it('normalise la saisie (tirets, espaces, casse)', () => {
    expect(normalizeRecoveryCode('ab3-cd 4e')).toBe('AB3CD4E')
  })

  it('wrap puis unwrap restitue la cle du coffre', () => {
    const wrappingKey = randomBytes(32)
    const vaultKey = randomBytes(32)
    const wrapped = wrapVaultKey(wrappingKey, vaultKey)
    expect(unwrapVaultKey(wrappingKey, wrapped).equals(vaultKey)).toBe(true)
  })

  it('unwrap echoue avec une mauvaise cle d enrobage', () => {
    const wrapped = wrapVaultKey(randomBytes(32), randomBytes(32))
    expect(() => unwrapVaultKey(randomBytes(32), wrapped)).toThrow()
  })
})

describe('sauvegarde chiffree', () => {
  it('export puis import restitue le contenu', async () => {
    const json = JSON.stringify({ entries: [{ id: '1', title: 'Banque' }] })
    const file = await exportVault(json, 'mot-de-passe-export')
    expect(await importVault(file, 'mot-de-passe-export')).toBe(json)
  })

  it('import echoue avec un mauvais mot de passe', async () => {
    const file = await exportVault('{}', 'bon-mot-de-passe')
    await expect(importVault(file, 'mauvais-mot-de-passe')).rejects.toThrow()
  })
})
