const PUBLIC_API_PATHS = new Set(["/api/login", "/api/setup", "/api/health", "/api/up"]);

export function isPublicApiPath(path: string): boolean {
  return PUBLIC_API_PATHS.has(path);
}
