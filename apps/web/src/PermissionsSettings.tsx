import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Shield, Trash2, UserCog } from 'lucide-react';
import { api, Member, Permission, Role, Server, User } from './api';

export const PERMISSION_LABELS: Array<[Permission,string]> = [
  ['ADMINISTRATOR','Yönetici — tüm izinleri atlar'],
  ['MANAGE_SERVER','Sunucuyu yönet'],
  ['MANAGE_CHANNELS','Kanalları oluştur / sil'],
  ['MANAGE_ROLES','Rolleri ve kanal izinlerini yönet'],
  ['KICK_MEMBERS','Üye çıkar'],
  ['BAN_MEMBERS','Üyeyi yasakla'],
  ['MODERATE_MEMBERS','Üyeye süreli yazma kısıtı uygula'],
  ['MANAGE_MESSAGES','Başkalarının mesajlarını sil'],
  ['MANAGE_INVITES','Davetleri yönet'],
  ['VIEW_CHANNEL','Kanalı gör'],
  ['SEND_MESSAGES','Mesaj gönder'],
  ['CONNECT_VOICE','Ses kanalına bağlan'],
  ['SPEAK','Ses kanalında konuş'],
];

function RoleBadge({role,onRemove}:{role:Role;onRemove?:()=>void}){
  return <span className="role-chip" style={role.color?{borderColor:role.color}:undefined}><i style={role.color?{background:role.color}:undefined}/>{role.name}{onRemove&&<button aria-label={`${role.name} rolünü kaldır`} onClick={onRemove}>×</button>}</span>;
}

export function RolesSettings({server,members,me,onChanged}:{server:Server;members:Member[];me:User;onChanged:()=>void}){
  const [roles,setRoles]=useState<Role[]>([]);const [selectedId,setSelectedId]=useState('');const [name,setName]=useState('');const [color,setColor]=useState('#6857f5');const [perms,setPerms]=useState<Permission[]>([]);const [newName,setNewName]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const selected=roles.find(role=>role.id===selectedId);
  const meMember=members.find(member=>member.id===me.id);const isOwner=meMember?.role==='OWNER';
  async function load(){try{const rows=await api.roles(server.id);setRoles(rows);setSelectedId(current=>rows.some(r=>r.id===current)?current:(rows.find(r=>!r.isManaged)?.id||rows.find(r=>r.legacyRole==='MODERATOR')?.id||rows[0]?.id||''))}catch(e){setError((e as Error).message)}}
  useEffect(()=>{void load()},[server.id]);
  useEffect(()=>{if(!selected)return;setName(selected.name);setColor(selected.color||'#6857f5');setPerms(selected.permissions)},[selectedId,roles]);
  async function create(){if(!newName.trim()||busy)return;setBusy(true);setError('');try{const role=await api.createRole(server.id,{name:newName.trim(),permissions:[]});setNewName('');await load();setSelectedId(role.id);onChanged()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function save(){if(!selected||busy)return;setBusy(true);setError('');try{await api.updateRole(server.id,selected.id,{...(selected.isManaged?{}:{name:name.trim()}),color,permissions:perms});await load();onChanged()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function remove(){if(!selected||selected.isManaged||busy)return;if(!confirm(`“${selected.name}” rolü silinsin mi?`))return;setBusy(true);setError('');try{await api.deleteRole(server.id,selected.id);setSelectedId('');await load();onChanged()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function assign(memberId:string,roleId:string){if(!roleId)return;setError('');try{await api.assignRole(server.id,memberId,roleId);onChanged()}catch(e){setError((e as Error).message)}}
  async function unassign(memberId:string,roleId:string){setError('');try{await api.unassignRole(server.id,memberId,roleId);onChanged()}catch(e){setError((e as Error).message)}}
  function toggle(permission:Permission){setPerms(current=>current.includes(permission)?current.filter(p=>p!==permission):[...current,permission])}
  return <div className="roles-layout">
    {error&&<div className="error banner">{error}</div>}
    <div className="role-list-pane">
      <div className="role-create"><input aria-label="Yeni rol adı" value={newName} onChange={e=>setNewName(e.target.value)} maxLength={40} placeholder="Yeni rol"/><button className="primary compact" onClick={create} disabled={!newName.trim()||busy}><Plus size={15}/> Ekle</button></div>
      <div className="role-list">{roles.map(role=><button key={role.id} className={role.id===selectedId?'role-item selected':'role-item'} onClick={()=>setSelectedId(role.id)}><i style={role.color?{background:role.color}:undefined}/><span><b>{role.name}</b><small>{role.isManaged?'Sistem rolü':'Özel rol'} · {role.memberCount??0} üye</small></span></button>)}</div>
    </div>
    <div className="role-editor">{selected?<><div className="role-editor-head"><Shield size={22}/><div><h3>{selected.name}</h3><small>{selected.isManaged?'Sistem rolü':'Özel rol'}</small></div></div>
      <div className="role-fields"><label>ROL ADI<input value={name} disabled={selected.isManaged} onChange={e=>setName(e.target.value)} maxLength={40}/></label><label>RENK<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label></div>
      <h4>İzinler</h4><div className="permission-grid">{PERMISSION_LABELS.map(([permission,label])=><label key={permission} className="permission-toggle"><input type="checkbox" checked={perms.includes(permission)} disabled={selected.legacyRole==='OWNER'||(!isOwner&&(permission==='ADMINISTRATOR'||permission==='MANAGE_ROLES'))} onChange={()=>toggle(permission)}/><span>{label}</span></label>)}</div>
      <div className="role-actions"><button className="primary compact" onClick={save} disabled={selected.legacyRole==='OWNER'||busy}><Save size={15}/> Kaydet</button>{!selected.isManaged&&<button className="danger" onClick={remove} disabled={busy}><Trash2 size={15}/> Rolü sil</button>}</div>
    </>:<div className="empty settings-empty"><Shield size={36}/><p>Düzenlemek için bir rol seç.</p></div>}</div>
    <div className="member-role-pane"><h3><UserCog size={18}/> Üye rolleri</h3><div className="settings-list">{members.map(member=><div className="member-role-row" key={member.id}><div className="grow"><b>{member.displayName||member.username}</b><div className="role-chips">{(member.roles||[]).map(role=><RoleBadge key={role.id} role={role} onRemove={!role.isManaged&&member.id!==me.id?()=>unassign(member.id,role.id):undefined}/>)}</div></div>{member.role!=='OWNER'&&<select aria-label={`${member.username} için rol ekle`} defaultValue="" onChange={e=>{void assign(member.id,e.target.value);e.currentTarget.value=''}}><option value="">Rol ekle…</option>{roles.filter(role=>!(member.roles||[]).some(current=>current.id===role.id)&&role.legacyRole!=='OWNER').map(role=><option value={role.id} key={role.id}>{role.name}{role.isManaged?' (temel)':''}</option>)}</select>}</div>)}</div></div>
  </div>;
}

export function ChannelPermissionsSettings({server,onChanged}:{server:Server;onChanged:()=>void}){
  const [channelId,setChannelId]=useState(server.channels[0]?.id||'');const [rows,setRows]=useState<Array<{role:Role;allow:Permission[];deny:Permission[]}>>([]);const [roleId,setRoleId]=useState('');const [state,setState]=useState<Record<Permission,'inherit'|'allow'|'deny'>>({} as any);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const row=rows.find(item=>item.role.id===roleId);const channels=server.channels;
  async function load(id=channelId){if(!id)return;try{const result=await api.channelOverrides(server.id,id);setRows(result);setRoleId(current=>result.some(r=>r.role.id===current&&r.role.legacyRole!=='OWNER')?current:(result.find(r=>r.role.legacyRole!=='OWNER')?.role.id||''))}catch(e){setError((e as Error).message)}}
  useEffect(()=>{void load(channelId)},[server.id,channelId]);
  useEffect(()=>{const next={} as Record<Permission,'inherit'|'allow'|'deny'>;for(const [permission] of PERMISSION_LABELS)next[permission]=row?.allow.includes(permission)?'allow':row?.deny.includes(permission)?'deny':'inherit';setState(next)},[roleId,rows]);
  async function save(){if(!channelId||!roleId)return;setBusy(true);setError('');try{const allow=PERMISSION_LABELS.map(([p])=>p).filter(p=>state[p]==='allow');const deny=PERMISSION_LABELS.map(([p])=>p).filter(p=>state[p]==='deny');await api.setChannelOverride(server.id,channelId,roleId,allow,deny);await load(channelId);onChanged()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function clear(){if(!channelId||!roleId)return;setBusy(true);setError('');try{await api.clearChannelOverride(server.id,channelId,roleId);await load(channelId);onChanged()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const role=useMemo(()=>rows.find(item=>item.role.id===roleId)?.role,[rows,roleId]);
  return <div className="channel-permissions">{error&&<div className="error banner">{error}</div>}<div className="override-selectors"><label>KANAL<select value={channelId} onChange={e=>setChannelId(e.target.value)}>{channels.map(channel=><option key={channel.id} value={channel.id}>{channel.type==='TEXT'?'#':'🔊'} {channel.name}</option>)}</select></label><label>ROL<select value={roleId} onChange={e=>setRoleId(e.target.value)}>{rows.filter(item=>item.role.legacyRole!=='OWNER').map(item=><option key={item.role.id} value={item.role.id}>{item.role.name}</option>)}</select></label></div>
    {role?<><div className="override-note"><Shield size={18}/><span><b>{role.name}</b> için bu kanaldaki izinleri ayarla. İzin ver, aynı seviyedeki reddetmenin önüne geçer.</span></div><div className="override-grid">{PERMISSION_LABELS.filter(([p])=>!['ADMINISTRATOR','MANAGE_SERVER','MANAGE_ROLES','MANAGE_INVITES','KICK_MEMBERS','BAN_MEMBERS','MODERATE_MEMBERS'].includes(p)).map(([permission,label])=><label key={permission}><span>{label}</span><select value={state[permission]||'inherit'} onChange={e=>setState(current=>({...current,[permission]:e.target.value as any}))}><option value="inherit">Varsayılan</option><option value="allow">İzin ver</option><option value="deny">Reddet</option></select></label>)}</div><div className="role-actions"><button className="primary compact" onClick={save} disabled={busy}><Save size={15}/> Kanal izinlerini kaydet</button><button className="ghost-small" onClick={clear} disabled={busy}>Override'ı temizle</button></div></>:<div className="empty settings-empty"><p>Ayarlanabilir rol yok.</p></div>}</div>;
}
