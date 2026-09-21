import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class InviteRateLimitService {
  private readonly buckets = new Map<string, number[]>();

  assert(key: string, limit: number, windowMs = 60_000) {
    const now = Date.now();
    const recent = (this.buckets.get(key) ?? []).filter(timestamp => now - timestamp < windowMs);
    if (recent.length >= limit) {
      throw new HttpException('Çok fazla davet isteği. Biraz sonra tekrar dene.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.buckets.set(key, recent);
  }
}
