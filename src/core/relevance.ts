import type { MemoryItem, Query } from '../models/schema.js';
export function visible(m:MemoryItem,q:Query){return m.scope==='long_term' || (m.scope==='project'?!!q.projectId && q.projectId===m.projectId:q.conversationId===m.conversationId)}
function tokens(s:string){return new Set(s.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g)??[])}
export function relevance(m:MemoryItem,q:Query){const a=tokens(q.text),b=tokens(m.subject+m.content); const overlap=[...a].filter(t=>b.has(t)).length; return overlap?overlap/Math.max(a.size,1)+m.importance*.1:0}
export function isStale(m:MemoryItem,now:string){const days={stable:Infinity,semi_stable:180,dynamic:90,temporary:1}[m.temporalStability];return Date.parse(now)-Date.parse(m.lastConfirmedAt??m.createdAt)>days*86400000}
