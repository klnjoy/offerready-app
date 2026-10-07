/* A deliberately small History-API router (about a dozen routes, no nesting).
 * Avoids a routing dependency; swap for react-router or expo-router later
 * without touching screen logic — screens only use Link, useNavigate,
 * useLocation and useSearchParams. */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type AnchorHTMLAttributes, type MouseEvent, type ReactNode,
} from "react";

interface Loc {
  pathname: string;
  search: string;
  hash: string;
}

interface RouterValue {
  location: Loc;
  navigate(to: string, opts?: { replace?: boolean }): void;
}

const RouterContext = createContext<RouterValue | null>(null);

/** Where the app is mounted: "/" locally, "/offerready-app/" on GitHub Pages. */
const BASE = ((import.meta.env.BASE_URL as string | undefined) || "/").replace(/\/?$/, "/");

/** App path ("/jobs") → real URL path ("/offerready-app/jobs"). */
export function withBase(to: string): string {
  if (/^[a-z]+:/i.test(to) || to.startsWith("#")) return to;
  return BASE + to.replace(/^\//, "");
}

/** Real URL path → app path. */
function stripBase(pathname: string): string {
  if (BASE !== "/" && pathname.startsWith(BASE.slice(0, -1))) {
    const rest = pathname.slice(BASE.length - 1);
    return rest.startsWith("/") ? rest : "/" + rest;
  }
  return pathname;
}

function current(): Loc {
  return { pathname: stripBase(window.location.pathname), search: window.location.search, hash: window.location.hash };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Loc>(current);

  useEffect(() => {
    const onPop = () => setLocation(current());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) window.history.replaceState(null, "", withBase(to));
    else window.history.pushState(null, "", withBase(to));
    setLocation(current());
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter(): RouterValue {
  const v = useContext(RouterContext);
  if (!v) throw new Error("Router hooks must be used inside <RouterProvider>");
  return v;
}

export function useLocation(): Loc {
  return useRouter().location;
}

export function useNavigate() {
  return useRouter().navigate;
}

export function useSearchParams(): URLSearchParams {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** Match "/jobs/:id" against a pathname; returns params or null. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** Internal link: client-side navigation, normal behavior for modified clicks. */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const navigate = useNavigate();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={withBase(to)} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

/** External link to the MkDocs study site (or anywhere else). */
export function ExternalLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
