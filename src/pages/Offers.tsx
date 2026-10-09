/* Compare offers — 2–4 offers side by side (local only, KEYS.offers): year-1
 * and annualised totals, a comparison table and CSS bars with the best value
 * on each dimension marked, deadline countdowns, and a streamed negotiation
 * plan (email + call script) from the help API. */

import { useMemo, useState } from "react";
import {
  DIMENSIONS, LEVERAGE, bestBy, deadlineDays, deadlineLabel, emptyOffer, loadOffers, money, moneyShort, negotiationPrompt,
  offerTotals, saveOffers, type Leverage, type Offer,
} from "../lib/offers";
import { formatDay, localDay } from "../lib/interviewDates";
import { newId } from "../lib/debriefStore";
import { StreamDraft } from "../components/StreamDraft";

const MAX = 4;
const REMOTE_LABEL: Record<Offer["remote"], string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote", "": "" };
/** "Berlin · Hybrid", without repeating "Remote · Remote". */
const where = (o: Offer) => {
  const loc = o.location.trim();
  const setup = REMOTE_LABEL[o.remote];
  return loc && setup && loc.toLowerCase() !== setup.toLowerCase() ? loc + " · " + setup : loc || setup;
};

export default function OffersPage() {
  const today = localDay();
  const [offers, setOffers] = useState<Offer[]>(loadOffers);
  const [editing, setEditing] = useState<Offer | null>(() => (loadOffers().length ? null : emptyOffer(newId("o"))));

  const persist = (next: Offer[]) => { setOffers(next); saveOffers(next); };
  const save = (o: Offer) => {
    const i = offers.findIndex((x) => x.id === o.id);
    persist(i >= 0 ? offers.map((x) => (x.id === o.id ? o : x)) : [...offers, o].slice(0, MAX));
    setEditing(null);
  };
  const remove = (id: string) => persist(offers.filter((o) => o.id !== id));
  const best = useMemo(() => bestBy(offers), [offers]);
  const deadlines = offers.map((o) => ({ o, d: deadlineDays(o.deadline, today) })).filter((x) => x.d != null).sort((a, b) => (a.d as number) - (b.d as number));

  return (
    <div className="page dto">
      {deadlines.length > 0 && (
        <div className="dto-deadlines" aria-label="Offer deadlines">
          {deadlines.map(({ o, d }) => (
            <span key={o.id} className={"dto-dl" + (d! < 0 ? " is-past" : d! <= 3 ? " is-soon" : "")}>
              <strong>{o.company || "Offer"}</strong> {deadlineLabel(d)}
            </span>
          ))}
        </div>
      )}

      <div className="dto-toolbar">
        <p className="muted small dto-grow">{offers.length ? offers.length + " of " + MAX + " offers · stored on this device only" : "Add the offers you have, or expect, to compare them fairly."}</p>
        {!editing && offers.length < MAX && <button type="button" className="btn btn-primary dto-add-offer" onClick={() => setEditing(emptyOffer(newId("o")))}>+ Add an offer</button>}
      </div>

      {editing && <OfferEditor key={editing.id} initial={editing} isNew={!offers.some((o) => o.id === editing.id)} onCancel={() => setEditing(null)} onSave={save} canCancel={offers.length > 0} />}

      {offers.length > 0 && (
        <div className="dto-offers">
          {offers.map((o) => <OfferCard key={o.id} o={o} today={today} best={best} onEdit={() => setEditing(o)} onDelete={() => remove(o.id)} />)}
        </div>
      )}

      {offers.length >= 2 && <Comparison offers={offers} best={best} />}
      {offers.length === 1 && !editing && <p className="muted small">Add a second offer to see the comparison.</p>}

      {offers.length > 0 && <Negotiation offers={offers} />}
    </div>
  );
}

function OfferCard({ o, today, best, onEdit, onDelete }: { o: Offer; today: string; best: ReturnType<typeof bestBy>; onEdit(): void; onDelete(): void }) {
  const [confirm, setConfirm] = useState(false);
  const t = offerTotals(o);
  const d = deadlineDays(o.deadline, today);
  const isBest = best.annualised.includes(o.id);
  return (
    <article className={"card dto-offer" + (isBest ? " is-best" : "")}>
      <header className="dto-offer-head">
        <div className="dto-offer-title">
          <h3>{o.company || "Untitled offer"}</h3>
          <p className="small muted">{[o.title, o.level].filter(Boolean).join(" · ") || "Role not set"}</p>
        </div>
        {isBest && <span className="pill pill-ok">Highest annualised</span>}
      </header>
      <div className="dto-offer-total">
        <span className="dto-offer-num">{money(t.annualised, o.currency)}</span>
        <span className="small muted">annualised · year 1 {money(t.year1, o.currency)}</span>
      </div>
      <div className="dto-offer-tags">
        {d != null && <span className={"iv-chip" + (d < 0 ? " iv-chip-past" : d <= 3 ? " iv-chip-soon" : "")}>{deadlineLabel(d)}{d >= 0 ? " · " + formatDay(o.deadline, { month: "short", day: "numeric" }) : ""}</span>}
        {(o.location || o.remote) && <span className="chip">{where(o)}</span>}
        {o.startDate && <span className="chip">Starts {formatDay(o.startDate, { month: "short", day: "numeric" })}</span>}
      </div>
      {o.notes && <p className="small dto-notes">{o.notes}</p>}
      <div className="dto-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>Edit</button>
        {confirm ? (
          <span className="dto-confirm">Remove this offer?
            <button type="button" className="btn btn-danger btn-small" onClick={onDelete}>Remove</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirm(false)}>Keep</button>
          </span>
        ) : <button type="button" className="link-btn small dto-del" onClick={() => setConfirm(true)}>Remove</button>}
      </div>
    </article>
  );
}

function Comparison({ offers, best }: { offers: Offer[]; best: ReturnType<typeof bestBy> }) {
  const totals = offers.map((o) => ({ o, t: offerTotals(o) }));
  const max = Math.max(1, ...totals.map((x) => Math.max(x.t.year1, x.t.annualised)));
  const [view, setView] = useState<"annualised" | "year1">("annualised");
  return (
    <section className="card dto-compare" aria-labelledby="dto-cmp-h">
      <div className="td-sec-head">
        <div>
          <h2 id="dto-cmp-h">Side by side</h2>
          <p className="muted small">Annualised spreads equity and sign-on over the vesting years. Year 1 counts the full sign-on.</p>
        </div>
        <div className="dto-seg dto-seg-sm" role="group" aria-label="Total to compare">
          <button type="button" className={"dto-seg-btn" + (view === "annualised" ? " on" : "")} aria-pressed={view === "annualised"} onClick={() => setView("annualised")}>Annualised</button>
          <button type="button" className={"dto-seg-btn" + (view === "year1" ? " on" : "")} aria-pressed={view === "year1"} onClick={() => setView("year1")}>Year 1</button>
        </div>
      </div>

      <div className="dto-bars" role="list" aria-label={(view === "annualised" ? "Annualised" : "Year-1") + " total by offer"}>
        {totals.map(({ o, t }) => {
          const vest = Math.max(1, o.vestYears || 4);
          const sign = view === "year1" ? t.signOn : Math.round(t.signOn / vest);
          const total = view === "year1" ? t.year1 : t.annualised;
          const seg = (n: number) => (n / max) * 100 + "%";
          const top = best[view].includes(o.id);
          return (
            <div key={o.id} className={"dto-bar-row" + (top ? " is-best" : "")} role="listitem">
              <div className="dto-bar-label"><strong>{o.company || "Offer"}</strong><span>{money(total, o.currency)}{top ? " · best" : ""}</span></div>
              <div className="dto-bar-track" aria-hidden="true">
                <span className="dto-seg-base" style={{ width: seg(t.base) }} />
                <span className="dto-seg-bonus" style={{ width: seg(t.bonus) }} />
                <span className="dto-seg-equity" style={{ width: seg(t.equityPerYear) }} />
                <span className="dto-seg-sign" style={{ width: seg(sign) }} />
              </div>
            </div>
          );
        })}
        <div className="dto-legend" aria-hidden="true">
          <span><i className="dto-seg-base" />Base</span><span><i className="dto-seg-bonus" />Bonus</span><span><i className="dto-seg-equity" />Equity / yr</span><span><i className="dto-seg-sign" />Sign-on</span>
        </div>
      </div>

      <div className="table-wrap dto-table-wrap">
        <table className="dto-table">
          <thead>
            <tr><th scope="col"><span className="dto-sr">Dimension</span></th>{offers.map((o) => <th key={o.id} scope="col">{o.company || "Offer"}</th>)}</tr>
          </thead>
          <tbody>
            {DIMENSIONS.map(({ key, label }) => (
              <tr key={key} className={key === "year1" || key === "annualised" ? "dto-tr-total" : ""}>
                <th scope="row">{label}</th>
                {totals.map(({ o, t }) => {
                  const on = best[key].includes(o.id);
                  return (
                    <td key={o.id} className={on ? "is-best" : ""}>
                      {key === "bonus" && o.bonusPct ? money(t.bonus, o.currency) + " (" + o.bonusPct + "%)" : money(t[key], o.currency)}
                      {on && <span className="dto-best-mark">Best</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr><th scope="row">Equity</th>{offers.map((o) => <td key={o.id}>{o.equityMode === "annual" ? moneyShort(o.equityAnnual, o.currency) + " / yr" : moneyShort(o.equityAmount, o.currency) + " over " + o.vestYears + " yrs"}</td>)}</tr>
            <tr><th scope="row">Level</th>{offers.map((o) => <td key={o.id}>{o.level || "—"}</td>)}</tr>
            <tr><th scope="row">Location</th>{offers.map((o) => <td key={o.id}>{where(o) || "—"}</td>)}</tr>
            <tr><th scope="row">Start</th>{offers.map((o) => <td key={o.id}>{o.startDate ? formatDay(o.startDate, { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>)}</tr>
            <tr><th scope="row">Deadline</th>{offers.map((o) => <td key={o.id}>{o.deadline ? formatDay(o.deadline, { month: "short", day: "numeric" }) : "—"}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Negotiation({ offers }: { offers: Offer[] }) {
  const ranked = [...offers].sort((a, b) => offerTotals(b).annualised - offerTotals(a).annualised);
  const [targetId, setTargetId] = useState<string>(ranked[0]?.id || "");
  const [lev, setLev] = useState<Leverage>(offers.length > 1 ? "competing" : "final_round");
  const [extra, setExtra] = useState("");
  const [run, setRun] = useState(0);
  const target = offers.find((o) => o.id === targetId) || offers[0];
  const others = offers.filter((o) => o.id !== target.id);

  return (
    <section className="card dto-nego" aria-labelledby="dto-nego-h">
      <div className="td-sec-head">
        <div>
          <span className="td-eyebrow">Negotiation plan</span>
          <h2 id="dto-nego-h">Ask for more, the right way</h2>
          <p className="muted small">Pick the offer to negotiate and your strongest leverage. You get an email and a short call script to adapt.</p>
        </div>
      </div>
      <div className="dto-grid2">
        <label className="dto-field">
          <span className="field-label">Offer to negotiate</span>
          <select className="input" value={target.id} onChange={(e) => { setTargetId(e.target.value); setRun(0); }}>
            {offers.map((o) => <option key={o.id} value={o.id}>{(o.company || "Offer") + (o.title ? " · " + o.title : "")}</option>)}
          </select>
        </label>
        <label className="dto-field">
          <span className="field-label">Anything specific? <span className="muted">(optional)</span></span>
          <input className="input" value={extra} maxLength={120} placeholder="e.g. want a higher base, flexible start date" onChange={(e) => setExtra(e.target.value)} />
        </label>
      </div>
      <fieldset className="dto-field dto-fs">
        <legend className="field-label">Your leverage</legend>
        <div className="dto-levs" role="radiogroup" aria-label="Your leverage">
          {LEVERAGE.map((l) => {
            const off = l.key === "competing" && !others.length;
            return (
              <button key={l.key} type="button" role="radio" aria-checked={lev === l.key} disabled={off}
                className={"dto-lev" + (lev === l.key ? " on" : "")} onClick={() => { setLev(l.key); setRun(0); }}>
                <strong>{l.label}</strong>
                <span>{off ? "Add a second offer to use this." : l.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="row">
        <button type="button" className="btn btn-primary dto-nego-run" onClick={() => setRun((n) => n + 1)}>{run ? "Draft a new version" : "Draft my negotiation"}</button>
      </div>
      {run > 0 && (
        <StreamDraft key={run + target.id + lev} title={"Negotiation: " + (target.company || "offer")} page={{ title: "Compare offers", path: "/offers" }}
          prompt={() => negotiationPrompt(target, others, lev, extra)} />
      )}
      <p className="dto-disclaimer small">Not financial, tax or legal advice. Figures are what you entered; totals are simple estimates that ignore taxes, refreshers and equity price changes.</p>
    </section>
  );
}

function OfferEditor({ initial, isNew, canCancel, onCancel, onSave }: { initial: Offer; isNew: boolean; canCancel: boolean; onCancel(): void; onSave(o: Offer): void }) {
  const [o, setO] = useState<Offer>(initial);
  const [err, setErr] = useState("");
  const set = <K extends keyof Offer>(k: K, v: Offer[K]) => setO((x) => ({ ...x, [k]: v }));
  const numIn = (k: "base" | "bonusPct" | "equityAmount" | "equityAnnual" | "signOn" | "vestYears", label: string, opts: { suffix?: string; prefix?: string; step?: number; placeholder?: string } = {}) => (
    <label className="dto-field">
      <span className="field-label">{label}</span>
      <span className="dto-num">
        {opts.prefix && <span className="dto-affix">{opts.prefix}</span>}
        <input className="input" type="number" inputMode="decimal" min={0} step={opts.step || 1} value={o[k] || ""} placeholder={opts.placeholder || "0"}
          onChange={(e) => set(k, Math.max(0, Number(e.target.value) || 0) as Offer[typeof k])} />
        {opts.suffix && <span className="dto-affix">{opts.suffix}</span>}
      </span>
    </label>
  );
  const t = offerTotals(o);
  const submit = () => {
    if (!o.company.trim()) return setErr("Add the company name.");
    if (!o.base) return setErr("Add the base salary.");
    setErr("");
    onSave({ ...o, company: o.company.trim(), title: o.title.trim(), vestYears: Math.max(1, Math.min(10, Math.round(o.vestYears) || 4)) });
  };
  const cur = o.currency === "USD" ? "$" : o.currency === "EUR" ? "€" : o.currency === "GBP" ? "£" : "";

  return (
    <section className="card dto-editor" aria-labelledby="dto-off-h">
      <div className="td-sec-head">
        <div>
          <span className="td-eyebrow">{isNew ? "New offer" : "Edit offer"}</span>
          <h2 id="dto-off-h">{o.company || "Offer details"}</h2>
        </div>
        <div className="dto-live" aria-live="polite">
          <span className="small muted">Annualised</span>
          <strong>{money(t.annualised, o.currency)}</strong>
        </div>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <form className="dto-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="dto-grid3">
          <label className="dto-field"><span className="field-label">Company</span><input className="input" value={o.company} maxLength={80} onChange={(e) => set("company", e.target.value)} placeholder="Acme" /></label>
          <label className="dto-field"><span className="field-label">Title</span><input className="input" value={o.title} maxLength={100} onChange={(e) => set("title", e.target.value)} placeholder="Senior Data Engineer" /></label>
          <label className="dto-field"><span className="field-label">Level</span><input className="input" value={o.level} maxLength={40} onChange={(e) => set("level", e.target.value)} placeholder="L5 / Senior" /></label>
        </div>
        <div className="dto-grid3">
          {numIn("base", "Base salary / yr", { prefix: cur, step: 1000, placeholder: "180000" })}
          {numIn("bonusPct", "Bonus target", { suffix: "%", step: 1, placeholder: "10" })}
          {numIn("signOn", "Sign-on bonus", { prefix: cur, step: 1000 })}
        </div>
        <fieldset className="dto-field dto-fs">
          <legend className="field-label">Equity</legend>
          <div className="dto-seg dto-seg-sm" role="radiogroup" aria-label="How the equity is stated">
            <button type="button" role="radio" aria-checked={o.equityMode === "grant"} className={"dto-seg-btn" + (o.equityMode === "grant" ? " on" : "")} onClick={() => set("equityMode", "grant")}>Total grant</button>
            <button type="button" role="radio" aria-checked={o.equityMode === "annual"} className={"dto-seg-btn" + (o.equityMode === "annual" ? " on" : "")} onClick={() => set("equityMode", "annual")}>Annual value</button>
          </div>
          <div className="dto-grid3">
            {o.equityMode === "grant" ? (
              <>
                {numIn("equityAmount", "Grant value", { prefix: cur, step: 1000 })}
                {numIn("vestYears", "Vesting years", { suffix: "yrs", placeholder: "4" })}
              </>
            ) : (
              <>
                {numIn("equityAnnual", "Equity per year", { prefix: cur, step: 1000 })}
                {numIn("vestYears", "Years (for sign-on spread)", { suffix: "yrs", placeholder: "4" })}
              </>
            )}
            <label className="dto-field">
              <span className="field-label">Currency</span>
              <select className="input" value={o.currency} onChange={(e) => set("currency", e.target.value)}>
                {["USD", "EUR", "GBP", "CAD", "AUD", "INR", "SGD", "CHF"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        </fieldset>
        <div className="dto-grid3">
          <label className="dto-field"><span className="field-label">Location</span><input className="input" value={o.location} maxLength={80} onChange={(e) => set("location", e.target.value)} placeholder="Berlin" /></label>
          <label className="dto-field">
            <span className="field-label">Work setup</span>
            <select className="input" value={o.remote} onChange={(e) => set("remote", e.target.value as Offer["remote"])}>
              <option value="">Not set</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </label>
          <label className="dto-field"><span className="field-label">Start date</span><input className="input" type="date" value={o.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
        </div>
        <div className="dto-grid2">
          <label className="dto-field"><span className="field-label">Decision deadline</span><input className="input" type="date" value={o.deadline} onChange={(e) => set("deadline", e.target.value)} /></label>
          <label className="dto-field"><span className="field-label">Notes <span className="muted">(optional)</span></span><input className="input" value={o.notes} maxLength={1000} onChange={(e) => set("notes", e.target.value)} placeholder="Team, growth, on-call, commute" /></label>
        </div>
        <div className="row">
          <button type="submit" className="btn btn-primary">{isNew ? "Add offer" : "Save offer"}</button>
          {canCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}
