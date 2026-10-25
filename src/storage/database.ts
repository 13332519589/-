import { DatabaseSync } from 'node:sqlite';
import type { State } from '../models/schema.js';
export interface MemoryStore { read():State; transaction<T>(work:(draft:State)=>T):T; close():void }
const initial = ():State => ({messages:[],memories:[],events:[],pendingVectorDeletes:[],longTermEnabled:false});
export class InMemoryStore implements MemoryStore {
  private state = initial();
  read(){return structuredClone(this.state)}
  transaction<T>(work:(draft:State)=>T):T { const draft=this.read(); const result=work(draft); this.state=draft; return structuredClone(result); }
  close(){}
}
// A single atomic aggregate keeps raw evidence, transitions and audit events consistent.
// Replace this adapter with normalized PostgreSQL tables for high-volume workloads.
export class SQLiteStore implements MemoryStore {
  private db:DatabaseSync;
  constructor(path:string){ this.db=new DatabaseSync(path); this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS context_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)'); this.db.prepare('INSERT OR IGNORE INTO context_state VALUES(1,?)').run(JSON.stringify(initial())); }
  read():State { return JSON.parse((this.db.prepare('SELECT payload FROM context_state WHERE id=1').get() as {payload:string}).payload); }
  transaction<T>(work:(draft:State)=>T):T { this.db.exec('BEGIN IMMEDIATE'); try {const draft=this.read(); const result=work(draft); this.db.prepare('UPDATE context_state SET payload=? WHERE id=1').run(JSON.stringify(draft)); this.db.exec('COMMIT'); return structuredClone(result);} catch(e){this.db.exec('ROLLBACK'); throw e;} }
  close(){this.db.close()}
}
// External indexes are optional accelerators, never authoritative; deletion must be idempotent.
export interface VectorProvider { search(query:string,allowedIds:string[],limit:number):Promise<{id:string;score:number}[]>; delete(ids:string[]):Promise<void> }
export interface EmbeddingProvider { embed(texts:string[]):Promise<number[][]> }
