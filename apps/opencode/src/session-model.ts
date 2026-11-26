import type { OpenCodeClient } from "./client";

export interface ModelRef {
  providerID: string;
  id: string;
  variant?: string;
}

export interface ResolvedModel {
  model: ModelRef;
  label: string;
  source: string;
}

export const DEFAULT_MODEL = "opencode-go/deepseek-v4.1-flash";

/** Parse `provider/id[#variant]`; model IDs may contain further slashes. */
export function parseModelRef(input: string): ModelRef {
  const value = input.trim();
  if (!value) throw new Error("Model must not be empty");
  const at = value.indexOf("#");
  if (at !== -1 && value.indexOf("#", at + 1) !== -1)
    throw new Error(`Invalid model "${input}"; expected provider/id[#variant]`);
  const base = at === -1 ? value : value.slice(0, at);
  const variant = at === -1 ? undefined : value.slice(at + 1);
  if (variant !== undefined && (!variant || /\s/.test(variant)))
    throw new Error(`Invalid model variant in "${input}"`);
  const slash = base.indexOf("/");
  if (slash <= 0 || slash === base.length - 1)
    throw new Error(`Invalid model "${input}"; expected provider/id[#variant]`);
  const providerID = base.slice(0, slash);
  const id = base.slice(slash + 1);
  if (/\s/.test(providerID) || /\s/.test(id) || !id)
    throw new Error(`Invalid model "${input}"; expected provider/id[#variant]`);
  return { providerID, id, ...(variant ? { variant } : {}) };
}

export function modelLabel(model: ModelRef): string {
  return `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ""}`;
}

function requested(
  env: { [name: string]: string | undefined },
  explicit?: string,
): { value: string; source: string } {
  if (explicit !== undefined) {
    if (!explicit.trim())
      throw new Error("Model must not be empty when --model is provided");
    return { value: explicit.trim(), source: "--model" };
  }
  for (const name of ["OPENCODE_MCP_MODEL", "OC2_MODEL"])
    if (env[name]?.trim()) return { value: env[name]!.trim(), source: name };
  return { value: DEFAULT_MODEL, source: "default" };
}

/**
 * Resolve the model in documented order and verify it against the native
 * catalog for this directory. Unknown models and unsupported variants fail
 * without falling back to another model.
 */
export async function resolveModel(
  client: OpenCodeClient,
  directory: string,
  env: { [name: string]: string | undefined },
  explicit?: string,
): Promise<ResolvedModel> {
  const choice = requested(env, explicit);
  const ref = parseModelRef(choice.value);
  const label = modelLabel(ref);
  const result = await client.request({
    operation: "model.list",
    query: { location: { directory } },
  });
  let models: any[] = Array.isArray(result?.data)
    ? result.data
    : Array.isArray(result)
      ? result
      : [];
  // Fresh directories can have no project-scoped catalogue yet. Outside
  // scoped mode, fall back to the global native catalogue for validation.
  if (!models.length && !env.OPENCODE_MCP_ALLOWED_DIRS) {
    const global = await client.request({ operation: "model.list" });
    models = Array.isArray(global?.data)
      ? global.data
      : Array.isArray(global)
        ? global
        : [];
  }
  const match = models.find(
    (model) =>
      model?.providerID === ref.providerID &&
      (model?.id === ref.id || model?.modelID === ref.id),
  );
  if (!match)
    throw new Error(
      `Unknown model ${label} (from ${choice.source}); inspect the native model list`,
    );
  if (match.enabled === false)
    throw new Error(`Model ${label} is disabled on this service`);
  const model: ModelRef = {
    ...ref,
    id: typeof match.id === "string" ? match.id : ref.id,
  };
  if (ref.variant) {
    const variants: string[] = (
      Array.isArray(match.variants) ? match.variants : []
    )
      .map((variant: any) => variant?.id)
      .filter((id: unknown): id is string => typeof id === "string");
    if (!variants.includes(ref.variant))
      throw new Error(
        `Unsupported variant "${ref.variant}" for ${label}${
          variants.length
            ? `; available: ${variants.join(", ")}`
            : "; this model has no variants"
        }`,
      );
  }
  return { model, label, source: choice.source };
}
