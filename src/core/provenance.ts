import type { MemoryItem, State } from '../models/schema.js';
export function verifyMemorySource(memory:MemoryItem,state:State){
  const evidence=state.messages.filter(m=>memory.sourceMessageIds.includes(m.id));
  const supported=evidence.length===memory.sourceMessageIds.length && evidence.every(m=>m.conversationId===memory.conversationId && m.text.includes(memory.quote) && memory.content===memory.quote);
  const userSupported=supported && evidence.every(m=>m.role==='user');
  return {supported,userSupported,evidence};
}
