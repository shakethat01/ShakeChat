// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({
 me:{id:'alice',username:'alice'},
 server:{id:'server',name:'Friends',channels:[{id:'text',name:'general',type:'TEXT',position:0,slowModeSeconds:0,isLocked:false},{id:'voice',name:'Voice',type:'VOICE',position:1,slowModeSeconds:0,isLocked:false}]},
 createServer:vi.fn(),createChannel:vi.fn(),updateChannel:vi.fn(),bulkDeleteMessages:vi.fn(),send:vi.fn(),announce:vi.fn(),invites:vi.fn(),createInvite:vi.fn(),revokeInvite:vi.fn(),leaveServer:vi.fn(),kickMember:vi.fn(),bans:vi.fn(),banMember:vi.fn(),unbanMember:vi.fn(),auditLogs:vi.fn(),friends:vi.fn(),friendRequests:vi.fn(),blockedUsers:vi.fn(),dms:vi.fn(),dmUnreads:vi.fn(),markDmRead:vi.fn(),myPermissions:vi.fn(),roles:vi.fn(),voiceJoin:vi.fn(),markRead:vi.fn(),unreads:vi.fn(),searchMessages:vi.fn(),updateMe:vi.fn(),privacy:vi.fn(),updatePrivacy:vi.fn(),changePassword:vi.fn(),rotateSessions:vi.fn(),
 socket:{connected:true,on:vi.fn(),off:vi.fn(),timeout:vi.fn(),emit:vi.fn(),connect:vi.fn()},
}));
vi.mock('./api',()=>({
 auth:{token:()=> 'test-token',clear:vi.fn(),set:vi.fn()},ApiError:class extends Error{},
 api:{me:async()=>mocks.me,updateMe:mocks.updateMe,privacy:mocks.privacy,updatePrivacy:mocks.updatePrivacy,changePassword:mocks.changePassword,rotateSessions:mocks.rotateSessions,servers:async()=>[mocks.server],createServer:mocks.createServer,createChannel:mocks.createChannel,updateChannel:mocks.updateChannel,deleteChannel:vi.fn(),markChannelRead:mocks.markRead,unreads:mocks.unreads,searchMessages:mocks.searchMessages,sendMessage:mocks.send,uploadMessage:vi.fn(),editMessage:vi.fn(),togglePin:vi.fn(),reactMessage:vi.fn(),unreactMessage:vi.fn(),deleteMessage:vi.fn(),bulkDeleteMessages:mocks.bulkDeleteMessages,myPermissions:mocks.myPermissions,roles:mocks.roles,createRole:vi.fn(),updateRole:vi.fn(),deleteRole:vi.fn(),assignRole:vi.fn(),unassignRole:vi.fn(),channelOverrides:vi.fn(),setChannelOverride:vi.fn(),clearChannelOverride:vi.fn(),invites:mocks.invites,createInvite:mocks.createInvite,revokeInvite:mocks.revokeInvite,leaveServer:mocks.leaveServer,kickMember:mocks.kickMember,bans:mocks.bans,banMember:mocks.banMember,unbanMember:mocks.unbanMember,auditLogs:mocks.auditLogs,invitePreview:vi.fn(),joinInvite:vi.fn(),friends:mocks.friends,friendRequests:mocks.friendRequests,blockedUsers:mocks.blockedUsers,dms:mocks.dms,dmUnreads:mocks.dmUnreads,markDmRead:mocks.markDmRead,sendFriendRequest:vi.fn(),acceptFriendRequest:vi.fn(),deleteFriendRequest:vi.fn(),removeFriend:vi.fn(),blockUser:vi.fn(),unblockUser:vi.fn(),openDm:vi.fn(),createGroupDm:vi.fn(),sendDm:vi.fn(),uploadDm:vi.fn(),editDm:vi.fn(),toggleDmPin:vi.fn(),reactDm:vi.fn(),unreactDm:vi.fn(),deleteDm:vi.fn(),dmMessages:vi.fn()},
}));
vi.mock('./socket',()=>({closeChatSocket:vi.fn(),chatSocket:()=>mocks.socket}));
vi.mock('./useChat',()=>({useChat:()=>({messages:[],members:[{...mocks.me,role:'OWNER',online:true},{id:'bob',username:'bob',role:'MEMBER',online:false}],typingUsers:[],socketOnline:true,loading:false,announceTyping:mocks.announce,appendSent:vi.fn()})}));
vi.mock('./useDirectMessages',()=>({useDirectMessages:()=>({messages:[],typingUsers:[],loading:false,announceTyping:vi.fn(),appendSent:vi.fn()})}));
vi.mock('./useVoice',()=>({useVoice:()=>({status:'disconnected',channelId:'',participants:[],muted:true,deafened:false,canSpeak:true,inputDevices:[],outputDevices:[],inputDeviceId:'',outputDeviceId:'',join:mocks.voiceJoin,leave:vi.fn(),toggleMute:vi.fn(),toggleDeafen:vi.fn(),switchInput:vi.fn(),switchOutput:vi.fn(),refreshDevices:vi.fn()})}));
import {App} from './App';
beforeEach(()=>{
 vi.clearAllMocks();mocks.socket.connected=true;mocks.socket.on.mockReturnValue(mocks.socket);mocks.socket.off.mockReturnValue(mocks.socket);mocks.socket.timeout.mockReturnValue(mocks.socket);mocks.socket.emit.mockReturnValue(mocks.socket);
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
 mocks.createServer.mockResolvedValue({id:'new-server',name:'New friends',channels:[]});
 mocks.createChannel.mockResolvedValue({id:'new-voice',name:'Gaming',type:'VOICE',position:2});
 mocks.send.mockImplementation(async(channelId,content)=>({id:'m1',channelId,content,createdAt:new Date().toISOString(),author:mocks.me}));
 mocks.privacy.mockResolvedValue({friendRequestPolicy:'EVERYONE',allowGroupDmInvites:true});mocks.updatePrivacy.mockImplementation(async data=>({friendRequestPolicy:'EVERYONE',allowGroupDmInvites:true,...data}));mocks.changePassword.mockResolvedValue({accessToken:'new-token',user:mocks.me});mocks.rotateSessions.mockResolvedValue({accessToken:'new-token',user:mocks.me});mocks.friends.mockResolvedValue([]);mocks.friendRequests.mockResolvedValue({incoming:[],outgoing:[]});mocks.blockedUsers.mockResolvedValue([]);mocks.dms.mockResolvedValue([]);mocks.dmUnreads.mockResolvedValue([]);mocks.markDmRead.mockResolvedValue({ok:true});mocks.myPermissions.mockResolvedValue({permissions:['ADMINISTRATOR']});mocks.roles.mockResolvedValue([]);mocks.markRead.mockResolvedValue({ok:true});mocks.unreads.mockResolvedValue([]);mocks.searchMessages.mockResolvedValue([]);mocks.updateMe.mockImplementation(async data=>({...mocks.me,...data}));mocks.updateChannel.mockResolvedValue({});mocks.bulkDeleteMessages.mockResolvedValue({ok:true,ids:['m1','m2'],count:2});
 mocks.invites.mockResolvedValue([]);mocks.createInvite.mockResolvedValue({id:'i1',code:'abc123',serverId:'server',useCount:0,maxUses:null,revokedAt:null,createdAt:new Date().toISOString(),creator:mocks.me});mocks.revokeInvite.mockResolvedValue({ok:true});mocks.leaveServer.mockResolvedValue({ok:true});mocks.kickMember.mockResolvedValue({ok:true});mocks.bans.mockResolvedValue([]);mocks.banMember.mockResolvedValue({ok:true});mocks.unbanMember.mockResolvedValue({ok:true});mocks.auditLogs.mockResolvedValue([{id:'a1',serverId:'server',actorId:'alice',targetUserId:'bob',actorName:'alice',targetName:'bob',action:'MEMBER_BANNED',reason:'spam',createdAt:new Date('2026-09-10T12:00:00Z').toISOString()}]);
});
afterEach(cleanup);
it('creates a server through an application modal',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Sunucu oluştur'}));
 const dialog=screen.getByRole('dialog',{name:'Sunucu oluştur'});expect(dialog.hasAttribute('open')).toBe(true);
 await user.type(screen.getByLabelText('AD'),'New friends');await user.click(screen.getByRole('button',{name:/^Oluştur$/}));
 await waitFor(()=>expect(mocks.createServer).toHaveBeenCalledWith('New friends'));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('voice-channel button preselects VOICE and saves it',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByTitle('Ses kanalı oluştur'));expect(screen.getByRole('button',{name:/Ses kanalı Ses kanalı kaydı/}).className).toContain('selected');
 await user.type(screen.getByLabelText('AD'),'Gaming');await user.click(screen.getByRole('button',{name:/^Oluştur$/}));
 await waitFor(()=>expect(mocks.createChannel).toHaveBeenCalledWith('server','Gaming','VOICE'));
});
it('preserves multiline drafts; Enter sends and hover actions remain real controls',async()=>{
 render(<App/>);const input=await screen.findByRole('textbox',{name:'Mesaj'});
 fireEvent.change(input,{target:{value:'line one\nline two'}});fireEvent.keyDown(input,{key:'Enter',shiftKey:true});expect(mocks.send).not.toHaveBeenCalled();
 fireEvent.keyDown(input,{key:'Enter'});await waitFor(()=>expect(mocks.send).toHaveBeenCalledWith('text','line one\nline two'));
 await waitFor(()=>expect((input as HTMLTextAreaElement).value).toBe(''));
});
it('renders actual member names and online/offline totals',async()=>{
 render(<App/>);await screen.findByText('Friends');expect(screen.getByText('ÇEVRİMİÇİ — 1')).toBeTruthy();expect(screen.getByText('ÇEVRİMDIŞI — 1')).toBeTruthy();expect(screen.getByText('bob')).toBeTruthy();
});

it('opens server settings and creates an invite',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Sunucu ayarları'}));expect(screen.getByRole('dialog',{name:'Sunucu üyeleri'})).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Davetler'}));await waitFor(()=>expect(mocks.invites).toHaveBeenCalledWith('server'));await user.click(screen.getByRole('button',{name:/Davet oluştur/}));
 await waitFor(()=>expect(mocks.createInvite).toHaveBeenCalledWith('server',{expiresInHours:24,maxUses:undefined}));
 expect(await screen.findByText('abc123')).toBeTruthy();
});


it('shows permission-aware moderation history in server settings',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Sunucu ayarları'}));
 await user.click(screen.getByRole('button',{name:/İşlem geçmişi/}));
 await waitFor(()=>expect(mocks.auditLogs).toHaveBeenCalledWith('server',undefined));
 expect(await screen.findByText('alice → bob · Yasaklandı')).toBeTruthy();
 expect(screen.getByText(/Neden: spam/)).toBeTruthy();
 await user.selectOptions(screen.getByLabelText('İŞLEM TÜRÜ'),'MEMBER_BANNED');
 await waitFor(()=>expect(mocks.auditLogs).toHaveBeenCalledWith('server','MEMBER_BANNED'));
});

it('opens the friends home from the ShakeChat button',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');await user.click(screen.getByRole('button',{name:'Arkadaşlar ve özel mesajlar'}));expect(await screen.findByRole('heading',{name:'Arkadaşlar'})).toBeTruthy();expect(screen.getByPlaceholderText('Örn. aykut')).toBeTruthy();
});

it('clicking a voice channel starts LiveKit join',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');await user.click(screen.getByRole('button',{name:'Voice'}));await waitFor(()=>expect(mocks.voiceJoin).toHaveBeenCalledWith('voice'));
});

it('offers member mentions without copying a Discord-style picker',async()=>{
 const user=userEvent.setup();render(<App/>);const input=await screen.findByRole('textbox',{name:'Mesaj'});
 await user.type(input,'selam @b');expect(await screen.findByText('@bob')).toBeTruthy();await user.click(screen.getByText('@bob'));
 expect((input as HTMLTextAreaElement).value).toBe('selam @bob ');
});

it('opens the profile card and saves ShakeChat profile fields',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');await user.click(screen.getByRole('button',{name:'Profil kartı'}));
 expect(screen.getByRole('dialog',{name:'Profilini düzenle'})).toBeTruthy();const name=screen.getByLabelText('GÖRÜNEN AD');await user.type(name,'Aykut');await user.click(screen.getByRole('button',{name:'Profili kaydet'}));
 await waitFor(()=>expect(mocks.updateMe).toHaveBeenCalledWith(expect.objectContaining({displayName:'Aykut'})));
});

it('opens server-wide message search from the flow header',async()=>{
 const user=userEvent.setup();mocks.searchMessages.mockResolvedValue([{id:'found',channelId:'text',content:'aranan mesaj',createdAt:new Date().toISOString(),author:mocks.me,channel:{id:'text',name:'general'}}]);
 render(<App/>);await screen.findByText('Friends');await user.click(screen.getByRole('button',{name:'Mesaj ara'}));await user.type(screen.getByPlaceholderText('En az 2 karakter yaz…'),'aranan');await user.click(screen.getByRole('button',{name:'Ara'}));
 expect(await screen.findByText('aranan mesaj')).toBeTruthy();expect(mocks.searchMessages).toHaveBeenCalledWith('server','aranan');
});

it('stores original ShakeChat appearance and Ultra screen-share preferences locally',async()=>{
 const user=userEvent.setup();localStorage.removeItem('shakechat.preferences.v10');render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Uygulama ayarları'}));expect(screen.getByRole('dialog',{name:'Hesap ve oturum güvenliği'})).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Görünüm'}));await user.click(screen.getByRole('button',{name:/Gelgit/}));await user.click(screen.getByRole('button',{name:'Ses & görüntü'}));
 await user.selectOptions(screen.getByLabelText('Ekran paylaşımı kalite profili'),'ultra');await user.click(screen.getByRole('button',{name:'Ayarları kaydet'}));
 const saved=JSON.parse(localStorage.getItem('shakechat.preferences.v10')||'{}');expect(saved.theme).toBe('tide');expect(saved.screenQuality).toBe('ultra');
});


it('saves privacy controls from the account settings surface',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Uygulama ayarları'}));
 await user.click(screen.getByRole('button',{name:'Gizlilik'}));
 await waitFor(()=>expect(mocks.privacy).toHaveBeenCalled());
 const select=await screen.findByLabelText('İSTEK KAYNAĞI');await user.selectOptions(select,'NOBODY');
 const toggle=screen.getByRole('checkbox');await user.click(toggle);
 await user.click(screen.getByRole('button',{name:'Gizliliği kaydet'}));
 await waitFor(()=>expect(mocks.updatePrivacy).toHaveBeenCalledWith({friendRequestPolicy:'NOBODY',allowGroupDmInvites:false}));
});

it('shows persisted DM unread count and marks the conversation read when opened',async()=>{
 const user=userEvent.setup();
 const bob={id:'bob',username:'bob',displayName:'Bob'};
 mocks.dms.mockResolvedValue([{id:'dm1',updatedAt:new Date().toISOString(),title:null,isGroup:false,blocked:false,members:[mocks.me,bob],other:bob,lastMessage:{id:'dm-msg',conversationId:'dm1',content:'selam',createdAt:new Date().toISOString(),author:bob}}]);
 mocks.dmUnreads.mockResolvedValue([{conversationId:'dm1',count:3}]);
 render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Arkadaşlar ve özel mesajlar'}));
 expect(await screen.findByText('3',{selector:'.dm-unread-badge'})).toBeTruthy();
 await user.click(screen.getByRole('button',{name:/Bob/}));
 await waitFor(()=>expect(mocks.markDmRead).toHaveBeenCalledWith('dm1'));
});


it('stores push-to-talk mode and its key binding locally',async()=>{
 const user=userEvent.setup();localStorage.removeItem('shakechat.preferences.v10');render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Uygulama ayarları'}));await user.click(screen.getByRole('button',{name:'Ses & görüntü'}));
 await user.click(screen.getByRole('button',{name:'Bas-konuş'}));
 const keyButton=screen.getByRole('button',{name:'Bas-konuş tuşunu değiştir'});await user.click(keyButton);fireEvent.keyDown(keyButton,{key:'v',code:'KeyV'});
 await user.click(screen.getByRole('button',{name:'Ayarları kaydet'}));
 const saved=JSON.parse(localStorage.getItem('shakechat.preferences.v10')||'{}');expect(saved.voiceInputMode).toBe('push_to_talk');expect(saved.pushToTalkKey).toBe('KeyV');
});

it('configures backend-backed slow mode from the flow organizer',async()=>{
 const user=userEvent.setup();
 mocks.server.channels[0].slowModeSeconds=10;
 render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Sunucu ayarları'}));
 await user.click(screen.getByRole('button',{name:'Akış düzeni'}));
 const select=screen.getByLabelText('general yavaş mod') as HTMLSelectElement;
 expect(select.value).toBe('10');
 await user.selectOptions(select,'30');
 await waitFor(()=>expect(mocks.updateChannel).toHaveBeenCalledWith('server','text',{slowModeSeconds:30}));
 await user.click(screen.getByRole('button',{name:'general kilitle'}));
 await waitFor(()=>expect(mocks.updateChannel).toHaveBeenCalledWith('server','text',{isLocked:true}));
 mocks.server.channels[0].slowModeSeconds=0;mocks.server.channels[0].isLocked=false;
});

it('groups flow moderation actions in one guarded toolbox',async()=>{
 const user=userEvent.setup();render(<App/>);await screen.findByText('Friends');
 await user.click(screen.getByRole('button',{name:'Moderasyon araçları'}));
 expect(screen.getByRole('menu')).toBeTruthy();
 await user.selectOptions(screen.getByLabelText('Mesaj aralığı'),'30');
 await waitFor(()=>expect(mocks.updateChannel).toHaveBeenCalledWith('server','text',{slowModeSeconds:30}));
 await user.click(screen.getByRole('menuitem',{name:/Akışı kilitle/}));
 await waitFor(()=>expect(mocks.updateChannel).toHaveBeenCalledWith('server','text',{isLocked:true}));
 const promptSpy=vi.spyOn(window,'prompt').mockReturnValue('20');const confirmSpy=vi.spyOn(window,'confirm').mockReturnValue(true);
 await user.click(screen.getByRole('menuitem',{name:/Son mesajları temizle/}));
 await waitFor(()=>expect(mocks.bulkDeleteMessages).toHaveBeenCalledWith('text',20));
 promptSpy.mockRestore();confirmSpy.mockRestore();
});

