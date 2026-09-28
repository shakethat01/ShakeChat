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

test('screen token uses an isolated technical identity and requires speaking permission',async()=>{
  const {service}=fixture();
  const result=await service.createScreenToken('alice','voice');
  assert.equal(result.identity,'screen:alice');
  assert.equal(result.ownerId,'alice');
  assert.equal(result.room,'shakechat-voice');
  assert.equal(typeof result.token,'string');
  const {service:listenOnly}=fixture({permissions:['VIEW_CHANNEL','CONNECT_VOICE']});
  await assert.rejects(()=>listenOnly.createScreenToken('alice','voice'),/yayın açma yetkin yok/);
});

test('voice token is listen-only when SPEAK is missing',async()=>{
  const {service}=fixture({permissions:['VIEW_CHANNEL','CONNECT_VOICE']});
  const result=await service.createJoinToken('alice','voice');
  assert.equal(result.canSpeak,false);
});

test('text channels cannot mint voice or screen tokens',async()=>{
  const {service}=fixture({type:'TEXT'});
  await assert.rejects(()=>service.createJoinToken('alice','text'),/Ses kanalı bulunamadı/);
  await assert.rejects(()=>service.createScreenToken('alice','text'),/Ses kanalı bulunamadı/);
});

test('revoked CONNECT_VOICE removes voice and native screen participants',async()=>{
  const {service,calls}=fixture({permissions:['VIEW_CHANNEL']});
  await service.refreshServerAccess('friends',['alice']);
  assert.deepEqual(calls.removed,[
    {room:'shakechat-voice',identity:'alice'},
    {room:'shakechat-voice',identity:'screen:alice'},
  ]);
  assert.equal(calls.updated.length,0);
});

test('SPEAK change updates the voice participant and closes a screen publisher',async()=>{
  const {service,calls}=fixture({permissions:['VIEW_CHANNEL','CONNECT_VOICE']});
  await service.refreshServerAccess('friends',['alice']);
  assert.deepEqual(calls.removed,[{room:'shakechat-voice',identity:'screen:alice'}]);
  assert.equal(calls.updated.length,1);
  assert.equal(calls.updated[0].identity,'alice');
  assert.equal(calls.updated[0].options.permission.canPublish,false);
});

test('channel roster merges the technical native screen publisher into its owner',async()=>{
  const {service}=fixture();
  service.prisma.serverMember={findUnique:async()=>({id:'member'})};
  service.roomClient.listParticipants=async()=>[
    {identity:'alice',name:'Alice',tracks:[{source:2,muted:false}]},
    {identity:'screen:alice',name:'Alice',tracks:[{source:3,muted:false}]},
  ];
  // TrackSource enum values are supplied by the SDK at runtime; use the SDK names when available in the compiled service.
  const {TrackSource}=require('livekit-server-sdk');
  service.roomClient.listParticipants=async()=>[
    {identity:'alice',name:'Alice',tracks:[{source:TrackSource.MICROPHONE,muted:false}]},
    {identity:'screen:alice',name:'Alice',tracks:[{source:TrackSource.SCREEN_SHARE,muted:false}]},
  ];
  const row=(await service.participantsInServer('alice','friends')).channels[0];
  assert.equal(row.participants.length,1);
  assert.deepEqual(row.participants[0],{identity:'alice',name:'Alice',muted:false,screen:true});
});

test('channel roster checks membership and VIEW_CHANNEL before querying LiveKit, even with cached rooms',async()=>{
  const {service}=fixture();const queried=[];
  service.prisma.serverMember={findUnique:async({where})=>where.serverId_userId.userId==='outsider'?null:{id:'member'}};
  service.prisma.channel.findMany=async()=>[{id:'visible'},{id:'hidden'}];
  service.permissions.has=async(_user,_server,_permission,channel)=>channel==='visible';
  service.roomClient.listParticipants=async room=>{queried.push(room);return[{identity:'bob',name:'Bob',tracks:[]}]};
  await assert.rejects(()=>service.participantsInServer('outsider','friends'),/göremezsin/);assert.equal(queried.length,0);
  const first=await service.participantsInServer('alice','friends');
  assert.deepEqual(first.channels.map(row=>row.channelId),['visible']);assert.equal(first.channels[0].participants[0].identity,'bob');
  assert.deepEqual(queried,['shakechat-visible']);
  service.permissions.has=async()=>false;
  assert.deepEqual((await service.participantsInServer('alice','friends')).channels,[]);assert.equal(queried.length,1);
});

test('roster distinguishes an empty room from a temporary LiveKit failure',async()=>{
  const {service}=fixture();service.prisma.serverMember={findUnique:async()=>({id:'member'})};
  service.roomClient.listParticipants=async()=>{throw Object.assign(new Error('no room'),{code:'not_found'})};
  assert.equal((await service.participantsInServer('alice','friends')).channels[0].available,true);
  service.rosterCache.clear();service.roomClient.listParticipants=async()=>{throw new Error('network')};
  assert.equal((await service.participantsInServer('alice','friends')).channels[0].available,false);
});
