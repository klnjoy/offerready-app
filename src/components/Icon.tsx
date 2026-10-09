/* 1.7px line icons that inherit currentColor (shared by Home, the header and
 * the Practice / Mock interview hubs). Decorative: always aria-hidden. */

import type { ReactNode } from "react";

export type IconName =
  | "mic" | "calendar" | "shield" | "book" | "fit" | "gauge" | "check" | "arrow"
  | "lock" | "target" | "layers" | "search" | "spark" | "chat" | "plus" | "ext"
  | "briefcase" | "list" | "link";

const PATHS: Record<IconName, ReactNode> = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M8.5 14.5l2 2 4-4" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="M9 12.5l2 2 4-4.5" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5M9 7.5h7M9 11h5" /></>,
  fit: <><path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L14.5 3Z" /><path d="M14 3v5h5M8.5 14l2.2 2.2L15.5 11.5" /></>,
  gauge: <><path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0" /><path d="M12 13.5 15.5 9" /><circle cx="12" cy="14" r="1.4" /></>,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  layers: <><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  chat: <path d="M4 5.5h16v10H9.5L5 19.5v-4H4v-10Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  briefcase: <><rect x="3.5" y="7" width="17" height="12.5" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.8" cy="6.5" r="1.1" /><circle cx="4.8" cy="12" r="1.1" /><circle cx="4.8" cy="17.5" r="1.1" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
};

export function Icon({ name, size = 20, className = "hm-ico" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
