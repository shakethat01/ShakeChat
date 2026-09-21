import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class FriendRateLimitService {
  private readonly buckets = new Map<string, number[]>();

  assert(userId: string, limit = 12, windowMs = 60_000) {
    const now = Date.now();
    const recent = (this.buckets.get(userId) ?? []).filter(timestamp => now - timestamp < windowMs);
    if (recent.length >= limit) throw new HttpException('Çok fazla arkadaşlık isteği. Biraz sonra tekrar dene.', HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.buckets.set(userId, recent);
  }
}
