const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const argon2 = require('argon2');
const { JwtService } = require('@nestjs/jwt');
const { AuthService } = require('../apps/api/dist/auth/auth.service');
const { AuthGuard } = require('../apps/api/dist/auth/auth.guard');

let user, prisma, jwt, auth, guard;

beforeEach(async()=>{
  user={
    id:'alice',email:'alice@example.test',username:'alice',displayName:null,passwordHash:await argon2.hash('old-password'),
    authVersion:0,avatarUrl:null,statusText:null,profileMode:'AVAILABLE',friendRequestPolicy:'EVERYONE',allowGroupDmInvites:true,
    createdAt:new Date(),updatedAt:new Date(),
  };
  prisma={user:{
    findFirst:async({where})=>{
      const candidates=where?.OR||[];
      return candidates.some(cond=>cond.email===user.email||cond.username===user.username)?{...user}:null;
    },
    findUnique:async({where})=>(where.id===user.id||where.username===user.username)?{...user}:null,
    update:async({where,data})=>{
      if(where.id!==user.id)throw new Error('not found');
      for(const [key,value] of Object.entries(data||{})){
        if(value&&typeof value==='object'&&'increment' in value)user[key]=(user[key]||0)+value.increment;
        else if(value!==undefined)user[key]=value;
      }
      user.updatedAt=new Date();return {...user};
    },
    create:async()=>{throw new Error('unused')},
  }};
  jwt=new JwtService({secret:'test-secret-at-least-32-characters-long',signOptions:{expiresIn:'7d'}});
  auth=new AuthService(prisma,jwt);
  guard=new AuthGuard(jwt,prisma);
});

function contextFor(token){
  const request={headers:{authorization:`Bearer ${token}`}};
  return {request,context:{switchToHttp:()=>({getRequest:()=>request})}};
}

test('session rotation invalidates older JWT versions but keeps the new token valid',async()=>{
  const login=await auth.login({login:'alice',password:'old-password'});
  assert.equal(jwt.verify(login.accessToken).v,0);
  const rotated=await auth.rotateSessions('alice');
  assert.equal(user.authVersion,1);assert.equal(jwt.verify(rotated.accessToken).v,1);
  await assert.rejects(()=>guard.canActivate(contextFor(login.accessToken).context));
  const current=contextFor(rotated.accessToken);assert.equal(await guard.canActivate(current.context),true);assert.equal(current.request.user.sub,'alice');
});

test('changing password verifies the current password, rotates sessions and enables the new password',async()=>{
  await assert.rejects(()=>auth.changePassword('alice',{currentPassword:'wrong-pass',newPassword:'new-password'}));
  const result=await auth.changePassword('alice',{currentPassword:'old-password',newPassword:'new-password'});
  assert.equal(user.authVersion,1);assert.equal(jwt.verify(result.accessToken).v,1);
  await assert.rejects(()=>auth.login({login:'alice',password:'old-password'}));
  const relogin=await auth.login({login:'alice',password:'new-password'});assert.equal(jwt.verify(relogin.accessToken).v,1);
});

test('privacy preferences are private account data and can be updated',async()=>{
  assert.deepEqual(await auth.privacy('alice'),{friendRequestPolicy:'EVERYONE',allowGroupDmInvites:true});
  const next=await auth.updatePrivacy('alice',{friendRequestPolicy:'NOBODY',allowGroupDmInvites:false});
  assert.deepEqual(next,{friendRequestPolicy:'NOBODY',allowGroupDmInvites:false});
  const me=await auth.me('alice');assert.equal('authVersion' in me,false);assert.equal('friendRequestPolicy' in me,false);assert.equal('allowGroupDmInvites' in me,false);assert.equal('passwordHash' in me,false);assert.equal('email' in me,false);
});
