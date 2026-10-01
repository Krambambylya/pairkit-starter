import type { InferClientErrors } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import { expectTypeOf, test } from 'vitest';

import type {
  BootstrapItemsPayload,
  ContractErrorCode,
  CreateWorkspaceResult,
  ListItemsPayload,
  ManifestDiff,
  PairingCodePayload,
  PullItemsPayload,
  PushItemsPayload,
  RateLimitErrorData,
  TokenPair,
  UpsertItemPayload,
} from '../index';
import { contract } from '../index';

type Client = RouterContractClient<typeof contract>;

test('each procedure output matches the exported schema', () => {
  expectTypeOf<
    Awaited<ReturnType<Client['workspace']['create']>>
  >().toEqualTypeOf<CreateWorkspaceResult>();
  expectTypeOf<Awaited<ReturnType<Client['workspace']['join']>>>().toEqualTypeOf<TokenPair>();
  expectTypeOf<Awaited<ReturnType<Client['workspace']['recover']>>>().toEqualTypeOf<TokenPair>();
  expectTypeOf<Awaited<ReturnType<Client['workspace']['refresh']>>>().toEqualTypeOf<TokenPair>();
  expectTypeOf<
    Awaited<ReturnType<Client['workspace']['issuePairingCode']>>
  >().toEqualTypeOf<PairingCodePayload>();
  expectTypeOf<Awaited<ReturnType<Client['items']['list']>>>().toEqualTypeOf<ListItemsPayload>();
  expectTypeOf<Awaited<ReturnType<Client['items']['upsert']>>>().toEqualTypeOf<UpsertItemPayload>();
  expectTypeOf<
    Awaited<ReturnType<Client['items']['bootstrap']>>
  >().toEqualTypeOf<BootstrapItemsPayload>();
  expectTypeOf<Awaited<ReturnType<Client['items']['manifest']>>>().toEqualTypeOf<ManifestDiff>();
  expectTypeOf<Awaited<ReturnType<Client['items']['pull']>>>().toEqualTypeOf<PullItemsPayload>();
  expectTypeOf<Awaited<ReturnType<Client['items']['push']>>>().toEqualTypeOf<PushItemsPayload>();

  type JoinErrors = InferClientErrors<Client>['workspace']['join'];
  type HasPairingCode =
    Extract<JoinErrors, { code: 'INVALID_PAIRING_CODE' }> extends never ? false : true;
  expectTypeOf<HasPairingCode>().toEqualTypeOf<true>();

  type CodesOf<T> = Extract<T, { code: string }>['code'];
  type ClientErrors = InferClientErrors<Client>;
  type DeclaredCodes =
    | CodesOf<ClientErrors['workspace']['create']>
    | CodesOf<ClientErrors['workspace']['join']>
    | CodesOf<ClientErrors['workspace']['recover']>
    | CodesOf<ClientErrors['workspace']['refresh']>
    | CodesOf<ClientErrors['workspace']['issuePairingCode']>
    | CodesOf<ClientErrors['items']['list']>
    | CodesOf<ClientErrors['items']['upsert']>
    | CodesOf<ClientErrors['items']['bootstrap']>
    | CodesOf<ClientErrors['items']['manifest']>
    | CodesOf<ClientErrors['items']['pull']>
    | CodesOf<ClientErrors['items']['push']>;
  expectTypeOf<DeclaredCodes>().toEqualTypeOf<ContractErrorCode | 'TOO_MANY_REQUESTS'>();

  type ListedRateLimit = Extract<
    InferClientErrors<Client>['items']['list'],
    { code: 'TOO_MANY_REQUESTS' }
  >;
  expectTypeOf<ListedRateLimit['data']>().toEqualTypeOf<RateLimitErrorData>();
});
