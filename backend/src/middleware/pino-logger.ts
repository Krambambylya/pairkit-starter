import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import pino, { Logger } from 'pino';
import pinoHttp from 'pino-http';
import { fileURLToPath } from 'url';

import { env } from '../config/env-config';

declare global {
  namespace Express {
    interface Request {
      log: Logger;
    }
  }
}

const logDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs');
const logFile = join(logDir, 'app.log');

void mkdir(logDir, { recursive: true }).catch(err => {
  console.error('Failed to create log directory:', err);
});

const isDevelopment = env.NODE_ENV === 'development';

const transport = isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:mm:ss',
        ignore: 'pid,hostname',
      },
    }
  : {
      target: 'pino/file',
      options: { destination: logFile },
    };

export const logger = pino({
  level: env.LOG_LEVEL,
  transport,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.refreshToken',
      'req.body.recoveryKey',
      'req.body.pairingCode',
      '*.token',
      '*.refreshToken',
      '*.recoveryKey',
      '*.pairingCode',
    ],
    censor: '[REDACTED]',
  },
});

export const pinoLogger = pinoHttp({
  logger,
  genReqId: (req: Request) => {
    const incoming = req.headers['x-request-id'];
    if (typeof incoming === 'string' && incoming.length > 0) {
      return incoming;
    }
    return randomUUID();
  },
  customSuccessMessage: (req: Request) => {
    return `${req.method} ${req.url} [reqId: ${req.id}] completed`;
  },
  customErrorMessage: (req: Request, _res: Response, err: Error) => {
    return `${req.method} ${req.url} [reqId: ${req.id}] failed with ${err.message}`;
  },
});
