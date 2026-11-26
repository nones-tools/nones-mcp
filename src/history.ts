export function groupHistory(page: any) {
  const messages = Array.isArray(page)
    ? page
    : Array.isArray(page?.data)
      ? page.data
      : [];
  const groups: any[] = [];
  let current: any;
  for (const message of messages) {
    const type = message?.type || message?.info?.role || message?.role;
    if (type === "user") {
      current = { user: message, steps: [], terminal: null };
      groups.push(current);
    } else {
      if (!current) {
        current = { user: null, steps: [], terminal: null };
        groups.push(current);
      }
      if (type === "idle") current.terminal = message;
      else current.steps.push(message);
    }
  }
  return {
    groups,
    cursor: page?.cursor ?? null,
    beginsMidGroup: groups.length > 0 && groups[0].user === null,
    endsMidGroup: groups.length > 0 && groups.at(-1).terminal === null,
  };
}
