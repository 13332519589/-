import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CandidateSchema, MessageSchema, MemorySchema, type Candidate, type MemoryItem, type Message, type State, type Query, type ContextPackage } from '../models/schema.js';
import type { MemoryStore, VectorProvider } from '../storage/database.js';
import { RuleExtractor, type ContextExtractor } from './extractor.js';
import { verifyMemorySource } from './provenance.js';
import { detectConflict, sameDomain } from './conflictDetector.js';
import { visible, relevance, isStale } from './relevance.js';
import { generateWorkingSummary, buildPromptContext } from './summarizer.js';
const userKinds=new Set(['confirmed_fact','user_preference','user_goal','decision','task_state']);
export function classifyMemory(c:Candidate,m:Message):MemoryItem['type'] {return m.role==='user'?c.type:(c.type==='assistant_inference'?'assistant_inference':'assistant_claim')}
export class ContextManager {
  constructor(readonly store:MemoryStore,private extractor:ContextExtractor=new RuleExtractor(),private vector?:VectorProvider){}
  private audit(s:State,kind:string,ids:string[],reason:string,message?:Message){s.events.push({id:randomUUID(),kind,memoryIds:ids,reason,messageId:message?.id,timestamp:message?.timestamp??new Date().toISOString()})}
  async ingestMessage(input:unknown){
    const m=MessageSchema.parse(input);
    const prior=this.store.read().messages.find(x=>x.id===m.id);
    if(prior){if(JSON.stringify(prior)!==JSON.stringify(m))throw Error('Message ID collision');return []}
    const candidates=z.array(CandidateSchema).max(50).parse(await this.extractor.extractContext(m));
    return this.store.transaction(s=>{
      const duplicate=s.messages.find(x=>x.id===m.id);
      if(duplicate){if(JSON.stringify(duplicate)!==JSON.stringify(m))throw Error('Message ID collision');return []}
      s.messages.push(m); this.audit(s,'message_ingested',[],'Raw message retained',m);
      // Bare denial can only refer to the immediately preceding assistant turn.
      if(m.role==='user' && /^(不是[，,。 ]*)?(我没说过|我没有说过)(这个|这个。|[。！!])?$/.test(m.text)){
        const previous=s.messages.filter(x=>x.conversationId===m.conversationId && x.id!==m.id).at(-1);
        if(previous?.role==='assistant')for(const old of s.memories.filter(x=>x.sourceMessageIds.includes(previous.id))){old.status='invalid';old.updatedAt=m.timestamp;this.audit(s,'memory_correction',[old.id],'user_denied',m)}
      }
      return candidates.map(c=>this.commitCandidate(s,c,m));
    });
  }
  private commitCandidate(s:State,c:Candidate,m:Message){
    if(!m.text.includes(c.quote) || c.content!==c.quote)throw Error('Unsupported evidence: content must equal verbatim quote');
    if(c.scope==='long_term' && !s.longTermEnabled)throw Error('Long-term memory disabled');
    if(c.scope==='project' && !m.projectId)throw Error('Project scope requires projectId');
    const type=classifyMemory(c,m), confirmed=m.role==='user' && userKinds.has(type);
    const item=MemorySchema.parse({...c,type,id:randomUUID(),conversationId:m.conversationId,projectId:m.projectId,sourceMessageIds:[m.id],confidence:confirmed?1:m.role==='user'?.7:.5,importance:['user_goal','task_state','decision'].includes(type)?.95:type==='temporary_context'?.1:.65,status:'active',createdAt:m.timestamp,updatedAt:m.timestamp,validFrom:m.timestamp,lastConfirmedAt:confirmed?m.timestamp:undefined,supersedes:[],contradictedBy:[]});
    const existing=s.memories.filter(x=>sameDomain(x,item) && ['active','contradicted'].includes(x.status));
    const explicitCorrection=m.role==='user' && /改成|改目标|改为|更正|纠正|不再|现在.*目标/.test(c.quote);
    // Model-supplied operation/IDs cannot authorize a state transition.
    if(confirmed)for(const old of existing.filter(x=>userKinds.has(x.type) && detectConflict(x,item))){
      if(explicitCorrection && Date.parse(m.timestamp)>=Date.parse(old.updatedAt)){
        old.status='superseded';old.updatedAt=m.timestamp;item.supersedes.push(old.id);this.audit(s,'memory_superseded',[old.id,item.id],'Explicit user correction',m);
      }else{old.status='contradicted';old.updatedAt=m.timestamp;item.status='contradicted';old.contradictedBy.push(item.id);item.contradictedBy.push(old.id);this.audit(s,'conflict_detected',[old.id,item.id],'Different assertions; no explicit correction',m)}
    }
    s.memories.push(item);this.audit(s,'memory_stored',[item.id],`Verbatim ${m.role} evidence; classified ${type}; confidence ${item.confidence}`,m);return item;
  }
  verifyMemorySource(id:string){const s=this.store.read();const m=s.memories.find(x=>x.id===id);if(!m)throw Error('Unknown memory');return verifyMemorySource(m,s)}
  // Explicit corrections are routed through ingestion, preserving evidence and the audit transaction.
  storeMemory(message:unknown){return this.ingestMessage(message)}
  async extractContext(input:unknown){const m=MessageSchema.parse(input);return z.array(CandidateSchema).parse(await this.extractor.extractContext(m))}
  updateMemory(message:unknown){return this.ingestMessage(message)}
  supersedeMemory(message:unknown){return this.ingestMessage(message)}
  invalidateMemory(id:string,correctionMessageId:string){
    this.store.transaction(s=>{const item=s.memories.find(x=>x.id===id),m=s.messages.find(x=>x.id===correctionMessageId);if(!item||!m||m.role!=='user'||m.conversationId!==item.conversationId||!m.text.includes(item.quote)||!/没说过|没有说过|不正确|错误/.test(m.text))throw Error('Explicit targeted user denial required');item.status='invalid';item.updatedAt=m.timestamp;this.audit(s,'memory_correction',[id],'user_denied',m)});
  }
  retrieveRelevantContext(q:Query):ContextPackage {
    const s=this.store.read(),now=q.now??new Date().toISOString();const limit=Math.max(1,Math.min(q.limit??12,50));
    const ranked=s.memories.filter(m=>visible(m,q)&&(m.scope!=='long_term'||s.longTermEnabled)&&['active','contradicted'].includes(m.status)&&relevance(m,q)>0).sort((a,b)=>relevance(b,q)-relevance(a,q));
    const selected=ranked.slice(0,limit);
    // Include the other side of selected conflicts; never silently hide a competing version.
    for(const m of [...selected])for(const id of m.contradictedBy){const peer=ranked.find(x=>x.id===id);if(peer&&!selected.includes(peer))selected.push(peer)}
    const p:ContextPackage={currentGoal:[],confirmedFacts:[],preferences:[],projectState:[],decisions:[],uncertainties:[],conflicts:[],recentMessages:s.messages.filter(m=>m.conversationId===q.conversationId).slice(-6)};
    for(const memory of selected){const proof=verifyMemorySource(memory,s);if(!proof.supported)continue; const entry={memory,evidence:proof.evidence,stale:isStale(memory,now)};
      if(memory.status==='contradicted')p.conflicts.push(entry);
      else if(!proof.userSupported||entry.stale||!userKinds.has(memory.type))p.uncertainties.push(entry);
      else (({user_goal:p.currentGoal,user_preference:p.preferences,task_state:p.projectState,decision:p.decisions,confirmed_fact:p.confirmedFacts} as Partial<Record<MemoryItem["type"],ContextPackage["currentGoal"]>>)[memory.type]??p.uncertainties).push(entry);
    }
    return p;
  }
  generateWorkingSummary(q:Query){return generateWorkingSummary(this.retrieveRelevantContext(q))}
  buildPromptContext(q:Query){const p=this.retrieveRelevantContext(q);this.store.transaction(s=>this.audit(s,'prompt_built',Object.values(p).flat().filter((x):x is ContextPackage['currentGoal'][number]=>'memory' in x).map(x=>x.memory.id),'Context selected with verified raw evidence'));return buildPromptContext(p)}
  setLongTermEnabled(enabled:boolean){this.store.transaction(s=>{s.longTermEnabled=enabled;this.audit(s,'privacy_setting',[],`Long-term enabled: ${enabled}`)})}
  inspectMemory(){return this.store.read().memories}
  exportMemory(){return this.store.read()}
  async deleteMemory(id:string){await this.deleteWhere(m=>m.id===id)}
  async deleteConversation(id:string){await this.deleteWhere(m=>m.conversationId===id,id)}
  async flushPendingDeletes(){const ids=this.store.read().pendingVectorDeletes;if(!ids.length)return;if(this.vector)await this.vector.delete(ids);this.store.transaction(s=>{s.pendingVectorDeletes=s.pendingVectorDeletes.filter(id=>!ids.includes(id))})}
  private async deleteWhere(predicate:(m:MemoryItem)=>boolean,conversationId?:string){
    // Revoke authoritative access first; a failing external deletion is surfaced for retry.
    const ids=this.store.transaction(s=>{const ids=s.memories.filter(predicate).map(m=>m.id);s.pendingVectorDeletes=[...new Set([...s.pendingVectorDeletes,...ids])];s.memories=s.memories.filter(m=>!ids.includes(m.id));if(conversationId)s.messages=s.messages.filter(m=>m.conversationId!==conversationId);s.events=s.events.filter(e=>!e.memoryIds.some(id=>ids.includes(id))&&(!conversationId||!e.messageId||s.messages.some(m=>m.id===e.messageId)));return ids});
    await this.flushPendingDeletes();
  }
}
