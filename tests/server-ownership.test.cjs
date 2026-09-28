const test = require('node:test');
const assert = require('node:assert/strict');
const { ServersService } = require('../apps/api/dist/servers/servers.service');

function fixture() {
  const state = { server: { id:'friends', name:'Friends', ownerId:'alice', channels:[{id:'voice'}], members:[{userId:'alice'},{userId:'bob'}] }, members: [{id:'a',userId:'alice',role:'OWNER'},{id:'b',userId:'bob',role:'MEMBER'}], deleted:false, linksCleared:false };
  const prisma = {
    $transaction: async fn => { const saved=structuredClone(state); try{return await fn(prisma)}catch(error){Object.assign(state,saved);throw error} },
    server: {
      findUnique: async () => state.deleted ? null : state.server,
      updateMany: async ({where,data}) => { if(state.server.ownerId!==where.ownerId)return{count:0};Object.assign(state.server,data);return{count:1} },
      deleteMany: async ({where}) => { if(state.server.ownerId!==where.ownerId)return{count:0};state.deleted=true;return{count:1} },
    },
    serverMember: {
      findUnique: async ({where}) => state.members.find(member=>member.userId===where.serverId_userId.userId),
      update: async ({where,data}) => { const member=state.members.find(member=>where.id?member.id===where.id:member.userId===where.serverId_userId.userId); if(!member)throw new Error('missing member');Object.assign(member,data);return member },
      delete: async ({where}) => { const index=state.members.findIndex(member=>member.id===where.id&&member.role!==where.role.not);if(index<0)throw Object.assign(new Error('role changed'),{code:'P2025'});return state.members.splice(index,1)[0] },
    },
    serverMemberRole:{deleteMany:async()=>{state.linksCleared=true;return{count:0}}},
    attachment:{findMany:async()=>[{objectKey:'friends/voice/file'}]},
  };
  return {state,prisma,service:new ServersService(prisma,{})};
}

test('only the current owner may transfer ownership and the new owner must already be a member',async()=>{
  const {service,state}=fixture();
  await assert.rejects(()=>service.transferOwnership('bob','friends','alice'),/yalnızca/);
  await assert.rejects(()=>service.transferOwnership('alice','friends','outsider'),/üyesi olmalı/);
  assert.equal(state.server.ownerId,'alice');assert.equal(state.members[0].role,'OWNER');
});

test('transfer is atomic, preserves a single owner and allows the former owner to leave',async()=>{
  const {service,state}=fixture();
  await service.transferOwnership('alice','friends','bob');
  assert.equal(state.server.ownerId,'bob');assert.deepEqual(state.members.map(member=>member.role),['MEMBER','OWNER']);assert.equal(state.linksCleared,true);
  await service.leave('alice','friends');assert.deepEqual(state.members.map(member=>member.userId),['bob']);
  await assert.rejects(()=>service.leave('bob','friends'),/sahibi/);
});

test('a failed role update rolls the owner field back',async()=>{
  const {service,state,prisma}=fixture();prisma.serverMember.update=async()=>{throw new Error('database failure')};
  await assert.rejects(()=>service.transferOwnership('alice','friends','bob'),/database failure/);
  assert.equal(state.server.ownerId,'alice');assert.equal(state.members[0].role,'OWNER');
});

test('server deletion requires the owner and an exact typed name and returns cleanup targets',async()=>{
  const {service,state}=fixture();
  await assert.rejects(()=>service.deleteServer('bob','friends','Friends'),/sahibi/);
  await assert.rejects(()=>service.deleteServer('alice','friends','wrong name'),/aynen yaz/);
  assert.equal(state.deleted,false);
  assert.deepEqual(await service.deleteServer('alice','friends','Friends'),{channelIds:['voice'],userIds:['alice','bob'],objectKeys:['friends/voice/file']});
  assert.equal(state.deleted,true);
});

test('a member becoming owner between the leave check and deletion cannot become an orphan owner',async()=>{
  const {service,state,prisma}=fixture();const read=prisma.serverMember.findUnique;
  prisma.serverMember.findUnique=async args=>{const member=await read(args);const previous={...member};member.role='OWNER';return previous};
  await assert.rejects(()=>service.leave('bob','friends'),/sahibi çıkarılamaz/);
  assert.ok(state.members.some(member=>member.userId==='bob'));
});
