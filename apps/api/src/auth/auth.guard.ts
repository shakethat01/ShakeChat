import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const payload = this.jwt.verify(header.slice(7));
      if (typeof payload?.sub !== 'string') throw new Error();
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { authVersion: true } });
      if (!user || Number(payload.v ?? 0) !== Number(user.authVersion ?? 0)) throw new Error();
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Oturum geçersiz. Yeniden giriş yap.');
    }
  }
}
