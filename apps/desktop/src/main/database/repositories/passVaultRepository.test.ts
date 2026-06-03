import Database from 'libsql'
import type BetterSqlite3 from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { schemaSql } from '../schema'
import { PassVaultRepository } from './passVaultRepository'

// Base libsql :memory: + schema complet (meme pattern que omnichatContactRepository.test).
// La ligne id = 1 doit exister pour que les UPDATE de setBiometricWrapped portent.
const makeRepo = (): PassVaultRepository => {
  const db = new Database(':memory:')
  db.exec(schemaSql)
  const repo = new PassVaultRepository(db as unknown as BetterSqlite3.Database)
  repo.initialize({ saltB64: 'c2FsdA==', paramsJson: '{}', verifierB64: 'dmVyaWZpZXI=' })
  return repo
}

describe('PassVaultRepository.setBiometricWrapped', () => {
  let repo: PassVaultRepository

  beforeEach(() => {
    repo = makeRepo()
  })

  it('stocke puis relit le blob biometrique', () => {
    repo.setBiometricWrapped('V1JBUFBFRA==')
    expect(repo.getBiometricWrapped()).toBe('V1JBUFBFRA==')
  })

  // Regression du DMG signe (passvault:biometric-unlock) : quand safeStorage.decryptString echoue,
  // l'auto-reparation appelle setBiometricWrapped(null). libsql route un argument UNIQUE vers le
  // binding par parametres nommes des que typeof === 'object' ; comme typeof null === 'object',
  // `.run(null)` jetait "failed to downcast any to object" et masquait le message de repli.
  it('efface le blob sans jeter quand on passe null (lone-null libsql)', () => {
    repo.setBiometricWrapped('V1JBUFBFRA==')
    expect(() => repo.setBiometricWrapped(null)).not.toThrow()
    expect(repo.getBiometricWrapped()).toBeNull()
  })

  it('peut re-stocker un blob apres un effacement', () => {
    repo.setBiometricWrapped('QQ==')
    repo.setBiometricWrapped(null)
    repo.setBiometricWrapped('Qg==')
    expect(repo.getBiometricWrapped()).toBe('Qg==')
  })
})
