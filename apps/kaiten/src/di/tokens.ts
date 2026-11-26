/**
 * Typed DI tokens (NestJS/Angular-style injection tokens). Every value is a
 * unique `Symbol`, typed via `ServiceIdentifier<T>` so `container.get(TOKENS.X)`
 * and `@inject(TOKENS.X)` resolve to the right type without a cast.
 *
 * Deliberately imports only *types* from `../services` and `../sdk` (erased
 * at compile time) - this file has zero runtime dependencies outside
 * `inversify` and `../kaiten` types. `src/services/*` import `TOKENS` from
 * this module directly (`../di/tokens`), not the `../di` barrel: the barrel
 * also re-exports `container.ts`, which runtime-imports every service class
 * to bind it - going through the barrel from a service file would form a
 * runtime import cycle right at `@inject()` decorator time (module
 * evaluation), before the cycle's other half has finished loading. Importing
 * this leaf module directly avoids that entirely.
 */
import type { ServiceIdentifier } from 'inversify';
import type { HttpTransport, KaitenApiPort, KaitenConfig } from '../kaiten';
import type {
  AccessGuard, BlockerService, BoardService, CardService, ChecklistService, CommentService,
  DictionaryService, FileService, GitService, HierarchyService, LinkService, TagService,
  TimeLogService, UserService,
} from '../services';
import type { KaitenSDK } from '../sdk';

function token<T>(name: string): ServiceIdentifier<T> {
  return Symbol.for(`kaiten-mcp:${name}`) as ServiceIdentifier<T>;
}

export const TOKENS = {
  Config: token<KaitenConfig>('Config'),
  HttpTransport: token<HttpTransport>('HttpTransport'),
  KaitenApi: token<KaitenApiPort>('KaitenApi'),
  AccessGuard: token<AccessGuard>('AccessGuard'),
  CardService: token<CardService>('CardService'),
  TagService: token<TagService>('TagService'),
  HierarchyService: token<HierarchyService>('HierarchyService'),
  CommentService: token<CommentService>('CommentService'),
  BoardService: token<BoardService>('BoardService'),
  UserService: token<UserService>('UserService'),
  GitService: token<GitService>('GitService'),
  FileService: token<FileService>('FileService'),
  ChecklistService: token<ChecklistService>('ChecklistService'),
  TimeLogService: token<TimeLogService>('TimeLogService'),
  BlockerService: token<BlockerService>('BlockerService'),
  LinkService: token<LinkService>('LinkService'),
  DictionaryService: token<DictionaryService>('DictionaryService'),
  KaitenSDK: token<KaitenSDK>('KaitenSDK'),
} as const;
