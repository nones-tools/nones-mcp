import { inject, injectable } from 'inversify';
import type { KaitenApiPort, KaitenConfig } from '../kaiten';
import { TOKENS } from '../di/tokens';

/**
 * Config slice `AccessGuard` depends on. `allowedSpaceIds`/`allowedBoardIds`
 * stay required (original allowlist, always supplied). The 001-agent-guardrails
 * fields are `Partial` so existing hand-built test fixtures (that predate
 * this feature) keep compiling without supplying every new field - any real
 * `KaitenConfig` from `loadConfig()` always has all of them set (to `null`/
 * `false` when unconfigured), so production wiring is unaffected.
 */
export type AccessGuardConfig = Pick<KaitenConfig, 'allowedSpaceIds' | 'allowedBoardIds'> &
  Partial<
    Pick<
      KaitenConfig,
      'allowedColumnIds' | 'allowedLaneIds' | 'protectedColumnIds' | 'enforceScope' | 'defaultSpaceId' | 'defaultBoardId'
    >
  >;

/**
 * Enforces the scoping guardrails from specs/001-agent-guardrails: the
 * original space/board allowlists, column/lane allowlists, protected
 * (write-target-banned) columns, and `KAITEN_ENFORCE_SCOPE` hard boundaries.
 *
 * Composition is intersection - every configured check runs; the first
 * violation throws. Read filtering (silent narrowing) lives in the calling
 * services (e.g. `CardService.getCards`); this class only ever throws or
 * returns `true`, one `Error` per violation, each naming the responsible
 * env variable (FR-015).
 */
@injectable()
export class AccessGuard {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.Config) private readonly config: AccessGuardConfig
  ) {
    if (config.enforceScope && !config.defaultSpaceId && !config.defaultBoardId) {
      console.error(
        'KAITEN_ENFORCE_SCOPE=true has no effect: set KAITEN_DEFAULT_SPACE_ID and/or ' +
          'KAITEN_DEFAULT_BOARD_ID so there is a default scope to enforce.'
      );
    }
  }

  validateSpaceId(spaceId: number | null | undefined): true {
    if (
      this.config.enforceScope &&
      this.config.defaultSpaceId &&
      spaceId != null &&
      spaceId !== this.config.defaultSpaceId
    ) {
      throw new Error(
        `Space ID ${spaceId} is outside the enforced scope (KAITEN_ENFORCE_SCOPE, ` +
          `KAITEN_DEFAULT_SPACE_ID=${this.config.defaultSpaceId})`
      );
    }
    if (!this.config.allowedSpaceIds || !spaceId) return true;
    if (!this.config.allowedSpaceIds.includes(spaceId)) {
      throw new Error(`Space ID ${spaceId} is not in allowed list`);
    }
    return true;
  }

  validateBoardId(boardId: number | null | undefined): true {
    if (
      this.config.enforceScope &&
      this.config.defaultBoardId &&
      boardId != null &&
      boardId !== this.config.defaultBoardId
    ) {
      throw new Error(
        `Board ID ${boardId} is outside the enforced scope (KAITEN_ENFORCE_SCOPE, ` +
          `KAITEN_DEFAULT_BOARD_ID=${this.config.defaultBoardId})`
      );
    }
    if (!this.config.allowedBoardIds || !boardId) return true;
    if (!this.config.allowedBoardIds.includes(boardId)) {
      throw new Error(`Board ID ${boardId} is not in allowed list`);
    }
    return true;
  }

  /** Rejects a write target that is protected, or outside the column allowlist. Reads are unaffected (FR-005). */
  validateColumnTarget(columnId: number | null | undefined): true {
    if (!columnId) return true;
    if (this.config.protectedColumnIds?.includes(columnId)) {
      throw new Error(`Column ${columnId} is protected (KAITEN_PROTECTED_COLUMN_IDS) and cannot be a write target`);
    }
    if (this.config.allowedColumnIds && !this.config.allowedColumnIds.includes(columnId)) {
      throw new Error(`Column ${columnId} is not in allowed list (KAITEN_ALLOWED_COLUMN_IDS)`);
    }
    return true;
  }

  /** Rejects a write target outside the lane allowlist (no protection concept for lanes). */
  validateLaneTarget(laneId: number | null | undefined): true {
    if (!laneId) return true;
    if (this.config.allowedLaneIds && !this.config.allowedLaneIds.includes(laneId)) {
      throw new Error(`Lane ${laneId} is not in allowed list (KAITEN_ALLOWED_LANE_IDS)`);
    }
    return true;
  }

  /**
   * Swallows lookup errors (e.g. card not found) so validation never masks
   * an unrelated failure - only re-throws when the card is confirmed to
   * violate a configured guardrail (board allowlist, column/lane allowlist,
   * or enforce-scope board boundary). The lookup itself is the only thing
   * wrapped in try/catch below; every check that follows a successful lookup
   * throws unguarded, so no message-matching is needed to tell a real
   * violation apart from a swallowed lookup failure.
   */
  async validateCardId(cardId: number | null | undefined): Promise<true> {
    const needsLookup = Boolean(
      this.config.allowedBoardIds ||
        this.config.allowedColumnIds ||
        this.config.allowedLaneIds ||
        (this.config.enforceScope && this.config.defaultBoardId)
    );
    if (!needsLookup || !cardId) return true;

    let card: { board_id?: number | null; column_id?: number | null; lane_id?: number | null };
    try {
      card = await this.api.cards.getCard(cardId);
    } catch {
      return true;
    }

    if (card?.board_id != null) {
      if (this.config.allowedBoardIds && !this.config.allowedBoardIds.includes(card.board_id)) {
        throw new Error(`Card ${cardId} belongs to board ${card.board_id} which is not in allowed list`);
      }
      if (this.config.enforceScope && this.config.defaultBoardId && card.board_id !== this.config.defaultBoardId) {
        throw new Error(
          `Card ${cardId} belongs to board ${card.board_id} which is outside the enforced scope ` +
            `(KAITEN_ENFORCE_SCOPE, KAITEN_DEFAULT_BOARD_ID=${this.config.defaultBoardId})`
        );
      }
    }
    if (card?.column_id != null && this.config.allowedColumnIds && !this.config.allowedColumnIds.includes(card.column_id)) {
      throw new Error(`Card ${cardId} is in column ${card.column_id} which is not in allowed list (KAITEN_ALLOWED_COLUMN_IDS)`);
    }
    if (card?.lane_id != null && this.config.allowedLaneIds && !this.config.allowedLaneIds.includes(card.lane_id)) {
      throw new Error(`Card ${cardId} is in lane ${card.lane_id} which is not in allowed list (KAITEN_ALLOWED_LANE_IDS)`);
    }
    return true;
  }
}
