import type {MemoryItem,Relation} from '../models/schema.js';
export function sameDomain(a:MemoryItem,b:MemoryItem){return a.subject===b.subject&&a.scope===b.scope&&(a.scope==='long_term'||(a.scope==='project'?a.projectId===b.projectId:a.conversationId===b.conversationId))}
const norm=(m:MemoryItem)=>(m.normalizedContent??m.content).toLowerCase();
export function classifyRelation(oldM:MemoryItem,newM:MemoryItem):Relation{
 if(!sameDomain(oldM,newM))return 'INDEPENDENT'; const a=norm(oldM),b=norm(newM); if(a===b)return 'SAME';
 if((b.includes(a)||a.includes(b)||/方向|阶段|phase/i.test(b))&&!( /改成|改为|改目标|不再|更正|纠正|其实不|不是/.test(b)))return 'EXTENDS';
 if(/改成|改为|改目标|现在.*目标|还是|更正|纠正/.test(b))return 'SUPERSEDES';
 if(/不喜欢|不是|没有|不再|错误|不对/.test(b))return 'CONTRADICTS';
 return 'UNCERTAIN';
}
export function detectConflict(a:MemoryItem,b:MemoryItem){const r=classifyRelation(a,b);return r==='CONTRADICTS'||r==='SUPERSEDES'||r==='UNCERTAIN'}
