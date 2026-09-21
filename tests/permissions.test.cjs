const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsService } = require('../apps/api/dist/permissions/permissions.service');
const { Permission, MemberRole } = require('@prisma/client');

let db, service, member, managedRole, overrides;
beforeEach(()=>{
  managedRole={id:'member-role',serverId:'s1',legacyRole:MemberRole.MEMBER,permissions:[Permission.VIEW_CHANNEL,Permission.SEND_MESSAGES],isManaged:true};
  member={id:'m1',serverId:'s1',userId:'bob',role:MemberRole.MEMBER,roleLinks:[],messageRestrictedUntil:null};
  overrides=[];
  db={
    serverMember:{
      findUnique:async({where})=>where.serverId_userId?.serverId==='s1'&&where.serverId_userId?.userId===member.userId?member:null,
    },
    role:{findUnique:async({where})=>where.serverId_legacyRole?.serverId==='s1'&&where.serverId_legacyRole?.legacyRole===member.role?managedRole:null},
    channel:{findFirst:async({where})=>where.id==='c1'&&where.serverId==='s1'?{id:'c1'}:null,findUnique:async({where})=>where.id==='c1'?{id:'c1',serverId:'s1',type:'TEXT'}:null},
    channelPermission:{findMany:async()=>overrides},
  };
  service=new PermissionsService(db);
});

test('owner has every permission implicitly',async()=>{member={...member,userId:'alice',role:MemberRole.OWNER};const permissions=await service.effective('alice','s1');assert.ok(permissions.includes(Permission.ADMINISTRATOR));assert.ok(permissions.includes(Permission.MANAGE_ROLES));});
test('member gets managed base permissions',async()=>{const permissions=await service.effective('bob','s1');assert.ok(permissions.includes(Permission.VIEW_CHANNEL));assert.ok(permissions.includes(Permission.SEND_MESSAGES));assert.equal(permissions.includes(Permission.KICK_MEMBERS),false)});
test('custom role permissions are unioned with base role',async()=>{member.roleLinks=[{roleId:'custom',role:{id:'custom',permissions:[Permission.KICK_MEMBERS]}}];const permissions=await service.effective('bob','s1');assert.ok(permissions.includes(Permission.KICK_MEMBERS));});
test('channel role deny removes a server permission',async()=>{overrides=[{roleId:'member-role',allow:[],deny:[Permission.SEND_MESSAGES]}];const permissions=await service.effective('bob','s1','c1');assert.equal(permissions.includes(Permission.SEND_MESSAGES),false);assert.ok(permissions.includes(Permission.VIEW_CHANNEL));});
test('role allow wins over role deny at the same channel layer',async()=>{member.roleLinks=[{roleId:'custom',role:{id:'custom',permissions:[]}}];overrides=[{roleId:'member-role',allow:[],deny:[Permission.SEND_MESSAGES]},{roleId:'custom',allow:[Permission.SEND_MESSAGES],deny:[]}];const permissions=await service.effective('bob','s1','c1');assert.ok(permissions.includes(Permission.SEND_MESSAGES));});
test('VIEW_CHANNEL denial blocks websocket/channel access checks',async()=>{overrides=[{roleId:'member-role',allow:[],deny:[Permission.VIEW_CHANNEL]}];assert.equal(await service.canAccessChannel('bob','c1',Permission.VIEW_CHANNEL),false)});
test('system hierarchy prevents moderator from kicking admin',()=>{assert.equal(service.canKickByHierarchy(MemberRole.MODERATOR,MemberRole.ADMIN),false);assert.equal(service.canKickByHierarchy(MemberRole.ADMIN,MemberRole.MODERATOR),true);assert.equal(service.canKickByHierarchy(MemberRole.OWNER,MemberRole.ADMIN),true)});

test('active message restriction wins over channel SEND_MESSAGES allow and expires naturally',async()=>{member={...member,messageRestrictedUntil:new Date(Date.now()+60_000)};member.roleLinks=[{roleId:'custom',role:{id:'custom',permissions:[]}}];overrides=[{roleId:'custom',allow:[Permission.SEND_MESSAGES],deny:[]}];let permissions=await service.effective('bob','s1','c1');assert.equal(permissions.includes(Permission.SEND_MESSAGES),false);member={...member,messageRestrictedUntil:new Date(Date.now()-1)};permissions=await service.effective('bob','s1','c1');assert.equal(permissions.includes(Permission.SEND_MESSAGES),true);});
