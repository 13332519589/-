import {ContextManager, SQLiteStore} from '../src/index.js';
const store=new SQLiteStore(':memory:');
const manager=new ContextManager(store);
await manager.ingestMessage({id:'msg_1',conversationId:'demo',role:'user',text:'我的目标是考A大学。',timestamp:new Date().toISOString()});
await manager.ingestMessage({id:'msg_2',conversationId:'demo',role:'user',text:'我改成B大学了。',timestamp:new Date().toISOString()});
console.log(manager.buildPromptContext({conversationId:'demo',text:'我的目标是什么？'}));
console.log(manager.inspectMemory().map(m=>({content:m.content,status:m.status})));
store.close();
