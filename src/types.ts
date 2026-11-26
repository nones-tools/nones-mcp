export interface OperationParameter {
  name: string;
  in: string;
  required?: boolean;
}

export interface Operation {
  id: string;
  method: string;
  path: string;
  parameters: OperationParameter[];
  description?: string;
}

export interface Request {
  operation: string;
  path?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  confirm?: boolean;
}

export type OperationCategory =
  "read" | "write" | "admin" | "exec" | "destructive";
