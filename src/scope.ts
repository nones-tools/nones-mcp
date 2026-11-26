import { realpath } from "node:fs/promises";
import path from "node:path";
import type { HttpTransport } from "./http";
import type { Operation, Request } from "./types";
import { isUnsafePathSegment } from "./validation";

const unscopedLists = ["session.list", "project.list"];
const unscopedAny = [
  "session.list",
  "project.list",
  "session.create",
  "server.info",
];

export class WorkspaceScope {
  constructor(
    private transport: HttpTransport,
    private allowed: string[],
  ) {}

  get enabled(): boolean {
    return this.allowed.length > 0;
  }

  async assertRequest(
    op: Operation,
    input: Request,
    signal?: AbortSignal,
  ): Promise<void> {
    const sessionID = input.path?.sessionID;
    if (op.id === "session.create") {
      const body = input.body as
        { location?: { directory?: unknown }; parentID?: unknown } | undefined;
      if (!(await this.isAllowed(body?.location?.directory)))
        throw new Error(
          "Workspace scope cannot be verified for session creation",
        );
      if (body?.parentID != null) {
        if (typeof body.parentID !== "string")
          throw new Error("Invalid parent ID");
        await this.checkSession(body.parentID, signal);
      }
    }
    if (!sessionID && !unscopedAny.includes(op.id))
      throw new Error("Workspace scope cannot be verified for this operation");
    if (
      sessionID &&
      !op.id.startsWith("session.") &&
      !op.id.startsWith("experimental.session.")
    )
      throw new Error("Workspace scope cannot be verified for this operation");
    if (["session.move", "session.fork"].includes(op.id))
      throw new Error("Workspace scope cannot be verified for this operation");
    if (sessionID) await this.checkSession(sessionID, signal);
  }

  async filterResult(op: Operation, result: any): Promise<any> {
    if (!unscopedLists.includes(op.id)) return result;
    const items = Array.isArray(result) ? result : result?.data;
    if (!Array.isArray(items))
      throw new Error("Workspace scope cannot be verified");
    const filtered = [];
    for (const item of items) {
      const directory =
        op.id === "session.list" ? item?.location?.directory : item?.canonical;
      if (await this.isAllowed(directory)) filtered.push(item);
    }
    return Array.isArray(result) ? filtered : { ...result, data: filtered };
  }

  async checkSession(id: string, signal?: AbortSignal): Promise<void> {
    if (isUnsafePathSegment(id)) throw new Error("Invalid session ID");
    const session = await this.transport.read(
      await this.transport.fetch(
        `/api/session/${encodeURIComponent(id)}`,
        {},
        signal,
      ),
    );
    const directory =
      session?.data?.location?.directory ?? session?.location?.directory;
    if (typeof directory !== "string")
      throw new Error("Workspace scope cannot be verified");
    if (!(await this.isAllowed(directory)))
      throw new Error("Session is outside allowed workspace scope");
  }

  private async isAllowed(directory: unknown): Promise<boolean> {
    if (typeof directory !== "string") return false;
    try {
      const resolved = await realpath(directory);
      return this.allowed.some(
        (root) => resolved === root || resolved.startsWith(root + path.sep),
      );
    } catch {
      return false;
    }
  }
}
