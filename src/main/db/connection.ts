import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { DDL } from './schema'

export interface SaveDb {
  db: BetterSQLite3Database
  raw: Database.Database
  close: () => void
}

/** Abre (ou cria) um save SQLite em modo WAL e aplica o DDL idempotente. */
export function openSaveDb(filePath: string): SaveDb {
  mkdirSync(dirname(filePath), { recursive: true })
  const raw = new Database(filePath)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  raw.exec(DDL)
  const db = drizzle(raw)
  return { db, raw, close: () => raw.close() }
}
