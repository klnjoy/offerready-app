import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from "react";
import { DOCS_BASE, STUDY_URL } from "./config";
import { useAuth } from "./lib/auth";
import { getActiveJob } from "./lib/readiness";
import { ExternalLink, Link, matchPath, useLocation } from "./lib/router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { HelpBot } from "./components/HelpBot";
import { FeedbackDialog, openFeedback } from "./components/Feedback";
import { track } from "./lib/track";
import { SyncIndicator } from "./components/SyncStatus";
import { Loading } from "./components/ui";
import HomePage from "./pages/Home";

// Code-split each screen so the first load stays small (and the resume
// parsers only load where a resume is added).
const AnalyzePage = lazy(() => import("./pages/Analyze"));
const MyJobsPage = lazy(() => import("./pages/MyJobs"));
const JobDetailPage = lazy(() => import("./pages/JobDetail"));
const QuestionsPage = lazy(() => import("./pages/Questions"));
const DefendPage = lazy(() => import("./pages/Defend"));
const PracticeHubPage = lazy(() => import("./pages/PracticeHub"));
const PracticePage = lazy(() => import("./pages/Practice"));
const MockHubPage = lazy(() => import("./pages/MockHub"));
const SimulatorPage = lazy(() => import("./pages/Simulator"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const AccountPage = lazy(() => import("./pages/Account"));
const ExamplePage = lazy(() => import("./pages/Example"));
const StoriesPage = lazy(() => import("./pages/Stories"));
const VoiceMockPage = lazy(() => import("./pages/VoiceMock"));
const PricingPage = lazy(() => import("./pages/Pricing"));
const TailorPage = lazy(() => import("./pages/Tailor"));
const DebriefPage = lazy(() => import("./pages/Debrief"));
const OffersPage = lazy(() => import("./pages/Offers"));
const TodayRedirect = lazy(() => import("./pages/Redirects").then((m) => ({ default: m.TodayRedirect })));
const FitRedirect = lazy(() => import("./pages/Redirects").then((m) => ({ default: m.FitRedirect })));

/** The four top-nav sections (plus the account menu = five items). */
type Section = "jobs" | "practice" | "mock" | "readiness";

interface Route {
  path: string;
  title: string;
  /** One plain line under the page title: what you get here. Omit to let the screen render its own header. */
  subtitle?: string;
  /** Which top-nav item is highlighted. */
  section?: Section;
  /** Small "← label" link above the title. "@job" / "@job:tab" = the active job's page. */
  back?: { to: string; label: string };
  component: ComponentType<Record<string, string>>;
}

const BACK_PRACTICE = { to: "/practice", label: "Practice" };
const BACK_MOCK = { to: "/mock", label: "Mock interview" };

const ROUTES: Route[] = [
  { path: "/", title: "OfferReady", component: HomePage },
  { path: "/jobs", title: "Jobs", section: "jobs", subtitle: "Every job you’re preparing for. Open one to see your plan, your resume match and what to do next.", component: MyJobsPage },
  { path: "/jobs/:id", title: "Job", section: "jobs", component: JobDetailPage },
  { path: "/analyze", title: "Add a job", section: "jobs", subtitle: "Paste a job link or description. You get what the role needs, how your resume matches, and a day-by-day plan to your interview.", component: AnalyzePage },
  { path: "/today", title: "Your plan", section: "jobs", component: TodayRedirect },
  { path: "/fit", title: "Resume match", section: "jobs", component: FitRedirect },
  { path: "/tailor", title: "Tailor your resume", section: "jobs", back: { to: "@job:resume", label: "Your job" }, subtitle: "Rewrite your resume bullets for one job’s skills and gaps, without inventing anything.", component: TailorPage },
  { path: "/debrief", title: "Interview debrief", section: "jobs", back: { to: "@job:after", label: "Your job" }, subtitle: "Write down each round while it’s fresh. Questions that went badly come back in your plan.", component: DebriefPage },
  { path: "/offers", title: "Compare offers", section: "jobs", back: { to: "@job:after", label: "Your job" }, subtitle: "Put your offers side by side on year-1 and yearly pay, then plan how to negotiate.", component: OffersPage },
  { path: "/practice", title: "Practice", section: "practice", subtitle: "Four ways to practise. Each one says when to use it; start with the first if you’re not sure.", component: PracticeHubPage },
  { path: "/practice/bank", title: "Question bank", section: "practice", back: BACK_PRACTICE, subtitle: "Quick reps on any topic: answer and rate yourself, flashcards, a timed exam, or your weakest topics.", component: PracticePage },
  { path: "/questions", title: "Questions for this job", section: "practice", back: BACK_PRACTICE, subtitle: "Likely interview questions written from the job and the gaps in your resume, saved to the job.", component: QuestionsPage },
  { path: "/defend", title: "Trade-off drills", section: "practice", back: BACK_PRACTICE, subtitle: "Make a design call, then hold it while the interviewer pushes back on trade-offs, limits and incidents.", component: DefendPage },
  { path: "/stories", title: "Your stories", section: "practice", back: BACK_PRACTICE, subtitle: "Your STAR stories for behavioral rounds, matched to what each job asks for.", component: StoriesPage },
  { path: "/mock", title: "Mock interview", section: "mock", subtitle: "Rehearse the real thing. Choose voice or text.", component: MockHubPage },
  { path: "/interview/voice", title: "Voice interview", section: "mock", back: BACK_MOCK, subtitle: "Answer out loud. The interviewer follows up on what you actually said, then scores your content and delivery.", component: VoiceMockPage },
  { path: "/simulator", title: "Text interview", section: "mock", back: BACK_MOCK, subtitle: "A mixed loop of questions. Answer, compare with a strong answer, then face the follow-up.", component: SimulatorPage },
  { path: "/dashboard", title: "Interview readiness", section: "readiness", subtitle: "One score per job, built from your resume match, practice and preparation.", component: DashboardPage },
  { path: "/account", title: "Account", component: AccountPage },
  { path: "/pricing", title: "Pricing", component: PricingPage },
  { path: "/example", title: "Sample walkthrough", subtitle: "A worked example on sample data: how one job becomes a focused preparation plan.", component: ExamplePage },
];

const NAV: { key: Section; to: string; label: string }[] = [
  { key: "jobs", to: "/jobs", label: "Jobs" },
  { key: "practice", to: "/practice", label: "Practice" },
  { key: "mock", to: "/mock", label: "Mock interview" },
  { key: "readiness", to: "/dashboard", label: "Readiness" },
];

function resolveBack(to: string, search: string): string {
  if (!to.startsWith("@job")) return to;
  // The page's own ?job= wins, else the active job.
  const id = new URLSearchParams(search).get("job") || getActiveJob();
  if (!id) return "/jobs";
  const tab = to.split(":")[1];
  return "/jobs/" + encodeURIComponent(id) + (tab ? "?tab=" + tab : "");
}

function Logo() {
  return (
    <svg viewBox="0 0 40 40" width="26" height="26" aria-hidden="true">
      <path d="M33 11 A15 15 0 1 0 35 21" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M13 33 L19 20 L25 11" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 11 L31 5 M31 5 L24 6 M31 5 L30 12" fill="none" stroke="#22c07a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Avatar → a small menu: Account & plan, Pricing. Signed out: "Sign in". */
function AccountMenu({ pathname }: { pathname: string }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!auth.session) {
    return <Link className={"account-link" + (pathname === "/account" ? " active" : "")} to="/account">Sign in</Link>;
  }
  const initial = (auth.email || "").trim().charAt(0).toUpperCase();
  return (
    <div className="acct" ref={ref}>
      <button type="button" className={"account-link acct-btn" + (open || pathname === "/account" ? " active" : "")} aria-haspopup="menu" aria-expanded={open} aria-controls="acct-menu"
        title={auth.email || "Account"} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">{initial || "•"}</span><span className="account-text">Account</span>
      </button>
      {open && (
        <div className="acct-menu" id="acct-menu" role="menu">
          {auth.email && <p className="acct-email">{auth.email}</p>}
          <Link role="menuitem" className="acct-item" to="/account">Account &amp; plan</Link>
          <Link role="menuitem" className="acct-item" to="/pricing">Pricing</Link>
          <button type="button" role="menuitem" className="acct-item" onClick={() => { setOpen(false); openFeedback(); }}>Send feedback</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { pathname, search } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  let match: { route: Route; params: Record<string, string> } | null = null;
  for (const route of ROUTES) {
    const params = matchPath(route.path, pathname);
    if (params) { match = { route, params }; break; }
  }

  useEffect(() => {
    document.title = match && match.route.path !== "/" ? match.route.title + " | OfferReady" : "OfferReady — interview readiness for your job";
    setMenuOpen(false);
    track("page_view");
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const Page = match?.route.component;
  const section = match?.route.section;
  const back = match?.route.back;

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/" aria-label="OfferReady home"><Logo /> <span>Offer<b>Ready</b></span></Link>
          <nav id="main-nav" className={"nav tnav" + (menuOpen ? " open" : "")} aria-label="Main">
            {NAV.map((n) => {
              const on = section === n.key;
              return (
                <Link key={n.key} to={n.to} className={"nav-link tnav-link" + (on ? " active" : "")} aria-current={on ? "page" : undefined}>{n.label}</Link>
              );
            })}
          </nav>
          <div className="topbar-actions">
            <Link className="btn add-job-btn" to="/analyze" aria-label="Add a job">
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              <span className="add-job-long">Add a job</span><span className="add-job-short" aria-hidden="true">Add</span>
            </Link>
            <SyncIndicator />
            <AccountMenu pathname={pathname} />
            <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((o) => !o)}>
              {menuOpen ? "Close" : "Menu"}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className={"main" + (pathname === "/" ? " main-home" : "")}>
        {match?.route.subtitle ? (
          <header className="page-head">
            {back ? <Link className="back-link" to={resolveBack(back.to, search)}>{"←"} {back.label}</Link> : null}
            <h1>{match.route.title}</h1>
            <p>{match.route.subtitle}</p>
          </header>
        ) : null}
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<div className="page"><Loading /></div>}>
            {Page ? <Page {...match!.params} /> : <NotFound />}
          </Suspense>
        </ErrorBoundary>
      </main>

      <HelpBot />
      <FeedbackDialog />

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">Offer<b>Ready</b></span>
            <p>Interview preparation built around the one job you{"’"}re trying to land.</p>
          </div>
          <div className="footer-col">
            <h2>Prepare</h2>
            <Link to="/analyze">Add a job</Link>
            <Link to="/jobs">Jobs</Link>
            <Link to="/practice">Practice</Link>
            <Link to="/mock">Mock interview</Link>
            <Link to="/dashboard">Readiness</Link>
          </div>
          <div className="footer-col">
            <h2>Practice</h2>
            <Link to="/questions">Questions for this job</Link>
            <Link to="/defend">Trade-off drills</Link>
            <Link to="/stories">Your stories</Link>
            <Link to="/practice/bank">Question bank</Link>
          </div>
          <div className="footer-col">
            <h2>More</h2>
            <Link to="/debrief">Interview debrief</Link>
            <Link to="/offers">Compare offers</Link>
            <Link to="/example">Sample walkthrough</Link>
            <ExternalLink href={STUDY_URL}>Study notes</ExternalLink>
            <Link to="/pricing">Pricing</Link>
          </div>
          <div className="footer-col">
            <h2>Company</h2>
            <button type="button" className="footer-btn" onClick={openFeedback}>Send feedback</button>
            <ExternalLink href={DOCS_BASE + "Contact/index.html"}>Contact</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Privacy/index.html"}>Privacy</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Terms/index.html"}>Terms</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Disclaimer/index.html"}>Disclaimer</ExternalLink>
          </div>
        </div>
        <div className="footer-base">
          <span>{"©"} {new Date().getFullYear()} OfferReady</span>
          <span>Preparation guidance only. Not a prediction of interview or offer outcomes.</span>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page empty-state">
      <h1>Page not found</h1>
      <p className="muted">That link doesn{"’"}t match a page in OfferReady.</p>
      <Link className="btn btn-primary" to="/">Go to the home page</Link>
    </div>
  );
}
