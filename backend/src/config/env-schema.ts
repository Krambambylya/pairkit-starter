import { z } from 'zod';

import {
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
} from '../constants/config.constants';
import {
  jwtSecretHasEnoughVariety,
  MIN_JWT_SECRET_LENGTH,
  PUBLIC_JWT_SECRETS,
} from './public-jwt-secrets';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(),
    SHADOW_DATABASE_URL: z.string().url().optional(),
    JWT_SECRET: z
      .string()
      .min(MIN_JWT_SECRET_LENGTH, 'JWT_SECRET must be at least 32 characters')
      .refine(jwtSecretHasEnoughVariety, {
        message: 'JWT_SECRET must use at least 10 different characters',
      }),
    JWT_EXPIRES_IN: z.string().default(DEFAULT_ACCESS_TOKEN_EXPIRES_IN),
    JWT_REFRESH_EXPIRES_IN: z.string().default(DEFAULT_REFRESH_TOKEN_EXPIRES_IN),
    WHITE_LIST_URLS: z
      .string()
      .transform(value => value.split(',').map(url => url.trim()))
      .refine(urls => urls.every(url => z.string().url().safeParse(url).success), {
        message: 'Each value in WHITE_LIST_URLS must be a valid URL',
      }),
    TRUST_PROXY: z.coerce.number().int().min(0).optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'test') return;
    if (!(PUBLIC_JWT_SECRETS as readonly string[]).includes(value.JWT_SECRET)) return;

    ctx.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET is published in the repository. Set a secret that is not committed.',
    });
  });

export type EnvVars = z.infer<typeof envSchema>;
