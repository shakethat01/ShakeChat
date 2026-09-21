import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MessagesGateway } from '../messages/messages.gateway';
import { CreateRoleDto, SetChannelOverrideDto, UpdateRoleDto } from './dto';
import { PermissionsService } from './permissions.service';

@UseGuards(AuthGuard)
@Controller('servers/:serverId')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService, private readonly gateway: MessagesGateway) {}

  @Get('permissions/me')
  me(@Req() req:any,@Param('serverId') serverId:string,@Query('channelId') channelId?:string){
    return this.permissions.effective(req.user.sub,serverId,channelId).then(permissions=>({permissions}));
  }

  @Get('roles')
  list(@Req() req:any,@Param('serverId') serverId:string){return this.permissions.listRoles(req.user.sub,serverId)}

  @Post('roles')
  create(@Req() req:any,@Param('serverId') serverId:string,@Body() dto:CreateRoleDto){return this.permissions.createRole(req.user.sub,serverId,dto)}

  @Patch('roles/:roleId')
  async update(@Req() req:any,@Param('serverId') serverId:string,@Param('roleId') roleId:string,@Body() dto:UpdateRoleDto){
    const role=await this.permissions.updateRole(req.user.sub,serverId,roleId,dto);
    const affected=await this.permissions.memberIdsForRole(role);
    await this.gateway.refreshServerAccess(serverId,affected);
    return role;
  }

  @Delete('roles/:roleId')
  async remove(@Req() req:any,@Param('serverId') serverId:string,@Param('roleId') roleId:string){
    const result=await this.permissions.deleteRole(req.user.sub,serverId,roleId);
    await this.gateway.refreshServerAccess(serverId,result.affectedUserIds);
    return {ok:true};
  }

  @Put('members/:userId/roles/:roleId')
  async assign(@Req() req:any,@Param('serverId') serverId:string,@Param('userId') userId:string,@Param('roleId') roleId:string){
    const result=await this.permissions.assignRole(req.user.sub,serverId,userId,roleId);
    await this.gateway.refreshServerAccess(serverId,[userId]);
    return result;
  }

  @Delete('members/:userId/roles/:roleId')
  async unassign(@Req() req:any,@Param('serverId') serverId:string,@Param('userId') userId:string,@Param('roleId') roleId:string){
    const result=await this.permissions.unassignRole(req.user.sub,serverId,userId,roleId);
    await this.gateway.refreshServerAccess(serverId,[userId]);
    return result;
  }

  @Get('channels/:channelId/permissions')
  overrides(@Req() req:any,@Param('serverId') serverId:string,@Param('channelId') channelId:string){return this.permissions.listChannelOverrides(req.user.sub,serverId,channelId)}

  @Put('channels/:channelId/permissions/:roleId')
  async setOverride(@Req() req:any,@Param('serverId') serverId:string,@Param('channelId') channelId:string,@Param('roleId') roleId:string,@Body() dto:SetChannelOverrideDto){
    const result=await this.permissions.setChannelOverride(req.user.sub,serverId,channelId,roleId,dto);
    const role=await this.permissions.listRoles(req.user.sub,serverId).then(roles=>roles.find(item=>item.id===roleId));
    if(role) await this.gateway.refreshServerAccess(serverId,await this.permissions.memberIdsForRole(role));
    return result;
  }

  @Delete('channels/:channelId/permissions/:roleId')
  async clearOverride(@Req() req:any,@Param('serverId') serverId:string,@Param('channelId') channelId:string,@Param('roleId') roleId:string){
    const roles=await this.permissions.listRoles(req.user.sub,serverId); const role=roles.find(item=>item.id===roleId);
    const result=await this.permissions.clearChannelOverride(req.user.sub,serverId,channelId,roleId);
    if(role) await this.gateway.refreshServerAccess(serverId,await this.permissions.memberIdsForRole(role));
    return result;
  }
}
