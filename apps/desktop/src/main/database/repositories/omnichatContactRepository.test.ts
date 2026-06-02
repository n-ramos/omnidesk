import Database from 'libsql'
import type BetterSqlite3 from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { schemaSql } from '../schema'
import { OmnichatContactRepository } from './omnichatContactRepository'

// libsql expose une API synchrone compatible better-sqlite3 (prepare/run/get/all/exec) ;
// on instancie une base :memory: et on applique le schema complet, puis on cast vers le
// type attendu par le repository (qui n'utilise que ce sous-ensemble commun).
const makeRepo = (): OmnichatContactRepository => {
  const db = new Database(':memory:')
  db.exec(schemaSql)
  return new OmnichatContactRepository(db as unknown as BetterSqlite3.Database)
}

describe('OmnichatContactRepository', () => {
  let repo: OmnichatContactRepository

  beforeEach(() => {
    repo = makeRepo()
  })

  it('normalise l identifiant (lowercase + trim) et trim le pseudo a l ajout', () => {
    const added = repo.add('  ABCD-1234  ', '  Alice  ')
    expect(added).toMatchObject({ id: 'abcd-1234', pseudo: 'Alice' })
    expect(added.addedAt).toEqual(expect.any(String))
    // get est insensible a la casse (meme normalisation).
    expect(repo.get('ABCD-1234')).toMatchObject({ id: 'abcd-1234', pseudo: 'Alice' })
  })

  it('met a jour le pseudo sur conflit d identifiant, sans dupliquer (idempotent)', () => {
    repo.add('id-1', 'Bob')
    repo.add('ID-1', 'Bobby') // meme identifiant (case-insensitive), nouveau pseudo
    const all = repo.list()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ id: 'id-1', pseudo: 'Bobby' })
  })

  it('liste les contacts tries par pseudo (insensible a la casse)', () => {
    repo.add('id-c', 'charlie')
    repo.add('id-a', 'Alice')
    repo.add('id-b', 'bob')
    expect(repo.list().map((contact) => contact.pseudo)).toEqual(['Alice', 'bob', 'charlie'])
  })

  it('updatePseudo modifie le libelle, remove supprime la ligne', () => {
    repo.add('id-x', 'X')
    repo.updatePseudo('ID-X', 'Xavier')
    expect(repo.get('id-x')?.pseudo).toBe('Xavier')

    repo.remove('ID-X')
    expect(repo.get('id-x')).toBeUndefined()
    expect(repo.list()).toHaveLength(0)
  })
})
