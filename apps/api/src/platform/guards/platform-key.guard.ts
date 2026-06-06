import { timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PlatformKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const supplied = request.headers['x-platform-key'];
    const value = Array.isArray(supplied) ? supplied[0] : supplied;
    const expected = this.config.getOrThrow<string>('PLATFORM_ADMIN_API_KEY');

    if (!value) {
      throw new UnauthorizedException('Platform administration key required.');
    }

    const suppliedBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid platform administration key.');
    }

    return true;
  }
}
