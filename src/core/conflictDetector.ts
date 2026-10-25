import type { MemoryItem } from '../models/schema.js';
export function sameDomain(a:MemoryItem,b:MemoryItem){return a.subject===b.subject && a.scope===b.scope && (a.scope==='long_term' || (a.scope==='project'?a.projectId===b.projectId:a.conversationId===b.conversationId))}
export function detectConflict(a:MemoryItem,b:MemoryItem){return sameDomain(a,b) && a.content!==b.content && ['active','contradicted'].includes(a.status)}
