import { Container } from 'inversify';
import type { HttpTransport, KaitenConfig } from '../kaiten';
import { KaitenApi, KaitenClient, loadConfig } from '../kaiten';
import {
  AccessGuard, BlockerService, BoardService, CardService, ChecklistService, CommentService,
  DictionaryService, FileService, GitService, HierarchyService, LinkService, TagService,
  TimeLogService, UserService,
} from '../services';
// Runtime import of `KaitenSDK` for the factory binding below - safe despite
// forming a cycle with sdk.ts (which imports `buildContainer`/`TOKENS` from
// this directory) because both sides only reference the other's export
// inside a closure/function body, never at module top-level. ES module live
// bindings resolve correctly once the whole graph finishes loading, and
// nothing here calls `new KaitenSDK()` until `buildContainer()` runs.
import { KaitenSDK, type KaitenSDKOptions } from '../sdk';
import { TOKENS } from './tokens';

export interface ContainerOverrides extends Partial<KaitenConfig> {
  client?: HttpTransport;
}

/**
 * Composition root (NestJS/Angular-style). Kaiten Core classes
 * (`KaitenClient`, `KaitenApi`) are bound via factory bindings
 * (`toDynamicValue`) - the core stays undecorated and framework-free, never
 * importing `inversify`. App-layer services (`src/services/*`) are bound
 * `.to(Class)`, resolved through their own `@injectable`/`@inject`
 * metadata. Everything is singleton-scoped *within this container instance*
 * - `buildContainer` itself is called once per `KaitenSDK`/`createSDK()`
 * call, matching the pre-DI behavior where every SDK instance built its own
 * independent client/api/service graph.
 *
 * `overrides` mirrors the existing `KaitenSDKOptions` shape: `Partial<KaitenConfig>`
 * merged into `loadConfig()`, plus an optional pre-built `client` (how tests
 * inject a fake transport without touching the network).
 */
export function buildContainer(overrides: ContainerOverrides = {}): Container {
  const container = new Container();
  const { client, ...configOverrides } = overrides;

  container
    .bind(TOKENS.Config)
    .toDynamicValue(() => loadConfig(configOverrides))
    .inSingletonScope();

  container
    .bind(TOKENS.HttpTransport)
    .toDynamicValue((ctx) => {
      if (client) return client;
      const config = ctx.get(TOKENS.Config);
      return new KaitenClient({
        apiUrl: config.apiUrl,
        apiToken: config.apiToken,
        allowDelete: config.deleteAllow,
        readOnly: config.readOnly,
        timeoutMs: config.httpTimeoutMs,
        retries: config.httpRetries,
      });
    })
    .inSingletonScope();

  container
    .bind(TOKENS.KaitenApi)
    .toDynamicValue((ctx) => new KaitenApi(ctx.get(TOKENS.HttpTransport)))
    .inSingletonScope();

  container.bind(TOKENS.AccessGuard).to(AccessGuard).inSingletonScope();
  container.bind(TOKENS.CardService).to(CardService).inSingletonScope();
  container.bind(TOKENS.TagService).to(TagService).inSingletonScope();
  container.bind(TOKENS.HierarchyService).to(HierarchyService).inSingletonScope();
  container.bind(TOKENS.CommentService).to(CommentService).inSingletonScope();
  container.bind(TOKENS.BoardService).to(BoardService).inSingletonScope();
  container.bind(TOKENS.UserService).to(UserService).inSingletonScope();
  container.bind(TOKENS.GitService).to(GitService).inSingletonScope();
  container.bind(TOKENS.FileService).to(FileService).inSingletonScope();
  container.bind(TOKENS.ChecklistService).to(ChecklistService).inSingletonScope();
  container.bind(TOKENS.TimeLogService).to(TimeLogService).inSingletonScope();
  container.bind(TOKENS.BlockerService).to(BlockerService).inSingletonScope();
  container.bind(TOKENS.LinkService).to(LinkService).inSingletonScope();
  container.bind(TOKENS.DictionaryService).to(DictionaryService).inSingletonScope();

  // `KaitenSDK`'s own constructor builds (or accepts) a container and pulls
  // these same tokens from it - see src/sdk.ts. Binding it here just wires a
  // `KaitenSDK` instance constructed with the same overrides into this
  // container's graph, so `container.get(TOKENS.KaitenSDK)` works standalone.
  container
    .bind(TOKENS.KaitenSDK)
    // `ContainerOverrides.client` is the wider `HttpTransport` port;
    // `KaitenSDKOptions.client` is the concrete `KaitenClient` for public
    // API back-compat. Safe to widen back here - `KaitenSDK` only ever
    // forwards `client` into its own `buildContainer()` call, which accepts
    // `HttpTransport` too.
    .toDynamicValue(() => new KaitenSDK(overrides as KaitenSDKOptions))
    .inSingletonScope();

  return container;
}
