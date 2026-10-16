/* Shortlist check: what screening software (ATS) and a recruiter's 10-second
 * scan look for, checked on the resume text in the browser. No AI, no
 * credits. Real screening tools differ; these are the common basics. */

import { mentions } from "./tailor";

export type CheckState = "pass" | "warn" | "fail";
export interface Check { key: string; label: string; state: CheckState; detail: string; fix?: string; tailor?: boolean }

const SENIORITY = /\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|head of|chief|associate|intern|i{1,3}|iv|[1-4])\b/gi;

/** "Senior Data Engineer II" → "Data Engineer". */
export function coreTitle(title: string): string {
  return title.replace(/\(.*?\)/g, " ").replace(SENIORITY, " ").replace(/[-–—,/|].*$/, "").replace(/\s+/g, " ").trim();
}

const lines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const words = (t: string) => (t.match(/[A-Za-z0-9][A-Za-z0-9+#.'-]*/g) || []).length;

export function shortlistChecks(text: string, opts: { title: string; keywords: string[]; fileName?: string }): Check[] {
  const t = text || "";
  const ls = lines(t);
  const n = words(t);
  const out: Check[] = [];

  // 1. Keywords from the job
  const kw = opts.keywords.filter(Boolean);
  if (kw.length) {
    const covered = kw.filter((k) => mentions(t, k));
    const missing = kw.filter((k) => !covered.includes(k));
    const pct = Math.round((covered.length / kw.length) * 100);
    out.push({
      key: "keywords", label: "Job keywords", tailor: missing.length > 0,
      state: pct >= 70 ? "pass" : pct >= 45 ? "warn" : "fail",
      detail: covered.length + " of " + kw.length + " found (" + pct + "%)." + (missing.length ? " Missing: " + missing.slice(0, 8).join(", ") + (missing.length > 8 ? "…" : "") + "." : ""),
      fix: missing.length ? "Add the ones you really have, using the job's exact words, in your bullets and skills. Leave out any you don't have." : undefined,
    });

    // 2. Keywords near the top
    const top = t.slice(0, Math.max(400, Math.round(t.length * 0.3)));
    const early = covered.filter((k) => mentions(top, k)).length;
    if (covered.length >= 3) {
      out.push({
        key: "top", label: "Main skills near the top",
        state: early >= Math.ceil(covered.length / 2) ? "pass" : early >= 2 ? "warn" : "fail",
        detail: early + " of your " + covered.length + " matching keywords appear in the top third.",
        fix: early >= Math.ceil(covered.length / 2) ? undefined : "Add a 2–3 line summary at the top that names your main matching skills. Recruiters scan the top first.",
      });
    }
  }

  // 3. Job title
  const full = opts.title.trim();
  const core = coreTitle(full);
  if (full) {
    // "Snowflake Data Engineer" → also accept "Data Engineer".
    const tail = core.split(" ").slice(-2).join(" ");
    const hasFull = mentions(t, full);
    const said = hasFull ? full : core && core.length > 2 && mentions(t, core) ? core : tail.length > 5 && tail !== core && mentions(t, tail) ? tail : "";
    const hasCore = !hasFull && !!said;
    out.push({
      key: "title", label: "The job's title",
      state: hasFull || hasCore ? "pass" : "warn",
      detail: said ? "Your resume says \"" + said + "\"." + (said !== full ? " The posting says \"" + full + "\"." : "") : "\"" + (core || full) + "\" doesn't appear in your resume.",
      fix: hasFull || hasCore ? undefined : "If it's honest, use the same title in your headline or summary, e.g. \"" + (core || full) + " with N years in …\". Many searches start with the title.",
    });
  }

  // 4. Standard section headings
  const head = (re: RegExp) => ls.some((l) => l.length <= 40 && re.test(l));
  const exp = head(/^(professional |work |relevant )?(experience|employment|work history|career history)\b/i);
  const edu = head(/^(education|academic|qualifications)\b/i);
  const skl = head(/^((technical |core |key )?skills|technologies|tech stack|competencies)\b/i);
  const missingSec = [!exp && "Experience", !edu && "Education", !skl && "Skills"].filter(Boolean) as string[];
  out.push({
    key: "sections", label: "Standard section headings",
    state: !missingSec.length ? "pass" : !exp ? "fail" : "warn",
    detail: missingSec.length ? "Not found: " + missingSec.join(", ") + "." : "Experience, Education and Skills found.",
    fix: missingSec.length ? "Use plain headings like \"Experience\", \"Education\" and \"Skills\". Screening software looks for them; creative names can get skipped." : undefined,
  });

  // 5. Contact details
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t);
  const phone = /(\+?\d[\d\s().-]{7,}\d)/.test(t);
  out.push({
    key: "contact", label: "Contact details",
    state: email && phone ? "pass" : email || phone ? "warn" : "fail",
    detail: email && phone ? "Email and phone found." : "Not found: " + [!email && "email", !phone && "phone"].filter(Boolean).join(" and ") + ".",
    fix: email && phone ? undefined : "Put your email and phone as plain text at the top, not in a header, footer or image.",
  });

  // 6. Measurable results
  const bullets = ls.filter((l) => /^[•\-*–▪●◦]\s*/.test(l) || (l.length >= 60 && /^[A-Z]/.test(l) && !/[:]$/.test(l)));
  const withNum = bullets.filter((l) => /\d|%|\$|£|€|₹/.test(l)).length;
  if (bullets.length >= 3) {
    const share = Math.round((withNum / bullets.length) * 100);
    out.push({
      key: "numbers", label: "Results with numbers",
      state: share >= 40 ? "pass" : share >= 20 ? "warn" : "fail",
      detail: withNum + " of " + bullets.length + " bullets have a number (" + share + "%).",
      fix: share >= 40 ? undefined : "Add the result to your strongest bullets: time saved, cost, users, data size, % faster. Recruiters shortlist on impact.",
    });
  }

  // 7. Length
  out.push({
    key: "length", label: "Length",
    state: n >= 350 && n <= 1100 ? "pass" : n < 150 ? "fail" : "warn",
    detail: "About " + n + " words" + (n > 1100 ? ", likely 3+ pages." : n < 350 ? ", quite short." : ", about 1–2 pages."),
    fix: n > 1100 ? "Trim to 1–2 pages: keep the last 10 years and the work that matches this job." : n < 350 ? "Add more detail to your recent roles: what you built, the tools, the result." : undefined,
  });

  // 8. Readable layout
  const piped = ls.filter((l) => (l.match(/\|/g) || []).length >= 2 || /\t.*\t/.test(l)).length;
  const file = (opts.fileName || "").toLowerCase();
  const scanned = file.endsWith(".pdf") && n < 150;
  out.push({
    key: "layout", label: "Readable by screening software",
    state: scanned ? "fail" : piped >= 4 ? "warn" : "pass",
    detail: scanned ? "Very little text could be read from your PDF. It may be a scan or an image." : piped >= 4 ? piped + " lines look like tables or columns." : "The text reads in a clean order.",
    fix: scanned ? "Export your resume again from Word or Google Docs as a text PDF or .docx." : piped >= 4 ? "Use one column and plain bullets. Tables, columns and text boxes can come out jumbled." : undefined,
  });

  return out;
}
