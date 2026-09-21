const test=require('node:test');
const assert=require('node:assert/strict');
const {ServersService}=require('../apps/api/dist/servers/servers.service');

function fixture(){
  const users=new Map([
    ['alice',{id:'alice',username:'alice',displayName:'Alice'}],
    ['bob',{id:'bob',username:'bob',displayName:'Bob'}],
  ]);
  const members=new Map([
    ['friends:alice',{id:'ma',serverId:'friends',userId:'alice',role:'OWNER',messageRestrictedUntil:null,messageRestrictionReason:null,user:users.get('alice')}],
    ['friends:bob',{id:'mb',serverId:'friends',userId:'bob',role:'MEMBER',messageRestrictedUntil:null,messageRestrictionReason:null,user:users.get('bob')}],
  ]);
  const audit=[];let seq=0;
  const prisma={
    $transaction:async fn=>fn(prisma),
    serverMember:{
      findUnique:async({where})=>members.get(`${where.serverId_userId.serverId}:${where.serverId_userId.userId}`)||null,
      update:async({where,data})=>{const row=[...members.values()].find(m=>m.id===where.id);if(!row)throw new Error('missing member');Object.assign(row,data);return row},
    },
    serverAuditLog:{create:async({data})=>{const row={id:`a${++seq}`,createdAt:new Date(),...data};audit.push(row);return row}},
  };
  const permissions={
    require:async()=>true,
    effective:async userId=>userId==='bob'?['VIEW_CHANNEL','SEND_MESSAGES']:['ADMINISTRATOR'],
    canKickByHierarchy:()=>true,
  };
  return {service:new ServersService(prisma,permissions),members,audit};
}

test('temporary message restriction is stored atomically with an audit snapshot',async()=>{
  const {service,members,audit}=fixture();
  const result=await service.restrictMessages('alice','friends','bob',60,'  spam  ');
  const bob=members.get('friends:bob');
  assert.equal(result.ok,true);
  assert.ok(bob.messageRestrictedUntil instanceof Date);
  assert.equal(bob.messageRestrictionReason,'spam');
  assert.equal(audit.length,1);
  assert.equal(audit[0].action,'MEMBER_RESTRICTED');
  assert.equal(audit[0].actorName,'Alice');
  assert.equal(audit[0].targetName,'Bob');
  assert.equal(audit[0].reason,'60 dk · spam');
});

test('clearing a restriction restores member state and creates one audit row',async()=>{
  const {service,members,audit}=fixture();
  const bob=members.get('friends:bob');
  bob.messageRestrictedUntil=new Date(Date.now()+60_000);bob.messageRestrictionReason='spam';
  await service.clearMessageRestriction('alice','friends','bob');
  assert.equal(bob.messageRestrictedUntil,null);
  assert.equal(bob.messageRestrictionReason,null);
  assert.equal(audit.length,1);
  assert.equal(audit[0].action,'MEMBER_RESTRICTION_REMOVED');
  await service.clearMessageRestriction('alice','friends','bob');
  assert.equal(audit.length,1);
});
