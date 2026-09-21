const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { io } = require('socket.io-client');
const { AppModule } = require('../apps/api/dist/app.module');
const { PrismaService } = require('../apps/api/dist/prisma/prisma.service');

// Isolated test doubles verify transport/auth/lifecycle; not PostgreSQL persistence.
const users = [{ id:'alice',username:'alice' },{ id:'bob',username:'bob' },{ id:'outsider',username:'outsider' }];
const records = [];
const directRecords = [];
const db = {
  user: { findUnique:async({where})=>users.find(u=>u.id===where.id) },
  channel: {
    findUnique:async({where})=>['text','other','voice'].includes(where.id)?{id:where.id,serverId:'friends',type:where.id==='voice'?'VOICE':'TEXT'}:null,
    findFirst:async({where})=>['text','other','voice'].includes(where.id)&&where.serverId==='friends'?{id:where.id}:null,
  },
  role: {
    // Permission checks intentionally fall back to legacy-role defaults in this transport test.
    findUnique:async()=>null,
    // server:join in v0.5 ensures managed roles exist before returning its member snapshot.
    upsert:async({where,create})=>({
      id:`managed-${where.serverId_legacyRole.legacyRole.toLowerCase()}`,
      serverId:where.serverId_legacyRole.serverId,
      legacyRole:where.serverId_legacyRole.legacyRole,
      name:create.name,
      color:create.color ?? null,
      position:create.position,
      permissions:create.permissions ?? [],
      isManaged:true,
    }),
    findMany:async({where})=>where.serverId==='friends'?[{
      id:'managed-member',serverId:'friends',legacyRole:'MEMBER',name:'Member',color:null,
      position:0,permissions:[],isManaged:true,
    }]:[],
  },
  serverMember: {
    findUnique:async({where})=>where.serverId_userId.serverId==='friends'&&['alice','bob'].includes(where.serverId_userId.userId)?{id:'member',role:'MEMBER'}:null,
    findMany:async({where})=>where.userId
      ? (where.userId==='outsider'?[]:[{serverId:'friends'}])
      : users.slice(0,2).map((user,index)=>({
          id:`member-${user.id}`,userId:user.id,serverId:'friends',user,role:'MEMBER',
          joinedAt:new Date(1700000000000+index).toISOString(),roleLinks:[],
        })),
  },
  message: {
    create:async({data})=>{const record={...data,id:`m${records.length}`,createdAt:new Date().toISOString(),author:users.find(u=>u.id===data.authorId)};records.push(record);return record;},
    findMany:async({where,orderBy,take})=>{const list=records.filter(m=>m.channelId===where.channelId);return orderBy[0].createdAt==='desc'?list.slice().reverse().slice(0,take):list.slice(0,take);},
  },
  friendship:{findMany:async()=>[]},
  directMessageMember:{
    findUnique:async({where})=>where.conversationId_userId.conversationId==='dm'&&['alice','bob'].includes(where.conversationId_userId.userId)?{id:'dm-member'}:null,
    findMany:async({where})=>where.conversationId==='dm'?[{userId:'alice'},{userId:'bob'}]:[],
  },
  directMessage:{
    create:async({data})=>{const record={...data,id:`dm${directRecords.length}`,createdAt:new Date().toISOString(),author:users.find(u=>u.id===data.authorId)};directRecords.push(record);return record;},
    findMany:async({where,orderBy,take})=>{const list=directRecords.filter(m=>m.conversationId===where.conversationId);return orderBy[0].createdAt==='desc'?list.slice().reverse().slice(0,take):list.slice(0,take);},
  },
  directMessageConversation:{update:async()=>({})},
};
let app,base,jwt;
const sockets=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function event(socket,name,filter=()=>true,timeout=6000){return new Promise((resolve,reject)=>{const listener=data=>{if(filter(data)){clearTimeout(timer);socket.off(name,listener);resolve(data)}};const timer=setTimeout(()=>{socket.off(name,listener);reject(new Error(`Timed out: ${name}`))},timeout);socket.on(name,listener)})}
async function connect(user,token){const socket=io(`${base}/chat`,{autoConnect:false,forceNew:true,reconnection:false,auth:{token:token||jwt.sign({sub:user,username:user})}});sockets.push(socket);const ready=event(socket,'connect');socket.connect();await ready;return socket;}
const ack=(socket,name,data)=>socket.timeout(5000).emitWithAck(name,data);
async function send(user,channel,content){return fetch(`${base}/api/channels/${channel}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({sub:user,username:user})}`},body:JSON.stringify({content})});}
async function sendDm(user,conversationId,content){return fetch(`${base}/api/dms/${conversationId}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({sub:user,username:user})}`},body:JSON.stringify({content})});}
before(async()=>{
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PrismaService).useValue(db).compile();
  app=module.createNestApplication();app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
  await app.listen(0,'127.0.0.1');base=await app.getUrl();jwt=module.get(JwtService);
});
after(async()=>{for(const s of sockets)s.disconnect();await app?.close()});

test('authenticated clients receive exactly one stored message; channel isolation and reconnect',async()=>{
 const a=await connect('alice'),b=await connect('bob');
 assert.equal((await ack(a,'channel:join',{channelId:'text'})).ok,true);
 assert.equal((await ack(b,'channel:join',{channelId:'text'})).ok,true);
 let delivered=0;b.on('message:new',()=>delivered++);
 const arrival=event(b,'message:new');
 const response=await send('alice','text','First line\nSecond line');assert.equal(response.status,201);
 const m=await arrival;assert.equal(m.content,'First line\nSecond line');assert.equal(records.length,1);
 await delay(80);assert.equal(delivered,1);
 await ack(b,'channel:join',{channelId:'other'});await send('alice','text','private to channel');await delay(80);assert.equal(delivered,1);
 b.disconnect();await send('alice','text','missed offline');const ready=event(b,'connect');b.connect();await ready;await ack(b,'channel:join',{channelId:'text'});
 const history=await fetch(`${base}/api/channels/text/messages`,{headers:{Authorization:`Bearer ${jwt.sign({sub:'bob',username:'bob'})}`}}).then(r=>r.json());
 assert.equal(history.at(-1).content,'missed offline');a.disconnect();b.disconnect();
});
test('typing expires without stop event and clears on leave/disconnect',async()=>{
 const a=await connect('alice'),b=await connect('bob');await ack(a,'channel:join',{channelId:'text'});await ack(b,'channel:join',{channelId:'text'});
 let arrival=event(b,'typing',d=>d.typing);a.emit('typing',{channelId:'text',typing:true});assert.equal((await arrival).username,'alice');
 await event(b,'typing',d=>!d.typing,4500);
 arrival=event(b,'typing',d=>d.typing);a.emit('typing',{channelId:'text',typing:true});await arrival;
 let stopped=event(b,'typing',d=>!d.typing);await ack(a,'channel:leave');await stopped;
 await ack(a,'channel:join',{channelId:'text'});await delay(550);arrival=event(b,'typing',d=>d.typing);a.emit('typing',{channelId:'text',typing:true});await arrival;stopped=event(b,'typing',d=>!d.typing);a.disconnect();await stopped;b.disconnect();
});
test('presence counts multiple connections and scoped snapshots',async()=>{
 const observer=await connect('bob');await ack(observer,'server:join',{serverId:'friends'});
 let update=event(observer,'presence:update',d=>d.userId==='alice'&&d.online);const a=await connect('alice');await update;const second=await connect('alice');
 const snapshot=await ack(observer,'server:join',{serverId:'friends'});assert.equal(snapshot.members.find(m=>m.id==='alice').online,true);
 a.disconnect();await delay(80);assert.equal((await ack(observer,'server:join',{serverId:'friends'})).members.find(m=>m.id==='alice').online,true);
 update=event(observer,'presence:update',d=>d.userId==='alice'&&!d.online);second.disconnect();await update;
 const outsider=await connect('outsider');assert.equal((await ack(outsider,'server:join',{serverId:'friends'})).ok,false);outsider.disconnect();observer.disconnect();
});
test('invalid/expired JWTs rejected; outsiders, malformed IDs and voice sends denied',async()=>{
 for(const token of ['invalid',jwt.sign({sub:'alice',username:'alice'},{expiresIn:-1}),jwt.sign({sub:'deleted',username:'deleted'}),jwt.sign({sub:'alice',username:'alice',v:1})]){
  const socket=io(`${base}/chat`,{autoConnect:false,reconnection:false,auth:{token}});sockets.push(socket);const rejected=event(socket,'connect_error');socket.connect();await rejected;assert.equal(socket.connected,false);socket.disconnect();
 }
 const outsider=await connect('outsider');assert.equal((await ack(outsider,'channel:join',{channelId:'text'})).ok,false);
 assert.equal((await ack(outsider,'channel:join',{channelId:{bad:true}})).ok,false);
 assert.equal((await send('outsider','text','forbidden')).status,403);
 assert.equal((await send('alice','voice','forbidden')).status,403);
 assert.equal((await send('alice','text','   ')).status,400);
 assert.equal((await send('alice','text','x'.repeat(4001))).status,400);outsider.disconnect();
});
test('long history returns newest 100, chronological, after reconnect',async()=>{
 for(let i=0;i<110;i++)records.push({id:`history${i}`,channelId:'other',authorId:'alice',author:users[0],content:`history ${i}`,createdAt:new Date(1700000000000+i).toISOString()});
 const history=await fetch(`${base}/api/channels/other/messages`,{headers:{Authorization:`Bearer ${jwt.sign({sub:'alice',username:'alice'})}`}}).then(r=>r.json());
 assert.equal(history.length,100);assert.equal(history[0].content,'history 10');assert.equal(history.at(-1).content,'history 109');
});

test('direct-message rooms enforce membership and deliver realtime messages/typing',async()=>{
 const a=await connect('alice'),b=await connect('bob'),outsider=await connect('outsider');
 assert.equal((await ack(a,'dm:join',{conversationId:'dm'})).ok,true);assert.equal((await ack(b,'dm:join',{conversationId:'dm'})).ok,true);assert.equal((await ack(outsider,'dm:join',{conversationId:'dm'})).ok,false);
 const arrival=event(b,'dm:new');const response=await sendDm('alice','dm','hello dm');assert.equal(response.status,201);assert.equal((await arrival).content,'hello dm');
 const typing=event(b,'dm:typing',data=>data.typing);a.emit('dm:typing',{conversationId:'dm',typing:true});assert.equal((await typing).username,'alice');
 assert.equal((await sendDm('outsider','dm','nope')).status,403);a.disconnect();b.disconnect();outsider.disconnect();
});
