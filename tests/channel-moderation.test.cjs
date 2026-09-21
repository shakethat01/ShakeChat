const test=require('node:test');
const assert=require('node:assert/strict');
const {MessagesService}=require('../apps/api/dist/messages/messages.service');

function fixture({locked=false,effective=['VIEW_CHANNEL','SEND_MESSAGES']}={}){
  const deleted=[];
  const channel={id:'general',serverId:'friends',type:'TEXT',slowModeSeconds:0,isLocked:locked};
  const rows=[
    {id:'m3',attachments:[{objectKey:'friends/general/c'}]},
    {id:'m2',attachments:[]},
    {id:'m1',attachments:[{objectKey:'friends/general/a'}]},
  ];
  const prisma={
    channel:{findUnique:async()=>channel},
    message:{
      findFirst:async()=>null,
      findMany:async({take})=>rows.slice(0,take),
      create:async({data})=>({id:'new',createdAt:new Date(),updatedAt:new Date(),editedAt:null,isPinned:false,replyToId:null,author:{id:data.authorId,username:data.authorId},replyTo:null,attachments:[],reactions:[],...data}),
      deleteMany:async({where})=>{deleted.push(...where.id.in);return {count:where.id.in.length}},
    },
  };
  const permissions={
    require:async(_user,_server,permission)=>{if(permission==='MANAGE_MESSAGES'&&!effective.includes('MANAGE_MESSAGES')&&!effective.includes('ADMINISTRATOR')){const error=new Error('forbidden');error.status=403;throw error}return true},
    effective:async()=>effective,
  };
  const removed=[];
  const storage={url:async()=>'',put:async()=>{},remove:async key=>{removed.push(key)}};
  return {service:new MessagesService(prisma,permissions,storage),deleted,removed};
}

test('locked text channel rejects a regular sender even when SEND_MESSAGES is granted',async()=>{
  const {service}=fixture({locked:true,effective:['VIEW_CHANNEL','SEND_MESSAGES']});
  await assert.rejects(()=>service.send('bob','general','hello'),error=>{
    assert.equal(error.status,403);
    assert.match(error.message,/kilitlendi/i);
    return true;
  });
});

test('MANAGE_MESSAGES can write through a locked channel for moderation notices',async()=>{
  const {service}=fixture({locked:true,effective:['VIEW_CHANNEL','SEND_MESSAGES','MANAGE_MESSAGES']});
  const message=await service.send('mod','general','duyuru');
  assert.equal(message.content,'duyuru');
});

test('bulk cleanup deletes the newest requested messages and their stored attachments',async()=>{
  const {service,deleted,removed}=fixture({effective:['VIEW_CHANNEL','SEND_MESSAGES','MANAGE_MESSAGES']});
  const result=await service.bulkRemove('mod','general',2);
  assert.deepEqual(result.ids,['m3','m2']);
  assert.equal(result.count,2);
  assert.deepEqual(deleted,['m3','m2']);
  assert.deepEqual(removed,['friends/general/c']);
});

test('bulk cleanup requires MANAGE_MESSAGES',async()=>{
  const {service}=fixture({effective:['VIEW_CHANNEL','SEND_MESSAGES']});
  await assert.rejects(()=>service.bulkRemove('bob','general',10),error=>{
    assert.equal(error.status,403);
    return true;
  });
});
