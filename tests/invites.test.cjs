const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { AppModule } = require('../apps/api/dist/app.module');
const { PrismaService } = require('../apps/api/dist/prisma/prisma.service');

const users = [
  { id:'alice',username:'alice',displayName:null,avatarUrl:null },
  { id:'bob',username:'bob',displayName:null,avatarUrl:null },
  { id:'charlie',username:'charlie',displayName:null,avatarUrl:null },
  { id:'outsider',username:'outsider',displayName:null,avatarUrl:null },
];
const server = { id:'friends',name:'Friends',iconUrl:null,ownerId:'alice',createdAt:new Date('2026-01-01') };
let seq = 0;
const members = new Map([
  ['friends:alice',{id:'ma',serverId:'friends',userId:'alice',role:'OWNER',joinedAt:new Date('2026-01-01')}],
  ['friends:bob',{id:'mb',serverId:'friends',userId:'bob',role:'MEMBER',joinedAt:new Date('2026-01-02')}],
]);
const invites = new Map();
const bans = new Map();
const messages = [];
const auditLogs = [];
function membership(serverId,userId){return members.get(`${serverId}:${userId}`)||null}
function decorateInvite(invite){return {...invite,creator:users.find(u=>u.id===invite.creatorId),server:{...server,_count:{members:[...members.values()].filter(m=>m.serverId==='friends').length}}}}
const db = {
  $transaction: async fn => fn(db),
  user:{findUnique:async({where})=>users.find(u=>u.id===where.id)||null},
  server:{
    findUnique:async({where})=>where.id==='friends'?server:null,
    findMany:async()=>[],
  },
  serverMember:{
    findUnique:async({where,select})=>{
      const member=membership(where.serverId_userId.serverId,where.serverId_userId.userId);
      if(!member)return null;
      if(select?.user){
        const user=users.find(u=>u.id===member.userId)||null;
        return {...member,user};
      }
      return member;
    },
    findMany:async({where})=>[...members.values()].filter(m=>m.serverId===where.serverId).map(m=>({role:m.role,joinedAt:m.joinedAt,user:users.find(u=>u.id===m.userId)})),
    create:async({data})=>{const row={id:`member-${++seq}`,joinedAt:new Date(),...data};members.set(`${data.serverId}:${data.userId}`,row);return row},
    delete:async({where})=>{const entry=[...members.entries()].find(([,m])=>m.id===where.id);if(entry)members.delete(entry[0]);return entry?.[1]},
  },
  serverAuditLog:{
    create:async({data})=>{const row={id:`audit-${++seq}`,createdAt:new Date(),...data};auditLogs.push(row);return row},
    findMany:async({where})=>auditLogs.filter(row=>row.serverId===where.serverId),
  },
  serverBan:{
    findUnique:async({where})=>bans.get(`${where.serverId_userId.serverId}:${where.serverId_userId.userId}`)||null,
    upsert:async({where,create,update})=>{const key=`${where.serverId_userId.serverId}:${where.serverId_userId.userId}`;const row=bans.get(key)||{id:`ban-${++seq}`,createdAt:new Date(),...create};Object.assign(row,update||{});bans.set(key,row);return row},
    findMany:async({where})=>[...bans.values()].filter(row=>row.serverId===where.serverId).map(row=>({...row,user:users.find(u=>u.id===row.userId)})),
    deleteMany:async({where})=>{const key=`${where.serverId}:${where.userId}`;const existed=bans.delete(key);return{count:existed?1:0}},
  },
  invite:{
    create:async({data})=>{const row={id:`invite-${++seq}`,useCount:0,revokedAt:null,createdAt:new Date(),...data};invites.set(row.id,row);return decorateInvite(row)},
    findUnique:async({where})=>{const row=where.code?[...invites.values()].find(i=>i.code===where.code):invites.get(where.id);return row?decorateInvite(row):null},
    findFirst:async({where})=>{const row=invites.get(where.id);return row&&row.serverId===where.serverId?row:null},
    findMany:async({where})=>[...invites.values()].filter(i=>i.serverId===where.serverId).sort((a,b)=>b.createdAt-a.createdAt).map(decorateInvite),
    update:async({where,data})=>{const row=invites.get(where.id);Object.assign(row,data);return row},
    updateMany:async({where,data})=>{const row=invites.get(where.id);if(!row||row.useCount!==where.useCount||row.revokedAt!==null)return{count:0};row.useCount+=data.useCount.increment;return{count:1}},
  },
  channel:{
    findUnique:async({where})=>where.id==='text'?{id:'text',serverId:'friends',type:'TEXT'}:null,
    findMany:async({where})=>where.serverId==='friends'?[{id:'text'}]:[],
  },
  message:{
    findMany:async({where})=>messages.filter(m=>m.channelId===where.channelId),
    create:async({data})=>{const row={id:`msg-${++seq}`,createdAt:new Date(),updatedAt:new Date(),...data,author:users.find(u=>u.id===data.authorId)};messages.push(row);return row},
  },
};
let app,base,jwt;
const authHeader=user=>({Authorization:`Bearer ${jwt.sign({sub:user,username:user})}`,'Content-Type':'application/json'});
async function json(path,{user='alice',method='GET',body}={}){return fetch(`${base}/api${path}`,{method,headers:authHeader(user),body:body===undefined?undefined:JSON.stringify(body)})}
function seedInvite(overrides={}){const row={id:`seed-${++seq}`,code:`code-${seq}`,serverId:'friends',creatorId:'alice',expiresAt:null,maxUses:null,useCount:0,revokedAt:null,createdAt:new Date(),...overrides};invites.set(row.id,row);return row}
before(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PrismaService).useValue(db).compile();app=module.createNestApplication();app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');base=await app.getUrl();jwt=module.get(JwtService)});
after(async()=>{await app?.close()});

test('valid invite joins a new member',async()=>{members.delete('friends:charlie');const created=await json('/servers/friends/invites',{method:'POST',body:{expiresInHours:24,maxUses:5}});assert.equal(created.status,201);const invite=await created.json();const joined=await json(`/invites/${invite.code}/join`,{user:'charlie',method:'POST'});assert.equal(joined.status,201);assert.ok(membership('friends','charlie'));assert.equal(invites.get(invite.id).useCount,1)});
test('invalid invite is rejected',async()=>{const response=await json('/invites/does-not-exist/join',{user:'outsider',method:'POST'});assert.equal(response.status,404)});
test('expired invite is rejected',async()=>{const invite=seedInvite({expiresAt:new Date(Date.now()-1000)});const response=await json(`/invites/${invite.code}/join`,{user:'outsider',method:'POST'});assert.equal(response.status,400)});
test('revoked invite is rejected',async()=>{const invite=seedInvite({revokedAt:new Date()});const response=await json(`/invites/${invite.code}/join`,{user:'outsider',method:'POST'});assert.equal(response.status,400)});
test('max-use invite is rejected when exhausted',async()=>{const invite=seedInvite({maxUses:1,useCount:1});const response=await json(`/invites/${invite.code}/join`,{user:'outsider',method:'POST'});assert.equal(response.status,400)});
test('duplicate membership is rejected',async()=>{const invite=seedInvite();const response=await json(`/invites/${invite.code}/join`,{user:'bob',method:'POST'});assert.equal(response.status,409)});
test('normal member can leave server',async()=>{if(!membership('friends','bob'))members.set('friends:bob',{id:'mb2',serverId:'friends',userId:'bob',role:'MEMBER',joinedAt:new Date()});const response=await json('/servers/friends/members/me',{user:'bob',method:'DELETE'});assert.equal(response.status,200);assert.equal(membership('friends','bob'),null)});
test('server owner cannot leave',async()=>{const response=await json('/servers/friends/members/me',{user:'alice',method:'DELETE'});assert.equal(response.status,403);assert.ok(membership('friends','alice'))});
test('owner can kick a member and kicked user loses channel access',async()=>{members.set('friends:charlie',{id:'mc',serverId:'friends',userId:'charlie',role:'MEMBER',joinedAt:new Date()});const kicked=await json('/servers/friends/members/charlie',{user:'alice',method:'DELETE'});assert.equal(kicked.status,200);assert.equal(membership('friends','charlie'),null);const history=await json('/channels/text/messages',{user:'charlie'});assert.equal(history.status,403)});
test('outsider cannot list server members',async()=>{const response=await json('/servers/friends/members',{user:'outsider'});assert.equal(response.status,403)});
test('banned user cannot rejoin with an invite until the ban is removed',async()=>{members.set('friends:charlie',{id:'mc-ban',serverId:'friends',userId:'charlie',role:'MEMBER',joinedAt:new Date()});const invite=seedInvite();const banned=await json('/servers/friends/bans/charlie',{user:'alice',method:'POST',body:{reason:'test'}});assert.equal(banned.status,201);assert.equal(membership('friends','charlie'),null);assert.ok(bans.get('friends:charlie'));const denied=await json(`/invites/${invite.code}/join`,{user:'charlie',method:'POST'});assert.equal(denied.status,403);const unbanned=await json('/servers/friends/bans/charlie',{user:'alice',method:'DELETE'});assert.equal(unbanned.status,200);const joined=await json(`/invites/${invite.code}/join`,{user:'charlie',method:'POST'});assert.equal(joined.status,201);assert.ok(membership('friends','charlie'))});
