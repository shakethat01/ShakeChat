const test=require('node:test');
const assert=require('node:assert/strict');
const {VoiceService}=require('../apps/api/dist/voice/voice.service.js');

function fixture({type='VOICE',permissions=['VIEW_CHANNEL','CONNECT_VOICE','SPEAK']}={}){
  const calls={require:[],removed:[],updated:[]};
  const prisma={
    user:{findUnique:async()=>({id:'alice',username:'alice',displayName:'Alice'})},
    channel:{findMany:async()=>[{id:'voice'}]},
  };
  const permissionService={
    channelContext:async()=>({id:'voice',serverId:'friends',type}),
    require:async(userId,serverId,permission,channelId)=>{calls.require.push({userId,serverId,permission,channelId});},
    effective:async()=>permissions,
    has:async(_user,_server,permission)=>permissions.includes(permission),
  };
  const service=new VoiceService(prisma,permissionService);
  service.roomClient={
    removeParticipant:async(room,identity)=>calls.removed.push({room,identity}),
    updateParticipant:async(room,identity,options)=>{calls.updated.push({room,identity,options});return{}},
    deleteRoom:async()=>{},
  };
  return {service,calls};
}

test('voice token uses opaque user identity and SPEAK permission',async()=>{
  const {service,calls}=fixture();
  const result=await service.createJoinToken('alice','voice');
  assert.equal(result.channelId,'voice');
  assert.equal(result.room,'shakechat-voice');
  assert.equal(result.url,'ws://localhost:7880');
  assert.equal(result.canSpeak,true);
  assert.equal(typeof result.token,'string');
  assert.equal(calls.require.length,2);
});

test('voice token is listen-only when SPEAK is missing',async()=>{
  const {service}=fixture({permissions:['VIEW_CHANNEL','CONNECT_VOICE']});
  const result=await service.createJoinToken('alice','voice');
  assert.equal(result.canSpeak,false);
});

test('text channels cannot mint voice tokens',async()=>{
  const {service}=fixture({type:'TEXT'});
  await assert.rejects(()=>service.createJoinToken('alice','text'),/Ses kanalı bulunamadı/);
});

test('revoked CONNECT_VOICE removes connected participant',async()=>{
  const {service,calls}=fixture({permissions:['VIEW_CHANNEL']});
  await service.refreshServerAccess('friends',['alice']);
  assert.deepEqual(calls.removed,[{room:'shakechat-voice',identity:'alice'}]);
  assert.equal(calls.updated.length,0);
});

test('SPEAK change updates LiveKit publish permission without disconnecting',async()=>{
  const {service,calls}=fixture({permissions:['VIEW_CHANNEL','CONNECT_VOICE']});
  await service.refreshServerAccess('friends',['alice']);
  assert.equal(calls.removed.length,0);
  assert.equal(calls.updated.length,1);
  assert.equal(calls.updated[0].options.permission.canPublish,false);
});
