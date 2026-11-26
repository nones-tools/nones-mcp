/**
 * One lazy dynamic driver for Node 22.14+ and Bun 1.4.5. The import stays
 * dynamic so CLI help/MCP paths never touch node:sqlite. Node 22 may print its
 * built-in experimental warning; we intentionally do not suppress warnings.
 */
type NodeSqlite = typeof import("node:sqlite");

let pending: Promise<NodeSqlite> | undefined;

export function loadNodeSqlite(): Promise<NodeSqlite> {
  pending ??= import("node:sqlite");
  return pending;
}
