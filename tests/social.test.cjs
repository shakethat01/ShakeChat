const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { FriendsService } = require('../apps/api/dist/friends/friends.service');
const { FriendRateLimitService } = require('../apps/api/dist/friends/friend-rate-limit.service');
const { DirectMessagesService } = require('../apps/api/dist/direct-messages/direct-messages.service');

const baseUsers = [
  { id:'alice',username:'alice',displayName:null,avatarUrl:null,statusText:null,profileMode:'AVAILABLE',friendRequestPolicy:'EVERYONE',allowGroupDmInvites:true },
  { id:'bob',username:'bob',displayName:null,avatarUrl:null,statusText:null,profileMode:'AVAILABLE',friendRequestPolicy:'EVERYONE',allowGroupDmInvites:true },
  { id:'charlie',username:'charlie',displayName:null,avatarUrl:null,statusText:null,profileMode:'AVAILABLE',friendRequestPolicy:'EVERYONE',allowGroupDmInvites:true },
  { id:'dora',username:'dora',displayName:null,avatarUrl:null,statusText:null,profileMode:'AVAILABLE',friendRequestPolicy:'EVERYONE',allowGroupDmInvites:true },
];
let users, requests, friendships, blocks, conversations, dmMembers, dmMessages, dmReactions, seq, db, friends, dms;
const pair=(a,b)=>a<b?[a,b]:[b,a];
const pairKey=(a,b)=>pair(a,b).join(':');
const storage={url:async key=>`http://storage/${key}`,put:async()=>{},remove:async()=>{}};

function matchesBlock(row,where){
  if(where.blockerId!==undefined&&row.blockerId!==where.blockerId)return false;
  if(where.blockedId!==undefined&&row.blockedId!==where.blockedId)return false;
  if(where.OR)return where.OR.some(cond=>matchesBlock(row,cond));
  return true;
}
function decorateDm(row){
  if(!row)return null;
  const reply=row.replyToId?dmMessages.find(m=>m.id===row.replyToId):null;
  return {...row,author:users.find(u=>u.id===row.authorId),replyTo:reply?{id:reply.id,content:reply.content,author:users.find(u=>u.id===reply.authorId)}:null,attachments:row.attachments||[],reactions:dmReactions.filter(r=>r.messageId===row.id)};
}

beforeEach(()=>{
 users=baseUsers.map(user=>({...user}));requests=new Map();friendships=new Map();blocks=new Map();conversations=new Map();dmMembers=new Map();dmMessages=[];dmReactions=[];seq=0;
 db={
  $transaction:async fn=>fn(db),
  user:{
   findUnique:async({where})=>users.find(user=>where.id?user.id===where.id:user.username===where.username)||null,
   findMany:async({where})=>users.filter(user=>where.id.in.includes(user.id)),
  },
  userBlock:{
   findFirst:async({where})=>[...blocks.values()].find(row=>matchesBlock(row,where))||null,
   findMany:async({where})=>[...blocks.values()].filter(row=>matchesBlock(row,where)).map(row=>({...row,blocked:users.find(u=>u.id===row.blockedId)})),
   upsert:async({where,create})=>{const key=`${where.blockerId_blockedId.blockerId}:${where.blockerId_blockedId.blockedId}`;if(blocks.has(key))return blocks.get(key);const row={id:`block-${++seq}`,createdAt:new Date(),...create};blocks.set(key,row);return row},
   deleteMany:async({where})=>{let count=0;for(const [key,row] of [...blocks])if(matchesBlock(row,where)){blocks.delete(key);count++}return{count}},
  },
  friendRequest:{
   findUnique:async({where})=>where.id?requests.get(where.id)||null:[...requests.values()].find(row=>row.senderId===where.senderId_receiverId.senderId&&row.receiverId===where.senderId_receiverId.receiverId)||null,
   findMany:async({where})=>[...requests.values()].filter(row=>(where.receiverId?row.receiverId===where.receiverId:true)&&(where.senderId?row.senderId===where.senderId:true)).map(row=>({...row,sender:users.find(u=>u.id===row.senderId),receiver:users.find(u=>u.id===row.receiverId)})),
   create:async({data})=>{if([...requests.values()].some(row=>row.senderId===data.senderId&&row.receiverId===data.receiverId))throw new Error('unique');const row={id:`r${++seq}`,createdAt:new Date(),...data};requests.set(row.id,row);return row},
   delete:async({where})=>{const row=requests.get(where.id);requests.delete(where.id);return row},
   deleteMany:async({where})=>{let count=0;for(const [id,row] of [...requests]){if(where.OR.some(cond=>row.senderId===cond.senderId&&row.receiverId===cond.receiverId)){requests.delete(id);count++}}return{count}},
  },
  serverMember:{
   findFirst:async({where})=>where.userId==='alice'&&where.server?.members?.some?.userId==='bob'?{id:'shared-member'}:null,
  },
  friendship:{
   findUnique:async({where})=>friendships.get(`${where.userAId_userBId.userAId}:${where.userAId_userBId.userBId}`)||null,
   findMany:async({where})=>[...friendships.values()].filter(row=>where.OR.some(cond=>(cond.userAId&&row.userAId===cond.userAId)||(cond.userBId&&row.userBId===cond.userBId))).map(row=>({...row,userA:users.find(u=>u.id===row.userAId),userB:users.find(u=>u.id===row.userBId)})),
   upsert:async({where,create})=>{const key=`${where.userAId_userBId.userAId}:${where.userAId_userBId.userBId}`;if(friendships.has(key))return friendships.get(key);const row={id:`f${++seq}`,createdAt:new Date(),...create};friendships.set(key,row);return row},
   delete:async({where})=>{const entry=[...friendships.entries()].find(([,row])=>row.id===where.id);if(entry)friendships.delete(entry[0]);return entry?.[1]},
   deleteMany:async({where})=>{const key=`${where.userAId}:${where.userBId}`;const existed=friendships.delete(key);return{count:existed?1:0}},
  },
  directMessageConversation:{
   upsert:async({where,create})=>{let row=[...conversations.values()].find(item=>item.pairKey===where.pairKey);if(!row){row={id:`c${++seq}`,pairKey:create.pairKey,title:null,createdAt:new Date(),updatedAt:new Date()};conversations.set(row.id,row);for(const member of create.members.create){const m={id:`dm-member-${++seq}`,conversationId:row.id,userId:member.userId,joinedAt:new Date(),lastReadAt:new Date()};dmMembers.set(`${row.id}:${member.userId}`,m)}}return {id:row.id,updatedAt:row.updatedAt}},
   create:async({data})=>{const row={id:`c${++seq}`,pairKey:null,title:data.title||null,createdAt:new Date(),updatedAt:new Date()};conversations.set(row.id,row);for(const member of data.members.create){const m={id:`dm-member-${++seq}`,conversationId:row.id,userId:member.userId,joinedAt:new Date(),lastReadAt:new Date()};dmMembers.set(`${row.id}:${member.userId}`,m)}return {id:row.id,title:row.title,updatedAt:row.updatedAt}},
   findMany:async({where})=>[...conversations.values()].filter(c=>dmMembers.has(`${c.id}:${where.members.some.userId}`)).map(c=>({...c,members:[...dmMembers.values()].filter(m=>m.conversationId===c.id).map(m=>({...m,user:users.find(u=>u.id===m.userId)})),messages:dmMessages.filter(m=>m.conversationId===c.id).slice(-1).map(decorateDm)})),
   update:async({where,data})=>{const row=conversations.get(where.id);Object.assign(row,data);return row},
  },
  directMessageMember:{
   findUnique:async({where})=>{const m=dmMembers.get(`${where.conversationId_userId.conversationId}:${where.conversationId_userId.userId}`);return m?{...m,conversation:conversations.get(m.conversationId)}:null},
   findFirst:async({where})=>{const m=[...dmMembers.values()].find(item=>item.conversationId===where.conversationId&&item.userId!==where.userId.not);return m?{userId:m.userId}:null},
   findMany:async({where})=>[...dmMembers.values()].filter(item=>!where?.userId||item.userId===where.userId).map(item=>({...item})),
   update:async({where,data})=>{const key=`${where.conversationId_userId.conversationId}:${where.conversationId_userId.userId}`;const m=dmMembers.get(key);if(!m)throw new Error('missing member');Object.assign(m,data);return {...m}},
  },
  directMessage:{
   count:async({where})=>dmMessages.filter(m=>m.conversationId===where.conversationId&&m.authorId!==where.authorId.not&&m.createdAt>where.createdAt.gt).length,
   findMany:async({where,take})=>dmMessages.filter(m=>m.conversationId===where.conversationId).slice().reverse().slice(0,take).map(decorateDm),
   findFirst:async({where})=>{const row=dmMessages.find(m=>m.id===where.id&&m.conversationId===where.conversationId);if(!row)return null;return where.authorId?row.authorId===where.authorId?row:null:row},
   findUnique:async({where})=>decorateDm(dmMessages.find(m=>m.id===where.id)),
   create:async({data})=>{const row={id:`m${++seq}`,createdAt:new Date(),updatedAt:new Date(),isPinned:false,editedAt:null,attachments:[],...data};delete row.attachments?.create;dmMessages.push(row);return decorateDm(row)},
   update:async({where,data})=>{const row=dmMessages.find(m=>m.id===where.id);Object.assign(row,data,{updatedAt:new Date()});return decorateDm(row)},
   delete:async({where})=>{const i=dmMessages.findIndex(m=>m.id===where.id);return i>=0?dmMessages.splice(i,1)[0]:null},
  },
  directMessageReaction:{
   upsert:async({where,create})=>{const key=where.messageId_userId_emoji;let row=dmReactions.find(r=>r.messageId===key.messageId&&r.userId===key.userId&&r.emoji===key.emoji);if(!row){row={id:`dr-${++seq}`,createdAt:new Date(),...create};dmReactions.push(row)}return row},
   deleteMany:async({where})=>{const before=dmReactions.length;dmReactions=dmReactions.filter(r=>!(r.messageId===where.messageId&&r.userId===where.userId&&r.emoji===where.emoji));return{count:before-dmReactions.length}},
  },
 };
 friends=new FriendsService(db,new FriendRateLimitService());dms=new DirectMessagesService(db,storage);
});

async function befriend(a='alice',b='bob'){const req=await friends.sendRequest(a,users.find(u=>u.id===b).username);await friends.accept(b,req.id)}

test('friend request can be sent and is visible to both directions',async()=>{const request=await friends.sendRequest('alice','bob');assert.equal(request.user.id,'bob');const a=await friends.requests('alice'),b=await friends.requests('bob');assert.equal(a.outgoing[0].user.id,'bob');assert.equal(b.incoming[0].user.id,'alice')});
test('self, duplicate and reverse friend requests are rejected',async()=>{await assert.rejects(()=>friends.sendRequest('alice','alice'));await friends.sendRequest('alice','bob');await assert.rejects(()=>friends.sendRequest('alice','bob'));await assert.rejects(()=>friends.sendRequest('bob','alice'))});
test('friend-request privacy can reject new requests',async()=>{users.find(u=>u.id==='bob').friendRequestPolicy='NOBODY';await assert.rejects(()=>friends.sendRequest('alice','bob'),/arkadaşlık isteği kabul etmiyor/);assert.equal(requests.size,0)});
test('shared-server friend-request privacy allows only users with a common server',async()=>{users.find(u=>u.id==='bob').friendRequestPolicy='SHARED_SERVERS';const allowed=await friends.sendRequest('alice','bob');assert.equal(allowed.user.id,'bob');await friends.rejectOrCancel('alice',allowed.id);users.find(u=>u.id==='dora').friendRequestPolicy='SHARED_SERVERS';await assert.rejects(()=>friends.sendRequest('alice','dora'),/ortak alan/);});
test('only receiver can accept and acceptance creates one friendship',async()=>{const request=await friends.sendRequest('alice','bob');await assert.rejects(()=>friends.accept('charlie',request.id));await friends.accept('bob',request.id);assert.deepEqual((await friends.list('alice')).map(u=>u.id),['bob']);assert.equal(requests.size,0)});
test('request can be cancelled/rejected and friendship can be removed',async()=>{let request=await friends.sendRequest('alice','bob');const cancelled=await friends.rejectOrCancel('alice',request.id);assert.equal(cancelled.otherUserId,'bob');assert.equal(requests.size,0);await befriend();await friends.remove('alice','bob');assert.equal((await friends.list('alice')).length,0)});
test('blocking removes friendship and prevents new requests and 1:1 DM sending',async()=>{await befriend();const conversation=await dms.open('alice','bob');await friends.block('alice','bob');assert.equal((await friends.list('alice')).length,0);await assert.rejects(()=>friends.sendRequest('bob','alice'));await assert.rejects(()=>dms.send('bob',conversation.id,'blocked'));const rows=await dms.listConversations('alice');assert.equal(rows[0].blocked,true);await friends.unblock('alice','bob');assert.equal((await friends.blocks('alice')).length,0)});
test('non-friends cannot open a DM; friends get one idempotent conversation',async()=>{await assert.rejects(()=>dms.open('alice','bob'));await befriend();const first=await dms.open('alice','bob'),second=await dms.open('bob','alice');assert.equal(first.id,second.id);assert.equal(conversations.size,1)});
test('only conversation members can read or send direct messages',async()=>{await befriend();const conversation=await dms.open('alice','bob');await assert.rejects(()=>dms.listMessages('charlie',conversation.id));await assert.rejects(()=>dms.send('charlie',conversation.id,'nope'));const sent=await dms.send('alice',conversation.id,'hello');assert.equal(sent.content,'hello');assert.equal((await dms.listMessages('bob',conversation.id))[0].content,'hello')});
test('direct message history returns newest 100 in chronological order',async()=>{await befriend();const conversation=await dms.open('alice','bob');for(let i=0;i<110;i++)await dms.send('alice',conversation.id,`msg ${i}`);const history=await dms.listMessages('bob',conversation.id);assert.equal(history.length,100);assert.equal(history[0].content,'msg 10');assert.equal(history.at(-1).content,'msg 109')});
test('conversation list includes the other user and latest message',async()=>{await befriend();const conversation=await dms.open('alice','bob');await dms.send('bob',conversation.id,'latest');const rows=await dms.listConversations('alice');assert.equal(rows[0].other.id,'bob');assert.equal(rows[0].lastMessage.content,'latest')});
test('group DM accepts multiple friends and keeps message features',async()=>{await befriend('alice','bob');await befriend('alice','charlie');const group=await dms.createGroup('alice',['bob','charlie'],'Gece Ekibi');assert.equal(group.isGroup,true);assert.equal(group.members.length,3);const first=await dms.send('alice',group.id,'ilk');const reply=await dms.send('bob',group.id,'cevap',first.id);assert.equal(reply.replyTo.id,first.id);const edited=await dms.edit('bob',group.id,reply.id,'düzenlendi');assert.equal(edited.content,'düzenlendi');const reacted=await dms.react('charlie',group.id,reply.id,'🔥');assert.equal(reacted.reactions[0].count,1);const pinned=await dms.togglePin('alice',group.id,reply.id);assert.equal(pinned.isPinned,true)});
test('group-DM privacy prevents adding a friend who disabled invitations',async()=>{await befriend('alice','bob');await befriend('alice','charlie');users.find(u=>u.id==='charlie').allowGroupDmInvites=false;await assert.rejects(()=>dms.createGroup('alice',['bob','charlie'],'Kapalı Grup'),/grup sohbeti daveti kabul etmiyor/);assert.equal(conversations.size,0)});

test('DM unread summary is persisted per member and clears after mark-read',async()=>{
  await befriend();
  const conversation=await dms.open('alice','bob');
  const bobMember=dmMembers.get(`${conversation.id}:bob`);
  bobMember.lastReadAt=new Date(Date.now()-1000);
  await dms.send('alice',conversation.id,'okunmamış');
  const unread=await dms.unreadSummary('bob');
  assert.equal(unread.length,1);assert.equal(unread[0].conversationId,conversation.id);assert.equal(unread[0].count,1);
  await dms.markRead('bob',conversation.id);
  assert.deepEqual(await dms.unreadSummary('bob'),[]);
  await assert.rejects(()=>dms.markRead('charlie',conversation.id));
});
