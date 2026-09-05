/** MCP tools-list invalidation. Pass-through notification, not a request. */
export function toolsListChangedNotification(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/tools/list_changed",
  });
}
