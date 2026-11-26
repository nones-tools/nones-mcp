export type Operation = {
	id: string;
	method: string;
	path: string;
	parameters: Array<{ name: string; in: string; required?: boolean }>;
	description?: string;
};

export type Request = {
	operation: string;
	path?: Record<string, string>;
	query?: Record<string, unknown>;
	body?: unknown;
	confirm?: boolean;
};

export type OperationCategory =
	| "read"
	| "write"
	| "admin"
	| "exec"
	| "destructive";
