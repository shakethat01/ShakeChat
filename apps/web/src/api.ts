const configuredApiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim();
export const API_ORIGIN = configuredApiOrigin === 'same-origin'
  ? ''
  : (configuredApiOrigin || 'http://localhost:4000');
const API = `${API_ORIGIN}/api`;
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export type ProfileMode = 'AVAILABLE'|'FOCUS'|'AWAY';
export type User = { id:string; username:string; displayName?:string|null; avatarUrl?:string|null; statusText?:string|null; profileMode?:ProfileMode };
export type PrivacySettings = { friendRequestPolicy:'EVERYONE'|'SHARED_SERVERS'|'NOBODY'; allowGroupDmInvites:boolean };
export type Permission = 'ADMINISTRATOR'|'MANAGE_SERVER'|'MANAGE_CHANNELS'|'MANAGE_ROLES'|'KICK_MEMBERS'|'BAN_MEMBERS'|'MODERATE_MEMBERS'|'MANAGE_MESSAGES'|'MANAGE_INVITES'|'VIEW_CHANNEL'|'SEND_MESSAGES'|'CONNECT_VOICE'|'SPEAK';
export type Role = { id:string;serverId:string;name:string;color?:string|null;position:number;permissions:Permission[];isManaged:boolean;legacyRole?:'OWNER'|'ADMIN'|'MODERATOR'|'MEMBER'|null;memberCount?:number };
export type Member = User & { role: string; roles?:Role[]; online: boolean; joinedAt?:string; messageRestrictedUntil?:string|null; messageRestrictionReason?:string|null };
export type Channel = { id:string; name:string; type:'TEXT'|'VOICE'; position:number; groupName?:string|null; slowModeSeconds?:number; isLocked?:boolean };
export type Server = { id:string; name:string; iconUrl?:string|null; channels:Channel[] };
export type Attachment = { id:string; originalName:string; mimeType:string; size:number; url:string };
export type MessageReaction = { emoji:string; count:number; userIds:string[] };
export type Message = { id:string; channelId:string; content:string; createdAt:string; editedAt?:string|null; isPinned?:boolean; replyToId?:string|null; replyTo?:{id:string;content:string;author:User}|null; attachments?:Attachment[]; reactions?:MessageReaction[]; author:User };
export type Invite = { id:string; code:string; serverId:string; expiresAt?:string|null; maxUses?:number|null; useCount:number; revokedAt?:string|null; createdAt:string; creator?:User };
export type InvitePreview = { code:string; server:{id:string;name:string;iconUrl?:string|null;memberCount:number}; expiresAt?:string|null; maxUses?:number|null; useCount:number };
export type Friend = User & { online:boolean };
export type FriendRequest = { id:string; createdAt:string; user:User };
export type FriendRequests = { incoming:FriendRequest[]; outgoing:FriendRequest[] };
export type BlockedUser = { id:string; createdAt:string; user:User };
export type DirectMessage = { id:string; conversationId:string; content:string; createdAt:string; editedAt?:string|null; isPinned?:boolean; replyToId?:string|null; replyTo?:{id:string;content:string;author:User}|null; attachments?:Attachment[]; reactions?:MessageReaction[]; author:User };
export type DirectConversation = { id:string; updatedAt:string; title?:string|null; isGroup:boolean; blocked?:boolean; members:User[]; other?:User|null; lastMessage?:DirectMessage|null };
export type DmUnreadSummary = { conversationId:string; count:number };
export type ServerBan = { id:string; serverId:string; userId:string; reason?:string|null; createdAt:string; user:User };
export type ServerAuditAction = 'MEMBER_KICKED'|'MEMBER_BANNED'|'MEMBER_UNBANNED'|'MEMBER_RESTRICTED'|'MEMBER_RESTRICTION_REMOVED';
export type ServerAuditLog = { id:string; serverId:string; actorId?:string|null; targetUserId?:string|null; actorName:string; targetName:string; action:ServerAuditAction; reason?:string|null; createdAt:string };
export type ChannelPermissionOverride = { role:Role; allow:Permission[]; deny:Permission[] };
export type VoiceToken = { token:string; url:string; room:string; channelId:string; canSpeak:boolean };
export type UnreadSummary = { channelId:string; count:number; mentions:number };
export type SearchMessageResult = { id:string; channelId:string; content:string; createdAt:string; author:User; channel:{id:string;name:string;groupName?:string|null} };

export const auth = { token:()=>localStorage.getItem('token'), set:(token:string)=>localStorage.setItem('token',token), clear:()=>localStorage.removeItem('token') };
async function throwApiError(r:Response):Promise<never>{
  const e=await r.json().catch(()=>({message:'İstek başarısız'}));
  if(r.status===401){auth.clear();if(typeof window!=='undefined')window.dispatchEvent(new Event('shakechat:session-expired'))}
  throw new ApiError(Array.isArray(e.message)?e.message.join(', '):e.message,r.status);
}
async function request<T>(path:string,init:RequestInit={}){
  const headers:Record<string,string>={'Content-Type':'application/json',...(init.headers as Record<string,string>||{})};const token=auth.token();if(token)headers.Authorization=`Bearer ${token}`;
  const r=await fetch(`${API}${path}`,{...init,headers});if(!r.ok)await throwApiError(r);if(r.status===204)return undefined as T;return r.json() as Promise<T>;
}
export const api={
  me:()=>request<User>('/auth/me'),
  updateMe:(data:{displayName?:string;avatarUrl?:string;statusText?:string;profileMode?:ProfileMode})=>request<User>('/auth/me',{method:'PATCH',body:JSON.stringify(data)}),
  privacy:()=>request<PrivacySettings>('/auth/privacy'),
  updatePrivacy:(data:Partial<PrivacySettings>)=>request<PrivacySettings>('/auth/privacy',{method:'PATCH',body:JSON.stringify(data)}),
  changePassword:(currentPassword:string,newPassword:string)=>request<{accessToken:string;user:User}>('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})}),
  rotateSessions:()=>request<{accessToken:string;user:User}>('/auth/rotate-sessions',{method:'POST'}),
  register:(email:string,username:string,password:string)=>request<any>('/auth/register',{method:'POST',body:JSON.stringify({email,username,password})}),
  login:(login:string,password:string)=>request<any>('/auth/login',{method:'POST',body:JSON.stringify({login,password})}),
  servers:()=>request<Server[]>('/servers'),
  createServer:(name:string)=>request<Server>('/servers',{method:'POST',body:JSON.stringify({name})}),
  createChannel:(serverId:string,name:string,type:'TEXT'|'VOICE',groupName?:string)=>request<Channel>(`/servers/${serverId}/channels`,{method:'POST',body:JSON.stringify(groupName?{name,type,groupName}:{name,type})}),
  updateChannel:(serverId:string,channelId:string,data:{name?:string;groupName?:string;position?:number;slowModeSeconds?:number;isLocked?:boolean})=>request<Channel>(`/servers/${serverId}/channels/${channelId}`,{method:'PATCH',body:JSON.stringify(data)}),
  deleteChannel:(serverId:string,channelId:string)=>request<{ok:boolean}>(`/servers/${serverId}/channels/${channelId}`,{method:'DELETE'}),
  members:(serverId:string)=>request<Array<{role:string;roles?:Role[];joinedAt:string;messageRestrictedUntil?:string|null;messageRestrictionReason?:string|null;user:User}>>(`/servers/${serverId}/members`),
  leaveServer:(serverId:string)=>request<{ok:boolean}>(`/servers/${serverId}/members/me`,{method:'DELETE'}),
  kickMember:(serverId:string,userId:string)=>request<{ok:boolean}>(`/servers/${serverId}/members/${userId}`,{method:'DELETE'}),
  restrictMemberMessages:(serverId:string,userId:string,durationMinutes:number,reason?:string)=>request<{ok:boolean;userId:string;messageRestrictedUntil:string;messageRestrictionReason?:string|null}>(`/servers/${serverId}/members/${userId}/message-restriction`,{method:'POST',body:JSON.stringify({durationMinutes,reason})}),
  clearMemberMessageRestriction:(serverId:string,userId:string)=>request<{ok:boolean;userId:string;messageRestrictedUntil:null;messageRestrictionReason:null}>(`/servers/${serverId}/members/${userId}/message-restriction`,{method:'DELETE'}),
  bans:(serverId:string)=>request<ServerBan[]>(`/servers/${serverId}/bans`),
  banMember:(serverId:string,userId:string,reason?:string)=>request<{ok:boolean}>(`/servers/${serverId}/bans/${userId}`,{method:'POST',body:JSON.stringify({reason})}),
  unbanMember:(serverId:string,userId:string)=>request<{ok:boolean}>(`/servers/${serverId}/bans/${userId}`,{method:'DELETE'}),
  auditLogs:(serverId:string,action?:ServerAuditAction)=>request<ServerAuditLog[]>(`/servers/${serverId}/audit${action?`?action=${encodeURIComponent(action)}`:''}`),
  myPermissions:(serverId:string,channelId?:string)=>request<{permissions:Permission[]}>(`/servers/${serverId}/permissions/me${channelId?`?channelId=${encodeURIComponent(channelId)}`:''}`),
  roles:(serverId:string)=>request<Role[]>(`/servers/${serverId}/roles`),
  createRole:(serverId:string,data:{name:string;color?:string;permissions:Permission[]})=>request<Role>(`/servers/${serverId}/roles`,{method:'POST',body:JSON.stringify(data)}),
  updateRole:(serverId:string,roleId:string,data:{name?:string;color?:string;permissions?:Permission[]})=>request<Role>(`/servers/${serverId}/roles/${roleId}`,{method:'PATCH',body:JSON.stringify(data)}),
  deleteRole:(serverId:string,roleId:string)=>request<{ok:boolean}>(`/servers/${serverId}/roles/${roleId}`,{method:'DELETE'}),
  assignRole:(serverId:string,userId:string,roleId:string)=>request<{ok:boolean;baseRole?:string}>(`/servers/${serverId}/members/${userId}/roles/${roleId}`,{method:'PUT'}),
  unassignRole:(serverId:string,userId:string,roleId:string)=>request<{ok:boolean}>(`/servers/${serverId}/members/${userId}/roles/${roleId}`,{method:'DELETE'}),
  channelOverrides:(serverId:string,channelId:string)=>request<ChannelPermissionOverride[]>(`/servers/${serverId}/channels/${channelId}/permissions`),
  setChannelOverride:(serverId:string,channelId:string,roleId:string,allow:Permission[],deny:Permission[])=>request<any>(`/servers/${serverId}/channels/${channelId}/permissions/${roleId}`,{method:'PUT',body:JSON.stringify({allow,deny})}),
  clearChannelOverride:(serverId:string,channelId:string,roleId:string)=>request<{ok:boolean}>(`/servers/${serverId}/channels/${channelId}/permissions/${roleId}`,{method:'DELETE'}),
  createInvite:(serverId:string,options:{expiresInHours?:number;maxUses?:number})=>request<Invite>(`/servers/${serverId}/invites`,{method:'POST',body:JSON.stringify(options)}),
  invites:(serverId:string)=>request<Invite[]>(`/servers/${serverId}/invites`),
  revokeInvite:(serverId:string,inviteId:string)=>request<{ok:boolean}>(`/servers/${serverId}/invites/${inviteId}`,{method:'DELETE'}),
  invitePreview:(code:string)=>request<InvitePreview>(`/invites/${encodeURIComponent(code)}/preview`),
  joinInvite:(code:string)=>request<{server:{id:string;name:string;iconUrl?:string|null};member:Member}>(`/invites/${encodeURIComponent(code)}/join`,{method:'POST'}),
  messages:(channelId:string)=>request<Message[]>(`/channels/${channelId}/messages`),
  markChannelRead:(channelId:string)=>request<{ok:boolean;channelId:string;lastReadAt:string}>(`/channels/${channelId}/messages/read`,{method:'POST'}),
  unreads:(serverId:string)=>request<UnreadSummary[]>(`/servers/${serverId}/unreads`),
  searchMessages:(serverId:string,q:string)=>request<SearchMessageResult[]>(`/servers/${serverId}/search?q=${encodeURIComponent(q)}`),
  sendMessage:(channelId:string,content:string,replyToId?:string)=>request<Message>(`/channels/${channelId}/messages`,{method:'POST',body:JSON.stringify({content,replyToId})}),
  uploadMessage:async(channelId:string,content:string,files:File[],replyToId?:string)=>{const form=new FormData();form.append('content',content);if(replyToId)form.append('replyToId',replyToId);files.forEach(file=>form.append('files',file));const token=auth.token();const r=await fetch(`${API}/channels/${channelId}/messages/upload`,{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:form});if(!r.ok)await throwApiError(r);return r.json() as Promise<Message>},
  editMessage:(channelId:string,messageId:string,content:string)=>request<Message>(`/channels/${channelId}/messages/${messageId}`,{method:'PATCH',body:JSON.stringify({content})}),
  togglePin:(channelId:string,messageId:string)=>request<Message>(`/channels/${channelId}/messages/${messageId}/pin`,{method:'POST'}),
  reactMessage:(channelId:string,messageId:string,emoji:string)=>request<Message>(`/channels/${channelId}/messages/${messageId}/reactions`,{method:'POST',body:JSON.stringify({emoji})}),
  unreactMessage:(channelId:string,messageId:string,emoji:string)=>request<Message>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,{method:'DELETE'}),
  deleteMessage:(channelId:string,messageId:string)=>request<{ok:boolean}>(`/channels/${channelId}/messages/${messageId}`,{method:'DELETE'}),
  bulkDeleteMessages:(channelId:string,count:number)=>request<{ok:boolean;ids:string[];count:number}>(`/channels/${channelId}/messages/bulk-delete`,{method:'POST',body:JSON.stringify({count})}),
  voiceToken:(channelId:string)=>request<VoiceToken>(`/voice/channels/${channelId}/token`,{method:'POST'}),
  friends:()=>request<Friend[]>('/friends'),friendRequests:()=>request<FriendRequests>('/friends/requests'),blockedUsers:()=>request<BlockedUser[]>('/friends/blocks'),
  sendFriendRequest:(username:string)=>request<FriendRequest>('/friends/requests',{method:'POST',body:JSON.stringify({username})}),acceptFriendRequest:(requestId:string)=>request<{friend:User}>(`/friends/requests/${requestId}/accept`,{method:'POST'}),deleteFriendRequest:(requestId:string)=>request<{ok:boolean}>(`/friends/requests/${requestId}`,{method:'DELETE'}),removeFriend:(friendId:string)=>request<{ok:boolean}>(`/friends/${friendId}`,{method:'DELETE'}),blockUser:(userId:string)=>request<{ok:boolean;user:User}>(`/friends/blocks/${userId}`,{method:'POST'}),unblockUser:(userId:string)=>request<{ok:boolean}>(`/friends/blocks/${userId}`,{method:'DELETE'}),
  dms:()=>request<DirectConversation[]>('/dms'),dmUnreads:()=>request<DmUnreadSummary[]>('/dms/unreads'),markDmRead:(conversationId:string)=>request<{ok:boolean;conversationId:string;lastReadAt:string}>(`/dms/${conversationId}/read`,{method:'POST'}),openDm:(friendId:string)=>request<DirectConversation>(`/dms/with/${friendId}`,{method:'POST'}),createGroupDm:(memberIds:string[],title?:string)=>request<DirectConversation>('/dms/group',{method:'POST',body:JSON.stringify({memberIds,title})}),dmMessages:(conversationId:string)=>request<DirectMessage[]>(`/dms/${conversationId}/messages`),sendDm:(conversationId:string,content:string,replyToId?:string)=>request<DirectMessage>(`/dms/${conversationId}/messages`,{method:'POST',body:JSON.stringify({content,replyToId})}),
  uploadDm:async(conversationId:string,content:string,files:File[],replyToId?:string)=>{const form=new FormData();form.append('content',content);if(replyToId)form.append('replyToId',replyToId);files.forEach(file=>form.append('files',file));const token=auth.token();const r=await fetch(`${API}/dms/${conversationId}/messages/upload`,{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:form});if(!r.ok)await throwApiError(r);return r.json() as Promise<DirectMessage>},
  editDm:(conversationId:string,messageId:string,content:string)=>request<DirectMessage>(`/dms/${conversationId}/messages/${messageId}`,{method:'PATCH',body:JSON.stringify({content})}),toggleDmPin:(conversationId:string,messageId:string)=>request<DirectMessage>(`/dms/${conversationId}/messages/${messageId}/pin`,{method:'POST'}),reactDm:(conversationId:string,messageId:string,emoji:string)=>request<DirectMessage>(`/dms/${conversationId}/messages/${messageId}/reactions`,{method:'POST',body:JSON.stringify({emoji})}),unreactDm:(conversationId:string,messageId:string,emoji:string)=>request<DirectMessage>(`/dms/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,{method:'DELETE'}),deleteDm:(conversationId:string,messageId:string)=>request<{ok:boolean}>(`/dms/${conversationId}/messages/${messageId}`,{method:'DELETE'}),
};
