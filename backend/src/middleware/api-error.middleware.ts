import { NextFunction, Request, Response } from 'express';

import { Prisma } from '@/generated/prisma/client';

import { ERROR } from '../constants/messages';

const apiErrorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  req.log?.error({ err }, 'Unhandled request error');

  if (
    err instanceof SyntaxError &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).status === 400 &&
    'body' in err
  ) {
    res.status(400).json({ message: 'Invalid JSON' });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    res.status(400).json({ message: ERROR.BAD_REQUEST });
    return;
  }
  if (
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientRustPanicError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientValidationError
  ) {
    res.status(400).json({ message: ERROR.BAD_REQUEST });
    return;
  }
  res.status(500).json({ message: ERROR.INTERNAL_SERVER_ERROR });
};

const unmatchedRoutes = (req: Request, res: Response): void => {
  req.log?.info({ method: req.method, url: req.originalUrl }, 'Unmatched route');
  res.status(404).json({ message: ERROR.ROUTE_NOT_FOUND });
};

export { apiErrorHandler, unmatchedRoutes };
