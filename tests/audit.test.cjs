const test = require('node:test');
const assert = require('node:assert/strict');
const { ServersService } = require('../apps/api/dist/servers/servers.service');

function fixture({ effective = ['KICK_MEMBERS','BAN_MEMBERS'] } = {}) {
  const users = new Map([
    ['alice',{id:'alice',username:'alice',displayName:'Alice'}],
    ['bob',{id:'bob',username:'bob',displayName:'Bob'}],
  ]);
  const members = new Map([
    ['friends:alice',{id:'ma',serverId:'friends',userId:'alice',role:'OWNER',user:users.get('alice')}],
    ['friends:bob',{id:'mb',serverId:'friends',userId:'bob',role:'MEMBER',user:users.get('bob')}],
  ]);
  const bans = new Map();
  const audit = [];
  let seq = 0;
  const prisma = {
    $transaction: async fn => fn(prisma),
    serverMember: {
      findUnique: async ({where}) => members.get(`${where.serverId_userId.serverId}:${where.serverId_userId.userId}`) || null,
      delete: async ({where}) => {
        const entry=[...members.entries()].find(([,m])=>m.id===where.id);
        if(entry)members.delete(entry[0]);
        return entry?.[1] || null;
      },
    },
    user: { findUnique: async ({where}) => users.get(where.id) || null },
    serverBan: {
      findUnique: async ({where}) => bans.get(`${where.serverId_userId.serverId}:${where.serverId_userId.userId}`) || null,
      upsert: async ({where,create,update}) => {
        const key=`${where.serverId_userId.serverId}:${where.serverId_userId.userId}`;
        const row=bans.get(key) || {id:`ban-${++seq}`,...create,createdAt:new Date()};
        Object.assign(row,update||{});bans.set(key,row);return row;
      },
      deleteMany: async ({where}) => {const key=`${where.serverId}:${where.userId}`;const existed=bans.delete(key);return {count:existed?1:0}},
    },
    serverAuditLog: {
      create: async ({data}) => {const row={id:`audit-${++seq}`,createdAt:new Date(),...data};audit.push(row);return row},
      findMany: async ({where,take}) => audit.filter(row=>row.serverId===where.serverId&&(!where.action||row.action===where.action)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,take),
    },
  };
  const permissions = {
    require: async () => true,
    effective: async () => effective,
    canKickByHierarchy: () => true,
  };
  return { service:new ServersService(prisma,permissions), users,members,bans,audit };
}

test('kick stores an immutable moderation snapshot atomically with member removal', async()=>{
  const {service,members,audit}=fixture();
  await service.kick('alice','friends','bob');
  assert.equal(members.has('friends:bob'),false);
  assert.equal(audit.length,1);
  assert.equal(audit[0].action,'MEMBER_KICKED');
  assert.equal(audit[0].actorName,'Alice');
  assert.equal(audit[0].targetName,'Bob');
});

test('ban keeps the trimmed reason in moderation history', async()=>{
  const {service,audit,bans}=fixture();
  await service.ban('alice','friends','bob','  spam ve taciz  ');
  assert.equal(bans.has('friends:bob'),true);
  assert.equal(audit[0].action,'MEMBER_BANNED');
  assert.equal(audit[0].reason,'spam ve taciz');
});

test('unban creates a history row only when a ban actually existed', async()=>{
  const {service,audit,bans}=fixture();
  bans.set('friends:bob',{id:'ban-old',serverId:'friends',userId:'bob'});
  await service.unban('alice','friends','bob');
  assert.equal(audit.at(-1).action,'MEMBER_UNBANNED');
  const before=audit.length;
  await service.unban('alice','friends','bob');
  assert.equal(audit.length,before);
});

test('audit listing requires moderation/server-management permission and supports action filter', async()=>{
  const allowed=fixture({effective:['BAN_MEMBERS']});
  allowed.audit.push({id:'a1',serverId:'friends',actorName:'Alice',targetName:'Bob',action:'MEMBER_BANNED',createdAt:new Date('2026-09-10T10:00:00Z')});
  allowed.audit.push({id:'a2',serverId:'friends',actorName:'Alice',targetName:'Bob',action:'MEMBER_KICKED',createdAt:new Date('2026-09-10T11:00:00Z')});
  const rows=await allowed.service.listAudit('alice','friends','MEMBER_BANNED');
  assert.equal(rows.length,1);assert.equal(rows[0].action,'MEMBER_BANNED');
  const denied=fixture({effective:['VIEW_CHANNEL','SEND_MESSAGES']});
  await assert.rejects(()=>denied.service.listAudit('bob','friends'),/İşlem geçmişini görme yetkin yok/);
  await assert.rejects(()=>allowed.service.listAudit('alice','friends','NOT_REAL'),/Geçersiz işlem filtresi/);
});
