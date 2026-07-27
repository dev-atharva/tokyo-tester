export function isPublicSitePath(pathname: string): boolean {
  return (
    pathname === "/" || pathname === "/docs" || pathname.startsWith("/docs/")
  );
}
