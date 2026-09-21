const test=require('node:test');
const assert=require('node:assert/strict');
const {MessagesService}=require('../apps/api/dist/messages/messages.service');

function fixture({slowModeSeconds=10,effective=['VIEW_CHANNEL','SEND_MESSAGES'],latestAt=null}={}){
  const created=[];
  const channel={id:'general',serverId:'friends',type:'TEXT',slowModeSeconds};
  const prisma={
    channel:{findUnique:async()=>channel},
    message:{
      findFirst:async args=>{
        if(args?.select?.createdAt)return latestAt?{createdAt:latestAt}:null;
        return null;
      },
      create:async({data})=>{const row={id:`m${created.length+1}`,createdAt:new Date(),updatedAt:new Date(),editedAt:null,isPinned:false,replyToId:null,author:{id:data.authorId,username:data.authorId},replyTo:null,attachments:[],reactions:[],...data};created.push(row);return row;},
    },
  };
  const permissions={require:async()=>true,effective:async()=>effective};
  const storage={url:async()=>'',put:async()=>{},remove:async()=>{}};
  return {service:new MessagesService(prisma,permissions,storage),created};
}

test('slow mode rejects a second regular-member message until the interval expires',async()=>{
  const {service}=fixture({slowModeSeconds:10,latestAt:new Date(Date.now()-2500)});
  await assert.rejects(()=>service.send('bob','general','again'),error=>{
    assert.equal(error.status,429);
    assert.match(error.message,/yavaş mod/i);
    assert.match(error.message,/sn sonra/i);
    return true;
  });
});

test('MANAGE_MESSAGES bypasses channel slow mode for moderation work',async()=>{
  const {service,created}=fixture({slowModeSeconds:30,effective:['VIEW_CHANNEL','SEND_MESSAGES','MANAGE_MESSAGES'],latestAt:new Date()});
  const message=await service.send('mod','general','duyuru');
  assert.equal(message.content,'duyuru');
  assert.equal(created.length,1);
});

test('disabled slow mode does not query the sender cooldown and allows normal messages',async()=>{
  const {service,created}=fixture({slowModeSeconds:0,latestAt:new Date()});
  const message=await service.send('bob','general','merhaba');
  assert.equal(message.content,'merhaba');
  assert.equal(created.length,1);
});
