/* Our own illustrations: inline SVG in the brand colours (no stock photos),
 * used on cards, hub tiles and empty screens. */

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Illustrations

export type ArtKey = "questions" | "drill" | "stories" | "mock" | "bank" | "llm" | "prompt" | "rag" | "vector" | "agent" | "mcp" | "eval" | "ops"
  | "jobs" | "notes" | "debrief" | "asked" | "text" | "offers";

const BG: Record<ArtKey, [string, string]> = {
  questions: ["#123a6b", "#0f2547"], drill: ["#1d3a5f", "#10233f"], stories: ["#1f4d46", "#0f2a2f"], mock: ["#2b2f6b", "#151a40"],
  bank: ["#1b3d5c", "#0f2236"], llm: ["#183a66", "#0c1f3c"], prompt: ["#22405f", "#101e33"], rag: ["#164a52", "#0b252c"],
  vector: ["#26335f", "#111a37"], agent: ["#1f4a3b", "#0d2620"], mcp: ["#33305f", "#171535"], eval: ["#3a3a20", "#1c1c10"], ops: ["#21405a", "#0e1f2e"],
  jobs: ["#173f66", "#0d2340"], notes: ["#24405e", "#101f33"], debrief: ["#1f4a3b", "#0d2620"], asked: ["#2b2f6b", "#151a40"], text: ["#1b3d5c", "#0f2236"], offers: ["#3a3420", "#1c1910"],
};
const G = "#22c07a", B = "#8db7ea", W = "#e9f0fb", A = "#f2b84b";

export function Art({ k, className = "" }: { k: ArtKey; className?: string }) {
  const [c1, c2] = BG[k];
  const id = "ic-g-" + k;
  const motif: Record<ArtKey, ReactNode> = {
    questions: <><rect x="70" y="34" width="96" height="46" rx="14" fill={W} opacity=".95" /><path d="M92 80 l-8 16 20-16z" fill={W} opacity=".95" /><rect x="132" y="62" width="84" height="40" rx="12" fill={G} /><path d="M196 102 l10 14-22-14z" fill={G} /><text x="118" y="64" textAnchor="middle" fontSize="26" fontWeight="800" fill="#0f2547">?</text><circle cx="160" cy="82" r="3.5" fill="#0f2547" /><circle cx="174" cy="82" r="3.5" fill="#0f2547" /><circle cx="188" cy="82" r="3.5" fill="#0f2547" /></>,
    drill: <><path d="M140 30v86" stroke={W} strokeWidth="4" strokeLinecap="round" /><path d="M92 50h96" stroke={W} strokeWidth="4" strokeLinecap="round" /><path d="M92 50l-18 34h36z" fill={B} /><path d="M188 50l-18 40h36z" fill={G} /><rect x="118" y="114" width="44" height="8" rx="4" fill={W} /></>,
    stories: <><path d="M80 36h56v80H86a6 6 0 0 1-6-6z" fill={W} /><path d="M144 36h56v74a6 6 0 0 1-6 6h-50z" fill={B} /><path d="M140 36v80" stroke="#0f2a2f" strokeWidth="3" /><path d="M172 56l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill={A} /><path d="M92 56h32M92 68h28M92 80h32M92 92h22" stroke="#1f4d46" strokeWidth="4" strokeLinecap="round" /></>,
    mock: <><rect x="124" y="30" width="32" height="56" rx="16" fill={W} /><path d="M108 70a32 32 0 0 0 64 0" stroke={G} strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M140 102v16M126 118h28" stroke={G} strokeWidth="5" strokeLinecap="round" /><path d="M86 58c-6 8-6 22 0 30M70 50c-12 14-12 38 0 52M194 58c6 8 6 22 0 30M210 50c12 14 12 38 0 52" stroke={B} strokeWidth="4" fill="none" strokeLinecap="round" /></>,
    bank: <><rect x="96" y="50" width="96" height="62" rx="10" fill={B} transform="rotate(-8 144 81)" /><rect x="92" y="44" width="96" height="62" rx="10" fill={W} transform="rotate(4 140 75)" /><path d="M110 66h56M110 80h40" stroke="#1b3d5c" strokeWidth="5" strokeLinecap="round" transform="rotate(4 140 75)" /><circle cx="176" cy="96" r="12" fill={G} /><path d="M170 96l4 4 8-8" stroke="#0f2236" strokeWidth="3" fill="none" strokeLinecap="round" /></>,
    llm: <>{[0, 1, 2].map((c) => [0, 1, 2, 3].map((r) => <circle key={c + "-" + r} cx={92 + c * 48} cy={38 + r * 24} r="7" fill={c === 1 ? G : W} />))}{[0, 1].map((c) => [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((s) => <path key={c + "" + r + s} d={`M${99 + c * 48} ${38 + r * 24}L${133 + c * 48} ${38 + s * 24}`} stroke={B} strokeWidth="1" opacity=".45" />)))}</>,
    prompt: <><rect x="74" y="40" width="132" height="66" rx="12" fill={W} /><path d="M90 60h70M90 74h96M90 88h52" stroke="#22405f" strokeWidth="5" strokeLinecap="round" /><rect x="150" y="83" width="4" height="12" fill={G} /><path d="M196 30l4 8 8 2-8 3-4 8-3-8-8-3 8-2z" fill={A} /></>,
    rag: <><path d="M72 44h40l12 12v56H72z" fill={W} /><path d="M80 66h34M80 78h34M80 90h24" stroke="#164a52" strokeWidth="4" strokeLinecap="round" /><path d="M132 78h22" stroke={G} strokeWidth="4" strokeLinecap="round" /><path d="M150 72l8 6-8 6" fill="none" stroke={G} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{[0, 1, 2].map((i) => <rect key={i} x="168" y={50 + i * 20} width="40" height="12" rx="6" fill={i === 1 ? G : B} />)}</>,
    vector: <>{[[96, 50], [112, 72], [88, 92], [176, 46], [192, 70], [170, 88], [140, 104], [150, 40]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 8 : 6} fill={i < 3 ? G : i < 6 ? B : W} />)}<circle cx="102" cy="72" r="30" fill="none" stroke={G} strokeWidth="2" strokeDasharray="4 5" /><circle cx="180" cy="68" r="30" fill="none" stroke={B} strokeWidth="2" strokeDasharray="4 5" /></>,
    agent: <><rect x="112" y="40" width="56" height="44" rx="12" fill={W} /><circle cx="128" cy="62" r="5" fill="#1f4a3b" /><circle cx="152" cy="62" r="5" fill="#1f4a3b" /><path d="M140 40v-8" stroke={W} strokeWidth="4" strokeLinecap="round" /><circle cx="140" cy="29" r="4" fill={G} /><path d="M112 70l-30 22M168 70l30 22M140 84v18" stroke={B} strokeWidth="3" /><rect x="66" y="92" width="32" height="20" rx="6" fill={G} /><rect x="182" y="92" width="32" height="20" rx="6" fill={G} /><rect x="124" y="102" width="32" height="20" rx="6" fill={B} /></>,
    mcp: <><rect x="78" y="56" width="50" height="34" rx="8" fill={W} /><path d="M128 66h18M128 80h18" stroke={W} strokeWidth="5" strokeLinecap="round" /><rect x="152" y="52" width="54" height="42" rx="10" fill={G} /><circle cx="179" cy="73" r="8" fill="#171535" /><path d="M92 68h22M92 78h14" stroke="#33305f" strokeWidth="4" strokeLinecap="round" /></>,
    eval: <><path d="M76 112h132" stroke={W} strokeWidth="3" strokeLinecap="round" /><rect x="88" y="78" width="18" height="34" rx="4" fill={B} /><rect x="116" y="60" width="18" height="52" rx="4" fill={B} /><rect x="144" y="46" width="18" height="66" rx="4" fill={G} /><rect x="172" y="34" width="18" height="78" rx="4" fill={A} /><path d="M86 70l30-18 28-10 30-14" stroke={W} strokeWidth="3" fill="none" strokeLinecap="round" /></>,
    ops: <><circle cx="140" cy="74" r="30" fill="none" stroke={W} strokeWidth="6" strokeDasharray="10 8" /><circle cx="140" cy="74" r="14" fill={G} /><path d="M140 30v10M140 108v10M96 74h10M174 74h10" stroke={B} strokeWidth="5" strokeLinecap="round" /></>,
    jobs: <><rect x="98" y="48" width="84" height="62" rx="12" fill={W} /><path d="M124 48v-8a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v8" stroke={W} strokeWidth="5" fill="none" /><path d="M98 76h84" stroke="#173f66" strokeWidth="4" /><rect x="132" y="70" width="16" height="12" rx="3" fill={G} /><path d="M202 36l4 9 9 3-9 3-4 9-3-9-9-3 9-3z" fill={A} /><path d="M78 60l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={B} /></>,
    notes: <><rect x="100" y="32" width="80" height="92" rx="10" fill={W} /><rect x="122" y="26" width="36" height="14" rx="5" fill={G} />{[0, 1, 2, 3].map((i) => <g key={i}><circle cx="116" cy={58 + i * 16} r="4" fill={i < 2 ? G : B} /><path d={`M126 ${58 + i * 16}h${i % 2 ? 30 : 40}`} stroke="#24405e" strokeWidth="4" strokeLinecap="round" /></g>)}<path d="M192 92l18-18 8 8-18 18-10 2z" fill={A} /></>,
    debrief: <><rect x="92" y="38" width="96" height="78" rx="12" fill={W} /><path d="M92 58h96" stroke="#1f4a3b" strokeWidth="4" /><path d="M114 30v16M166 30v16" stroke={W} strokeWidth="6" strokeLinecap="round" /><circle cx="140" cy="86" r="18" fill={G} /><path d="M131 86l6 6 12-12" stroke="#0d2620" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
    asked: <><rect x="66" y="40" width="86" height="40" rx="12" fill={B} /><rect x="96" y="58" width="86" height="40" rx="12" fill={W} /><rect x="126" y="76" width="86" height="40" rx="12" fill={G} /><text x="169" y="103" textAnchor="middle" fontSize="20" fontWeight="800" fill="#151a40">?</text><path d="M110 78h52" stroke="#151a40" strokeWidth="4" strokeLinecap="round" /><path d="M80 60h40" stroke="#151a40" strokeWidth="4" strokeLinecap="round" opacity=".6" /></>,
    text: <><rect x="78" y="36" width="124" height="70" rx="12" fill={W} /><rect x="92" y="52" width="70" height="10" rx="5" fill={B} /><rect x="118" y="72" width="70" height="10" rx="5" fill={G} /><rect x="92" y="92" width="40" height="6" rx="3" fill="#1b3d5c" opacity=".4" />{[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={86 + i * 19} y="114" width="14" height="10" rx="3" fill={W} opacity=".55" />)}</>,
    offers: <><rect x="78" y="44" width="70" height="80" rx="10" fill={W} transform="rotate(-6 113 84)" /><rect x="134" y="38" width="70" height="80" rx="10" fill={G} transform="rotate(5 169 78)" /><text x="113" y="92" textAnchor="middle" fontSize="26" fontWeight="800" fill="#3a3420" transform="rotate(-6 113 84)">$</text><text x="169" y="86" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1c1910" transform="rotate(5 169 78)">$</text></>,
  };
  return (
    <svg className={"ic-art" + (className ? " " + className : "")} viewBox="0 0 280 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient></defs>
      <rect width="280" height="140" fill={`url(#${id})`} />
      <circle cx="250" cy="20" r="46" fill={G} opacity=".08" /><circle cx="24" cy="130" r="40" fill={B} opacity=".08" />
      {motif[k]}
    </svg>
  );
}

