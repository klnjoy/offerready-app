import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from "react";
import { DOCS_BASE, STUDY_URL } from "./config";
import { useAuth } from "./lib/auth";
import { getActiveJob } from "./lib/readiness";
import { ExternalLink, Link, matchPath, useLocation } from "./lib/router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { HelpBot } from "./components/HelpBot";
import { LandOnJob } from "./components/LandOnJob";
import { GetAppChip } from "./components/GetAppChip";
import { UsageAlert } from "./components/UsageAlert";
import { MarketingHeader } from "./components/MarketingHeader";
import { PracticeTabs } from "./components/PracticeTabs";
import { JobMenu, JobPager, JobTrail, JobTree, PageToc, useJobNav } from "./components/JobNav";
import { useJobs } from "./lib/useJobs";
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
const CopilotPage = lazy(() => import("./pages/Copilot"));
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
const AskedQuestionsPage = lazy(() => import("./pages/AskedQuestions"));
const TodayRedirect = lazy(() => import("./pages/Redirects").then((m) => ({ default: m.TodayRedirect })));
const FitRedirect = lazy(() => import("./pages/Redirects").then((m) => ({ default: m.FitRedirect })));
const InterviewNotesPage = lazy(() => import("./pages/InterviewNotes"));
const DemoPage = lazy(() => import("./pages/Demo"));
const TryPage = lazy(() => import("./pages/Try"));
const FaqPage = lazy(() => import("./pages/Faq"));
const SampleReportPage = lazy(() => import("./pages/SampleReport"));
const GetAppPage = lazy(() => import("./pages/GetApp"));
const StudioRedirect = lazy(() => import("./pages/Redirects").then((m) => ({ default: m.StudioRedirect })));

/** The four top-nav sections (plus the account menu = five items). */
type Section = "jobs" | "practice" | "copilot" | "mock" | "readiness";

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

/** Pages that spend AI allowance: only these show the usage warning. */
const AI_PAGES = ["/analyze", "/tailor", "/coach", "/questions", "/defend", "/stories", "/practice/bank", "/mock", "/interview/voice", "/simulator", "/account"];

const BACK_PRACTICE = { to: "/practice", label: "Practice" };
const BACK_MOCK = { to: "/mock", label: "Mock interview" };

const ROUTES: Route[] = [
  { path: "/", title: "OfferReady", component: HomePage },
  { path: "/jobs", title: "Jobs", section: "jobs", subtitle: "Every job you’re preparing for. Open one to see your plan, your resume match and what to do next.", component: MyJobsPage },
  { path: "/jobs/:id", title: "Job", section: "jobs", component: JobDetailPage },
  { path: "/analyze", title: "Add a job", section: "jobs", subtitle: "Paste a job link or description. You get what the role needs, how your resume matches, and a day-by-day plan to your interview.", component: AnalyzePage },
  { path: "/today", title: "Your plan", section: "jobs", component: TodayRedirect },
  { path: "/fit", title: "Resume match", section: "jobs", component: FitRedirect },
  { path: "/copilot", title: "AI Interview Coach", section: "copilot", component: StudioRedirect },
  { path: "/tailor", title: "Tailor your resume", section: "jobs", back: { to: "@job:resume", label: "Your job" }, subtitle: "Rewrite your resume bullets for one job’s skills and gaps, without inventing anything.", component: TailorPage },
  { path: "/notes", title: "Interview notes", section: "jobs", back: { to: "@job:after", label: "Your job" }, subtitle: "Type each question as it’s asked. Afterwards, turn your notes into a debrief in one click.", component: InterviewNotesPage },
  { path: "/debrief", title: "Interview debrief", section: "jobs", back: { to: "@job:after", label: "Your job" }, subtitle: "Write down each round while it’s fresh. Questions that went badly come back in your plan.", component: DebriefPage },
  { path: "/asked", title: "Questions you were asked", section: "jobs", subtitle: "Every question from your real interviews, kept for next time. See what comes up again, and practise the ones that went badly.", component: AskedQuestionsPage },
  { path: "/offers", title: "Compare offers", section: "jobs", back: { to: "@job:after", label: "Your job" }, subtitle: "Put your offers side by side on year-1 and yearly pay, then plan how to negotiate.", component: OffersPage },
  { path: "/coach", title: "AI Interview Coach", section: "copilot", subtitle: "Ask any interview question. Get an answer built from your resume and stories, for the job you’re preparing for. For practice, never during a live interview.", component: CopilotPage },
  { path: "/studio", title: "AI Interview Coach", section: "copilot", component: StudioRedirect },
  { path: "/practice", title: "Practice", section: "practice", subtitle: "Four ways to practise. Pick what fits; you don’t need all four. Start with the first if you’re not sure.", component: PracticeHubPage },
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
  { path: "/demo", title: "OfferReady in one minute", subtitle: "Every feature in nine short chapters, with where to find each one. Sample data.", component: DemoPage },
  { path: "/try", title: "Try a sample question", subtitle: "See the answer the AI Interview Coach builds, from a sample resume. No account needed.", component: TryPage },
  { path: "/faq", title: "Questions and study notes", subtitle: "Quick answers about OfferReady, and the free study library behind the questions.", component: FaqPage },
  { path: "/sample-report", title: "Sample mock interview report", subtitle: "What you get after a voice mock interview. Sample data, no account needed.", component: SampleReportPage },
  { path: "/app", title: "Get the app", subtitle: "Install OfferReady on your computer, Android phone or iPhone. Free, no app store needed.", component: GetAppPage },
  { path: "/example", title: "Sample walkthrough", subtitle: "A worked example on sample data: how one job becomes a focused preparation plan.", component: ExamplePage },
];

const NAV: { key: Section; to: string; label: string }[] = [
  { key: "jobs", to: "/jobs", label: "Jobs" },
  { key: "practice", to: "/practice", label: "Practice" },
  { key: "copilot", to: "/coach", label: "AI Coach" },
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
          <Link role="menuitem" className="acct-item" to="/app">Get the app</Link>
          <button type="button" role="menuitem" className="acct-item" onClick={() => { setOpen(false); openFeedback(); }}>Send feedback</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const signedIn = !!useAuth().session;
  const { pathname, search, hash } = useLocation();
  const jobs = useJobs();
  const jobNav = useJobNav(jobs);
  const nav = jobNav?.scoped ? jobNav : null;
  // Phones: with a job, the top bar's Menu opens the job folders (one menu,
  // not two). Without one, it shows the plain list of sections.
  const [jobMenu, setJobMenu] = useState(false);
  useEffect(() => setJobMenu(false), [pathname, search]);
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

  // In-page links (/demo#coach, /account#usage): scroll to the section once
  // the (lazy) page has rendered it.
  useEffect(() => {
    if (!hash || hash.length < 2) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); window.clearInterval(t); }
      else if (++tries > 40) window.clearInterval(t);
    }, 75);
    return () => window.clearInterval(t);
  }, [pathname, hash]);

  const Page = match?.route.component;
  const section = match?.route.section;
  // Top-level sections (Practice, AI Coach, Mock interview, Readiness) have no
  // parent page, but in the installed app there's no browser back button, so
  // they get a way back to the job you're working on.
  const TOP = ["practice", "copilot", "mock", "readiness"];
  const back = match?.route.back || (match && match.route.section && TOP.includes(match.route.section)
    ? { to: "@job", label: getActiveJob() ? "Your job" : "All jobs" }
    : undefined);

  const body = (
    <>
        {match?.route.subtitle ? (
          <header className="page-head">
            {back && !nav ? <Link className="back-link" to={resolveBack(back.to, search)}>{"←"} {back.label}</Link> : null}
            <h1>{match.route.title}</h1>
            <p>{match.route.subtitle}</p>
          </header>
        ) : null}
        {AI_PAGES.some((x) => pathname === x || pathname.startsWith(x + "/")) ? <UsageAlert /> : null}
        {match && (match.route.back === BACK_PRACTICE || match.route.path === "/mock") ? <PracticeTabs /> : null}
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<div className="page"><Loading /></div>}>
            {Page ? <Page {...match!.params} /> : <NotFound />}
          </Suspense>
        </ErrorBoundary>
    </>
  );

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      {pathname === "/" || pathname === "/account" ? <LandOnJob /> : null}
      {pathname === "/" ? <MarketingHeader /> : (
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
            <GetAppChip pathname={pathname} className="getapp-dark" />
            <Link className="btn add-job-btn" to="/analyze" aria-label="Add a job">
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              <span className="add-job-long">Add a job</span><span className="add-job-short" aria-hidden="true">Add</span>
            </Link>
            <SyncIndicator />
            <AccountMenu pathname={pathname} />
            {jobNav ? (
              <button type="button" className="menu-btn" aria-expanded={jobMenu} aria-controls="jn-drawer" onClick={() => setJobMenu(true)}>Menu</button>
            ) : (
              <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((o) => !o)}>
                {menuOpen ? "Close" : "Menu"}
              </button>
            )}
          </div>
        </div>
      </header>
      )}

      <main id="main" className={"main" + (pathname === "/" ? " main-home" : "") + (nav ? " main-jn" : "")}>
        {nav ? <JobTrail nav={nav} /> : null}
        {nav ? (
          <div className="jn-layout">
            <aside className="jn-side"><JobTree nav={nav} jobs={jobs} /></aside>
            <div className="jn-body">
              {body}
              <JobPager nav={nav} />
            </div>
            <aside className="jn-right"><PageToc /></aside>
          </div>
        ) : body}
      </main>

      {jobNav && jobMenu ? <JobMenu nav={jobNav} jobs={jobs} onClose={() => setJobMenu(false)} /> : null}
      <HelpBot />
      <FeedbackDialog />

      <footer className="footer">
        <div className="footer-top">
          <Link className="footer-logo" to="/" aria-label="OfferReady home"><Logo /> <span>Offer<b>Ready</b></span></Link>
          {signedIn ? <Link className="btn footer-cta" to="/jobs">Open my jobs</Link> : <Link className="btn footer-cta" to="/analyze">Start free</Link>}
        </div>
        <div className="footer-inner">
          <div className="footer-col">
            <h2>Company</h2>
            <ExternalLink href={DOCS_BASE + "About/index.html"}>About</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Contact/index.html"}>Contact us</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Changelog/index.html"}>Changelog</ExternalLink>
            <button type="button" className="footer-btn" onClick={openFeedback}>Send feedback</button>
          </div>
          <div className="footer-col">
            <h2>Product</h2>
            <Link to="/example">How it works</Link>
            <Link to="/sample-report">Sample report</Link>
            <Link to="/pricing">Pricing</Link>
            <ExternalLink href={DOCS_BASE + "Compare/index.html"}>Compare</ExternalLink>
            <Link to="/analyze">Add a job</Link>
          </div>
          <div className="footer-col">
            <h2>Features</h2>
            <Link to="/coach">AI Interview Coach</Link>
            <Link to="/practice">Practice</Link>
            <Link to="/mock">Mock interview</Link>
            <Link to="/notes">Interview notes</Link>
            <Link to="/debrief">Interview debrief</Link>
            <Link to="/dashboard">Readiness</Link>
          </div>
          <div className="footer-col">
            <h2>For your role</h2>
            <ExternalLink href={DOCS_BASE + "For/ai-engineers/index.html"}>AI / GenAI Engineers</ExternalLink>
            <ExternalLink href={DOCS_BASE + "For/forward-deployed-engineers/index.html"}>Forward Deployed Engineers</ExternalLink>
            <ExternalLink href={DOCS_BASE + "For/data-engineers/index.html"}>Data Engineers</ExternalLink>
            <ExternalLink href={DOCS_BASE + "For/platform-engineers/index.html"}>Platform Engineers</ExternalLink>
            <ExternalLink href={DOCS_BASE + "For/staff-engineers/index.html"}>Staff / Principal</ExternalLink>
            <ExternalLink href={DOCS_BASE + "For/architects/index.html"}>Architects</ExternalLink>
          </div>
          <div className="footer-col">
            <h2>Resources</h2>
            <ExternalLink href={DOCS_BASE + "Help/index.html"}>Help Center</ExternalLink>
            <Link to="/faq">FAQ</Link>
            <Link to="/app">Get the app</Link>
            <ExternalLink href={STUDY_URL}>Study library</ExternalLink>
            <Link to="/practice/bank">Question bank</Link>
            <ExternalLink href={DOCS_BASE + "Personal-SourceCode/Interview_Guide_Overview.html"}>Interview guide</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Security/index.html"}>Security</ExternalLink>
          </div>
        </div>
        <div className="footer-base">
          <span>{"©"} {new Date().getFullYear()} OfferReady</span>
          <nav className="footer-legal" aria-label="Legal">
            <ExternalLink href={DOCS_BASE + "Privacy/index.html"}>Privacy</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Terms/index.html"}>Terms</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Terms/index.html#7-refunds"}>Refunds</ExternalLink>
            <ExternalLink href={DOCS_BASE + "Disclaimer/index.html"}>Disclaimer</ExternalLink>
          </nav>
          <span className="footer-note">Practice only, never during a live interview. Preparation guidance, not a prediction of interview or offer outcomes.</span>
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
