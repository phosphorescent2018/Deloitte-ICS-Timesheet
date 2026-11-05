import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Axhub Make 客户端启动时会等待项目写入 `.axhub/make/.dev-server-info.json`
 * （pid / port / origin / projectRoot / startedAt 等），并通过 /api/health 复核服务是否属于本项目。
 * 这个插件在 Vite dev server 启动后写文件，并每 5 秒刷新 timestamp（Axhub 只认 15 秒内的心跳）。
 */

const STATE_DIR = path.join('.axhub', 'make');
const INFO_FILE = path.join(STATE_DIR, '.dev-server-info.json');
const HEARTBEAT_MS = 5000;

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return '127.0.0.1';
}

function resolvePort(server: any): number {
  const address = server.httpServer?.address?.();
  if (address && typeof address === 'object' && typeof address.port === 'number') {
    return address.port;
  }
  return Number(server.config?.server?.port) || 5178;
}

function buildInfo(projectRoot: string, server: any, startedAt: string) {
  const port = resolvePort(server);
  return {
    pid: process.pid,
    port,
    host: 'localhost',
    origin: `http://localhost:${port}`,
    projectRoot,
    startedAt,
    localIP: getLocalIP(),
    timestamp: new Date().toISOString(),
  };
}

function writeInfo(projectRoot: string, server: any, startedAt: string) {
  const info = buildInfo(projectRoot, server, startedAt);
  const file = path.join(projectRoot, INFO_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`, 'utf8');
  return info;
}

export function axhubDevServerInfo(): Plugin {
  return {
    name: 'axhub-dev-server-info',
    apply: 'serve',
    configureServer(server: any) {
      const projectRoot = process.cwd();
      const startedAt = new Date().toISOString();

      server.middlewares.use('/api/health', (req: any, res: any, next: () => void) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        const info = buildInfo(projectRoot, server, startedAt);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(
          JSON.stringify({
            ok: true,
            role: 'runtime',
            projectRoot,
            server: info,
          }),
        );
      });

      server.httpServer?.once('listening', () => {
        try {
          const info = writeInfo(projectRoot, server, startedAt);
          const heartbeat = setInterval(() => {
            try {
              writeInfo(projectRoot, server, startedAt);
            } catch (error) {
              console.error('[axhub] failed to refresh dev-server-info:', error);
            }
          }, HEARTBEAT_MS);
          heartbeat.unref?.();
          server.httpServer?.once('close', () => clearInterval(heartbeat));
          console.log(`[axhub] dev-server-info → ${info.origin} (${info.projectRoot})`);
        } catch (error) {
          console.error('[axhub] failed to write dev-server-info:', error);
        }
      });
    },
  };
}
