import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ContextManager} from '../core/contextManager.js';
import {SQLiteStore} from '../storage/database.js';
import {registerContextTools} from './tools.js';
export function createMcpServer(manager:ContextManager){const server=new McpServer({name:'context-state-manager',version:'0.2.0'},{maxToolInputElements:100});registerContextTools(server,manager);return server;}
export async function startStdioServer(manager=new ContextManager(new SQLiteStore(process.env.CONTEXT_DB_PATH??'context.sqlite'))){const server=createMcpServer(manager);await server.connect(new StdioServerTransport());return server;}
if(process.argv[1]?.endsWith('/mcp/server.js'))await startStdioServer();
