const PUBLIC_API_PATHS = new Set(["/api/login", "/api/setup"]);

export function isPublicApiPath(path: string): boolean {
  return PUBLIC_API_PATHS.has(path);
}
