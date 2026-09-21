import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdatePrivacyDto, UpdateProfileDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @UseGuards(AuthGuard) @Get('me') me(@Req() req: any) { return this.auth.me(req.user.sub); }
  @UseGuards(AuthGuard) @Patch('me') updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) { return this.auth.updateProfile(req.user.sub, dto); }
  @UseGuards(AuthGuard) @Get('privacy') privacy(@Req() req: any) { return this.auth.privacy(req.user.sub); }
  @UseGuards(AuthGuard) @Patch('privacy') updatePrivacy(@Req() req: any, @Body() dto: UpdatePrivacyDto) { return this.auth.updatePrivacy(req.user.sub, dto); }
  @UseGuards(AuthGuard) @Post('change-password') changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(req.user.sub, dto); }
  @UseGuards(AuthGuard) @Post('rotate-sessions') rotateSessions(@Req() req: any) { return this.auth.rotateSessions(req.user.sub); }
}
