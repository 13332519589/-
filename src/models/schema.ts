import { z } from 'zod';
export const MessageSchema = z.object({
  id: z.string().min(1), conversationId: z.string().min(1), projectId: z.string().optional(),
  role: z.enum(['user','assistant','tool']), text: z.string(), timestamp: z.iso.datetime(),
  attachments: z.array(z.string()).default([]), toolCall: z.record(z.string(),z.unknown()).optional()
});
export type Message = z.infer<typeof MessageSchema>;
export const Kind = z.enum(['confirmed_fact','user_preference','user_goal','decision','task_state','assistant_inference','assistant_claim','hypothesis','uncertain','temporary_context']);
export const CandidateSchema = z.object({
  type: Kind, subject: z.string().min(1), content: z.string().min(1),
  // Evidence must be a verbatim span. Normalized semantic claims require an independently trusted verifier.
  quote: z.string().min(1), scope: z.enum(['conversation','project','long_term']).default('conversation'),
  temporalStability: z.enum(['stable','semi_stable','dynamic','temporary']).default('dynamic'),
  operation: z.enum(['assert','correct','deny']).default('assert'), targetIds: z.array(z.string()).default([])
});
export type Candidate = z.infer<typeof CandidateSchema>;
export const MemorySchema = CandidateSchema.omit({operation:true,targetIds:true}).extend({
  id:z.string(), conversationId:z.string(), projectId:z.string().optional(),
  sourceMessageIds:z.array(z.string()).min(1), confidence:z.number().min(0).max(1), importance:z.number().min(0).max(1),
  status:z.enum(['active','superseded','contradicted','archived','invalid']),
  createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),validFrom:z.iso.datetime(),lastConfirmedAt:z.iso.datetime().optional(),
  supersedes:z.array(z.string()),contradictedBy:z.array(z.string())
});
export type MemoryItem = z.infer<typeof MemorySchema>;
export interface AuditEvent { id:string; kind:string; memoryIds:string[]; messageId?:string; timestamp:string; reason:string }
export interface State { messages:Message[]; memories:MemoryItem[]; events:AuditEvent[]; pendingVectorDeletes:string[]; longTermEnabled:boolean }
export interface Query { conversationId:string; projectId?:string; text:string; limit?:number; now?:string }
export interface ContextEntry { memory:MemoryItem; evidence:Message[]; stale:boolean }
export interface ContextPackage { currentGoal:ContextEntry[]; confirmedFacts:ContextEntry[]; preferences:ContextEntry[]; projectState:ContextEntry[]; decisions:ContextEntry[]; uncertainties:ContextEntry[]; conflicts:ContextEntry[]; recentMessages:Message[] }
