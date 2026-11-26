# SDK

The package root exports a typed SDK for Node/Bun (>= 18):

```ts
import { createSDK } from '@nones/kaiten-mcp';

const sdk = createSDK();                 // config from env/files (see configuration.md)
// or with explicit overrides:
const sdk2 = createSDK({ apiUrl: '...', apiToken: '...' });

// Defaults (4.1.0): condition 1 (on-board cards), orderBy 'updated', orderDirection 'desc',
// limit 100. A limit above 100 (up to 1000) is fetched in sequential pages automatically.
const cards = await sdk.getCards(spaceId, boardId, /* minimal */ true);
const archived = await sdk.getCards(spaceId, boardId, false, { condition: 2, limit: 300 });
const card  = await sdk.getCard(cardId);
await sdk.createCard({ title: 'Task', boardId, columnId /* optional if KAITEN_DEFAULT_COLUMN_ID is set */, laneId });
await sdk.moveToColumn(cardId, columnId, laneId);
await sdk.assignTo(cardId, userId);
await sdk.addComment(cardId, 'Done!');
await sdk.addTag(cardId, 'release');
const kids = await sdk.getAllSubtasks(cardId, /* minimal */ true);
```

## Surface

- **Cards**: `getCards`, `getCard`, `createCard`, `updateCard`, `deleteCard`,
  `moveToColumn`, `assignTo`, `unassignFrom`, `archive`, `unarchive`
- **Tags**: `addTag`, `removeTag`, `setTags`, `hasTag`, `getTags`, `getCardsWithTag`,
  `getCardsWithoutTag`
- **Hierarchy**: `createSubtask`, `getSubtasks`, `getAllSubtasks`, `getParent`,
  `attachToParent`, `detachFromParent`, `createTaskFlow`
- **Comments**: `addComment`, `getComments`, `updateComment`, `deleteComment`
- **Checklists**: `getChecklists`, `createChecklist`, `updateChecklist`,
  `deleteChecklist`, `addChecklistItem`, `toggleChecklistItem`, `deleteChecklistItem`
- **Files**: `getCardFiles`, `downloadFile`, `downloadFileToDisk`,
  `downloadAllCardFiles`, `cleanTempDir`
- **Navigation/users**: `getSpaces`, `getSpaceId`, `getBoards`, `getBoardId`,
  `getColumns`, `getColumnId`, `getUsers`, `findUser`, `getCurrentUser`
- **Git**: `createGitBranch`, `checkoutGitBranch`, `commitGit`, `getGitStatus`,
  `gitPush`, `getCurrentBranch`

`CreateCardInput.columnId` is optional (3.4.0, specs/001-agent-guardrails): omitting it falls
back to `KAITEN_DEFAULT_COLUMN_ID`; an error naming both remedies is thrown if neither is
available. `CreateCardInput.laneId` falls back to `KAITEN_DEFAULT_LANE_ID` the same way.

Errors from the Kaiten API throw `KaitenApiError` with `status` and parsed `body`.

DELETE-backed methods (`deleteCard`, `deleteChecklist`, `deleteChecklistItem`, `deleteComment`,
`removeTag`, `detachFromParent`) throw `KaitenDeleteDisabledError` unless `KAITEN_API_DELETE_ALLOW=true`
is set — see [Destructive operations](../README.md#destructive-operations).

Every write method throws `KaitenReadOnlyError` when `KAITEN_READ_ONLY=true` (checked at the
HTTP client, before any request — overrides `KAITEN_API_DELETE_ALLOW`), and `KaitenTimeoutError`
when a request exceeds `KAITEN_HTTP_TIMEOUT_MS`. Both errors are self-describing: relay them to
the user verbatim rather than working around them — see
[Guardrails](configuration.md#guardrails).

## Lower level

For direct endpoint access without SDK conveniences (allowlists, projections):

```ts
import { KaitenClient, KaitenApi, loadConfig } from '@nones/kaiten-mcp';

const config = loadConfig();
const client = new KaitenClient({
  apiUrl: config.apiUrl,
  apiToken: config.apiToken,
  allowDelete: config.deleteAllow,
  readOnly: config.readOnly,
  timeoutMs: config.httpTimeoutMs,
  retries: config.httpRetries,
});
const api = new KaitenApi(client);
const spaces = await api.boards.getSpaces();
```

`KaitenClient` accepts an injectable `fetchImpl` — that is how the test suite runs
without a network. All Kaiten entity types (`Card`, `Board`, `Column`, `User`,
`Checklist`, …) are exported from the package root.

`KaitenClientOptions` also accepts `readOnly` (blocks all writes with `KaitenReadOnlyError`,
mirrors `allowDelete`'s enforcement point and wins over it), `timeoutMs` (aborts a request
after N ms with `KaitenTimeoutError`), and `retries` (extra attempts for GET requests only,
on network errors or HTTP ≥ 500 — writes are never retried). All three are optional and
default to today's behavior (no read-only, no timeout, no retries) when omitted.

`loadConfigLenient()` is the same merge/parse as `loadConfig()`, but never throws when
`KAITEN_API_URL`/`KAITEN_API_TOKEN` are missing — for callers that need config fields (e.g.
`disabledTools`) before credentials can be validated, like the MCP server at startup.

## Dependency injection container

`createSDK()`/`new KaitenSDK()` already build a DI container internally - most callers
never need to touch it directly. For advanced cases (resolving a single service, or
wiring the same container into other code), the composition root is also exported:

```ts
import { buildContainer, TOKENS } from '@nones/kaiten-mcp';

const container = buildContainer({ apiUrl: '...', apiToken: '...' });
const sdk = container.get(TOKENS.KaitenSDK);       // same object every call (singleton)
const cardService = container.get(TOKENS.CardService); // resolve one service directly

// Tests: inject a fake transport, same override shape as KaitenSDKOptions.
const testContainer = buildContainer({ apiUrl: 'https://api.example.com', apiToken: 'token', client: fakeClient });
```

`TOKENS` also exposes `TOKENS.KaitenApi`, typed as `KaitenApiPort` (see
`KaitenApiPort`/`CardsApiPort`/etc. exported from the package root) - the interface
`src/services/*` depend on instead of the concrete `KaitenApi` class.
