import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ContextManager} from '../core/contextManager.js';
import {SQLiteStore} from '../storage/database.js';
import {registerContextTools} from './tools.js';
export type IdentityMode='trusted-local'|'authenticated-remote';
export function createMcpServer(manager:ContextManager,options:{identityMode:IdentityMode}={identityMode:'trusted-local'}){const server=new McpServer({name:'context-state-manager',version:'0.2.0'},{maxToolInputElements:100});registerContextTools(server,manager,options.identityMode);return server;}
export async function startStdioServer(manager=new ContextManager(new SQLiteStore(process.env.CONTEXT_DB_PATH??'context.sqlite'))){const server=createMcpServer(manager,{identityMode:'trusted-local'});await server.connect(new StdioServerTransport());return server;}
if(process.argv[1]?.endsWith('/mcp/server.js'))await startStdioServer();
