import { COMMON_ERROR_STATUS_MAP } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import { RequestHeadersHandlerPlugin, RequestLimitHandlerPlugin } from '@orpc/server/plugins';
import { contractErrorStatus } from '@pairkit/core/api';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { PrismaService } from '@/config/prisma.config';
import { createAppRouter } from '@/create-router';
import { sanitizeClientError } from '@/rpc-error';

import { env } from './config/env-config';
import { ITEMS_JSON_BODY_LIMIT_BYTES } from './constants/config.constants';
import { apiErrorHandler, unmatchedRoutes } from './middleware/api-error.middleware';
import { pinoLogger } from './middleware/pino-logger';

const app: Application = express();
const router = createAppRouter();

const handler = new RPCHandler(router, {
  plugins: [
    new RequestHeadersHandlerPlugin(),
    new RequestLimitHandlerPlugin({ maxBodySize: ITEMS_JSON_BODY_LIMIT_BYTES }),
  ],
  errorStatusMap: {
    ...COMMON_ERROR_STATUS_MAP,
    ...contractErrorStatus,
  },
  interceptors: [
    async ({ context, next }) => {
      try {
        return await next();
      } catch (error) {
        throw sanitizeClientError(error, context.log, context.requestId);
      }
    },
  ],
});

const allowedURLs = env.WHITE_LIST_URLS || [];

if (env.TRUST_PROXY != null) {
  app.set('trust proxy', env.TRUST_PROXY);
}

app.use(pinoLogger);
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!res.headersSent) {
    res.setHeader('X-Request-Id', String(req.id));
  }
  next();
});
app.use(helmet());
app.use(
  cors({
    origin: allowedURLs,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  }),
);

const pingDatabase = async (): Promise<boolean> => {
  try {
    await PrismaService.getInstance().client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};

app.get('/', (_req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

app.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok' });
});

const readyHandler = async (req: Request, res: Response): Promise<void> => {
  const dbOk = await pingDatabase();
  if (dbOk) {
    req.log.info('Health ok');
    res.status(200).json({ status: 'ok', db: 'ok' });
    return;
  }
  req.log.error('Health database ping failed');
  res.status(503).json({ status: 'degraded', db: 'error' });
};

app.get('/ready', readyHandler);
app.get('/health', readyHandler);

app.use('/rpc{/*path}', async (req: Request, res: Response, next: NextFunction) => {
  const { matched } = await handler.handle(req, res, {
    prefix: '/rpc',
    context: {
      requestId: String(req.id),
      clientIp: req.ip ?? 'unknown',
      log: req.log,
    },
  });

  if (matched) {
    return;
  }

  next();
});

app.use(apiErrorHandler);
app.use(unmatchedRoutes);

export { app };
