import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app';
import { Cache } from './redis';
import { DatabaseErrors } from './errors';
import { tokenActor } from './auth';
async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  if (
    process.env.NODE_ENV === 'production' &&
    (process.env.DEMO_SEED === 'true' ||
      process.env.JWT_SECRET.startsWith('replace-') ||
      !process.env.MANAGER_PIN ||
      process.env.MANAGER_PIN === '4729')
  )
    throw new Error('Configure production secrets and disable demo access.');
  const app = await NestFactory.create(AppModule, { bodyParser: true, rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DatabaseErrors());
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(cookieParser());
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');
  app.enableCors({ origin: origins, credentials: true });
  const cache = app.get(Cache);
  app.use(async (req: any, res: any, next: any) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    )
      return res.status(403).json({ message: 'Origin not allowed.' });
    try {
      const auth =
        req.method === 'POST' && ['/api/auth/login', '/api/auth/register'].includes(req.path);
      let identity = `ip:${req.socket.remoteAddress}`;
      if (!auth) {
        try {
          const token = req.cookies?.session || req.headers.authorization?.replace(/^Bearer /, '');
          const actor = tokenActor(token || '');
          if (typeof actor.sub === 'string') identity = `user:${actor.sub}`;
        } catch {
          /* Anonymous traffic retains its IP limit. */
        }
      }
      const key = `limit:v2:${auth ? 'auth' : 'api'}:${identity}`;
      const count = await cache.redis.incr(key);
      if (count === 1) await cache.redis.expire(key, 60);
      if (count > (auth ? 60 : 600))
        return res.status(429).json({ message: 'Too many requests. Try again shortly.' });
      next();
    } catch {
      res.status(503).json({ message: 'Service temporarily unavailable.' });
    }
  });
  await app.listen(Number(process.env.PORT || 4000), '0.0.0.0');
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
