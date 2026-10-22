import type { ConnectionOptions } from 'bullmq';

/** Convertit REDIS_URL (redis://[:motdepasse@]hôte:port[/base]) en options de connexion explicites. */
export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  const db = u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    db: Number.isInteger(db) ? db : 0,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
