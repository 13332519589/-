import {createHash, timingSafeEqual} from 'node:crypto';
export interface Principal{principalId:string;tenantId:string;userId:string}
export interface AuthProvider{authenticate(header:string|undefined):Principal}
export class BearerTokenAuth implements AuthProvider{
 constructor(private token=process.env.CONTEXT_MCP_TOKEN,private production=process.env.NODE_ENV==='production'){}
 authenticate(header:string|undefined){
  if(!this.token){if(this.production)throw new Error('Authentication is not configured');return {principalId:'development',tenantId:'development',userId:'development'};}
  const supplied=header?.match(/^Bearer\s+(.+)$/i)?.[1];if(!supplied||supplied.length!==this.token.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(this.token)))throw new Error('Unauthorized');
  const id=createHash('sha256').update(supplied).digest('hex').slice(0,24);return {principalId:`token:${id}`,tenantId:`token:${id}`,userId:`token:${id}`};
 }
}
