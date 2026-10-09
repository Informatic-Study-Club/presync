// Rute yang bisa dibuka tanpa login.
const PUBLIC_PATHS = ["/masuk", "/lupa-password", "/auth/confirm"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Hanya menerima path relatif di aplikasi sendiri ("/..."), untuk mencegah
 * open redirect lewat parameter `next`.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
