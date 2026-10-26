import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {ContextManager} from '../core/contextManager.js';
export function createContextServer(manager:ContextManager){
 const json=(res:ServerResponse,status:number,data:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
 const body=async(req:IncomingMessage)=>{let b='';for await(const c of req)b+=c;return b?JSON.parse(b):{}};
 return createServer(async(req,res)=>{try{const u=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`),parts=u.pathname.split('/').filter(Boolean);
 if(req.method==='POST'&&parts[0]==='messages')return json(res,200,await manager.ingestMessage(await body(req)));
 if(req.method==='GET'&&parts[0]==='context')return json(res,200,manager.retrieveRelevantContext({conversationId:u.searchParams.get('conversationId')??'',text:u.searchParams.get('q')??''}));
 if(req.method==='GET'&&parts[0]==='memories')return json(res,200,manager.inspectMemory());
 if(req.method==='POST'&&parts[0]==='memories'&&parts[2]==='correct'){const b=await body(req);await manager.ingestMessage(b.message);return json(res,200,manager.explainMemory(parts[1]!));}
 if(req.method==='DELETE'&&parts[0]==='memories'){await manager.deleteMemory(parts[1]!);return json(res,204,{});}
 if(req.method==='DELETE'&&parts[0]==='conversations'){await manager.deleteConversation(parts[1]!);return json(res,204,{});}
 if(req.method==='POST'&&parts[0]==='context'&&parts[1]==='build'){const b=await body(req);return json(res,200,{prompt:manager.buildPromptContext(b)});}
 return json(res,404,{error:'not_found'});}catch(e){return json(res,400,{error:e instanceof Error?e.message:'bad_request'});}});
}
