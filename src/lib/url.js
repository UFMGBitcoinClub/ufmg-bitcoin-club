// Builds an internal link that respects `base` in astro.config.mjs, so
// links keep working whether the site is deployed at the domain root or
// under a GitHub Pages project-page subpath (e.g. /repo-name).
export function withBase(pathname) {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${normalizedBase}${normalizedPath}`;
}
