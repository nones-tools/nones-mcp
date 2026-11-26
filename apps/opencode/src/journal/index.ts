/**
 * OpenCode keeps its historical journal imports and the public `./journal`
 * subpath, but all contracts, policy, CLI registration and lifecycle now come
 * from `@nones/mcp-core`. The SQLite implementation is the default plugin from
 * `@nones/journal/sqlite`.
 */
export * from "@nones/mcp-core/journal";
export { openSqliteJournal } from "@nones/journal/sqlite";
