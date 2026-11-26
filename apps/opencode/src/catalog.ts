import type { HttpTransport } from "./http";
import { isBannedOperation } from "./security";
import type { Operation } from "./types";

interface Catalog {
  paths: Record<string, Record<string, any>>;
}

const methods = ["get", "post", "patch", "put", "delete"];

export class OperationCatalog {
  private cached?: Operation[];

  constructor(private transport: HttpTransport) {}

  async list(signal?: AbortSignal): Promise<Operation[]> {
    if (this.cached) return this.cached;
    const data = (await this.transport.read(
      await this.transport.fetch("/openapi.json", {}, signal),
    )) as Catalog;
    this.cached = Object.entries(data.paths).flatMap(([path, entries]) => {
      // Skip malformed or traversal-shaped routes before exposing native IDs.
      if (
        !/^\/(?!\/)[A-Za-z0-9_{}\-/]+$/.test(path) ||
        path.split("/").some((part) => part === "." || part === "..")
      )
        return [];
      return Object.entries(entries)
        .filter(
          ([method, value]) =>
            methods.includes(method) &&
            value.operationId &&
            !isBannedOperation(value.operationId, path),
        )
        .map(([method, value]) => ({
          id: value.operationId,
          method: method.toUpperCase(),
          path,
          parameters: value.parameters || [],
          description: value.summary,
        }));
    });
    return this.cached;
  }
}
