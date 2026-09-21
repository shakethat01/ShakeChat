import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdatePrivacyDto, UpdateProfileDto } from './dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private safeUser(user: any) {
    const { passwordHash, email, authVersion, friendRequestPolicy, allowGroupDmInvites, ...safe } = user;
    return safe;
  }

  private token(user: { id: string; username: string; authVersion?: number }) {
    return this.jwt.sign({ sub: user.id, username: user.username, v: Number(user.authVersion ?? 0) });
  }

  async register(dto: RegisterDto) {
    const username = dto.username.trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new BadRequestException('Kullanıcı adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.');
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username }] },
    });
    if (exists) throw new BadRequestException('E-posta veya kullanıcı adı zaten kullanılıyor.');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username,
        passwordHash: await argon2.hash(dto.password),
      },
    });
    return { accessToken: this.token(user), user: this.safeUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.login.toLowerCase() }, { username: dto.login }] },
    });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Kullanıcı adı/e-posta veya şifre yanlış.');
    }
    return { accessToken: this.token(user), user: this.safeUser(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    return this.safeUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const displayName = dto.displayName === undefined ? undefined : dto.displayName.trim().slice(0, 48) || null;
    const statusText = dto.statusText === undefined ? undefined : dto.statusText.trim().slice(0, 96) || null;
    const rawAvatar = dto.avatarUrl === undefined ? undefined : dto.avatarUrl.trim();
    let avatarUrl: string | null | undefined = rawAvatar === undefined ? undefined : rawAvatar || null;
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) throw new BadRequestException('Avatar bağlantısı http veya https ile başlamalı.');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { displayName, statusText, avatarUrl, profileMode: dto.profileMode },
    });
    return this.safeUser(user);
  }

  async privacy(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { friendRequestPolicy: true, allowGroupDmInvites: true },
    });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    return {
      friendRequestPolicy: user.friendRequestPolicy ?? 'EVERYONE',
      allowGroupDmInvites: user.allowGroupDmInvites ?? true,
    };
  }

  async updatePrivacy(userId: string, dto: UpdatePrivacyDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        friendRequestPolicy: dto.friendRequestPolicy,
        allowGroupDmInvites: dto.allowGroupDmInvites,
      },
      select: { friendRequestPolicy: true, allowGroupDmInvites: true },
    });
    return {
      friendRequestPolicy: user.friendRequestPolicy ?? 'EVERYONE',
      allowGroupDmInvites: user.allowGroupDmInvites ?? true,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) throw new UnauthorizedException('Mevcut şifre yanlış.');
    if (await argon2.verify(user.passwordHash, dto.newPassword)) throw new BadRequestException('Yeni şifre mevcut şifreden farklı olmalı.');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword), authVersion: { increment: 1 } },
    });
    return { accessToken: this.token(updated), user: this.safeUser(updated) };
  }

  async rotateSessions(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { authVersion: { increment: 1 } },
    });
    return { accessToken: this.token(updated), user: this.safeUser(updated) };
  }
}
