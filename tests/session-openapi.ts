const path = (operationId: string, ...names: string[]) => ({
  operationId,
  parameters: names.map((name) => ({
    name,
    in: name === "sessionID" ? "path" : "query",
    ...(name === "sessionID" ? { required: true } : {}),
  })),
});

export const sessionOpenApi = {
  paths: {
    "/api/session": {
      get: path("session.list", "limit", "order", "cursor"),
      post: { operationId: "session.create" },
    },
    "/api/session/{sessionID}": {
      get: path("session.get", "sessionID"),
      delete: path("session.remove", "sessionID"),
    },
    "/api/session/{sessionID}/prompt": {
      post: path("session.prompt", "sessionID"),
    },
    "/api/session/{sessionID}/interrupt": {
      post: path("session.interrupt", "sessionID"),
    },
    "/api/session/{sessionID}/message": {
      get: path(
        "session.message.list",
        "sessionID",
        "limit",
        "order",
        "cursor",
      ),
    },
    "/api/model": { get: path("model.list", "location") },
    "/api/server/info": { get: { operationId: "server.info" } },
    "/auth/connect/{code}": { get: { operationId: "server.connect" } },
  },
};

export const sessionModels = [
  {
    id: "deepseek-v4.1-flash",
    modelID: "deepseek-v4.1-flash",
    providerID: "opencode-go",
    name: "DeepSeek V4.1 Flash",
    enabled: true,
    variants: [{ id: "low" }, { id: "high" }, { id: "max" }],
  },
  {
    id: "test-model",
    modelID: "test-model",
    providerID: "opencode-go",
    name: "Test Model",
    enabled: true,
    variants: [{ id: "low" }, { id: "high" }, { id: "max" }],
  },
];
