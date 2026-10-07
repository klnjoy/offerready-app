import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { DOCS_BASE, PRICING_URL, STUDY_URL } from "./config";
import { useAuth } from "./lib/auth";
import { ExternalLink, Link, matchPath, useLocation } from "./lib/router";
import { Loading } from "./components/ui";
import HomePage from "./pages/Home";

// Code-split each screen so the first load stays small (and the resume
// parsers only load on Check My Fit).
const AnalyzePage = lazy(() => import("./pages/Analyze"));
const MyJobsPage = lazy(() => import("./pages/MyJobs"));
const JobDetailPage = lazy(() => import("./pages/JobDetail"));
const CheckFitPage = lazy(() => import("./pages/CheckFit"));
const QuestionsPage = lazy(() => import("./pages/Questions"));
const DefendPage = lazy(() => import("./pages/Defend"));
const PracticePage = lazy(() => import("./pages/Practice"));
const SimulatorPage = lazy(() => import("./pages/Simulator"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const AccountPage = lazy(() => import("./pages/Account"));
const ExamplePage = lazy(() => import("./pages/Example"));

interface Route {
  path: string;
  title: string;
  /** One line under the page title. Omit to let the screen render its own header. */
  subtitle?: string;
  /** Position in the job pipeline (1–5) — shows the pipeline rail. */
  stage?: number;
  component: ComponentType<Record<string, string>>;
}

const ROUTES: Route[] = [
  { path: "/", title: "OfferReady", component: HomePage },
  { path: "/analyze", title: "Analyze a job", stage: 1, subtitle: "Paste a job description to see what the role requires, where you may fall short, and a preparation plan.", component: AnalyzePage },
  { path: "/jobs", title: "My jobs", subtitle: "Every role you’re preparing for, with its progress and the next step.", component: MyJobsPage },
  { path: "/jobs/:id", title: "Job", component: JobDetailPage },
  { path: "/fit", title: "Check my fit", stage: 2, subtitle: "Compare your resume with a saved job. Your resume is read in your browser and never stored.", component: CheckFitPage },
  { path: "/questions", title: "Practice questions", stage: 3, subtitle: "Interview questions written for this job and the gaps in your analysis, saved to the job.", component: QuestionsPage },
  { path: "/defend", title: "Defend your decisions", stage: 4, subtitle: "Make the call, then hold it while the interviewer pushes on trade-offs, constraints and incidents.", component: DefendPage },
  { path: "/dashboard", title: "Interview readiness", stage: 5, subtitle: "One blended score per job, built from your resume match, practice and preparation.", component: DashboardPage },
  { path: "/practice", title: "Interview practice", subtitle: "Drill the question bank with self-rated practice, flashcards, a timed exam, or your weakest topics.", component: PracticePage },
  { path: "/simulator", title: "Mock interview", subtitle: "A mixed loop across areas and levels. Answer out loud, compare with a strong answer, then face the follow-up.", component: SimulatorPage },
  { path: "/account", title: "Account", component: AccountPage },
  { path: "/example", title: "Sample walkthrough", subtitle: "A worked example on sample data: how one job becomes a focused preparation plan.", component: ExamplePage },
];

const PIPELINE = [
  { stage: 1, to: "/analyze", label: "Analyze" },
  { stage: 2, to: "/fit", label: "Check fit" },
  { stage: 3, to: "/questions", label: "Questions" },
  { stage: 4, to: "/defend", label: "Defend" },
  { stage: 5, to: "/dashboard", label: "Readiness" },
];

const NAV_GROUPS = [
  { label: "Prepare", items: [
    { to: "/jobs", label: "My jobs" },
    { to: "/analyze", label: "Analyze" },
    { to: "/fit", label: "Check fit" },
    { to: "/questions", label: "Questions" },
    { to: "/defend", label: "Defend" },
  ] },
  { label: "Practice", items: [
    { to: "/practice", label: "Practice" },
    { to: "/simulator", label: "Mock interview" },
  ] },
  { label: "Track", items: [{ to: "/dashboard", label: "Readiness" }] },
];

function Logo() {
  return (
    <svg viewBox="0 0 40 40" width="26" height="26" aria-hidden="true">
      <path d="M33 11 A15 15 0 1 0 35 21" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M13 33 L19 20 L25 11" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 11 L31 5 M31 5 L24 6 M31 5 L30 12" fill="none" stroke="#22c07a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The signature element: where this screen sits in the job pipeline. */
function PipelineRail({ stage }: { stage: number }) {
  return (
    <nav className="rail" aria-label="Job pipeline">
      <ol className="rail-inner">
        {PIPELINE.map((p) => {
          const state = p.stage < stage ? "past" : p.stage === stage ? "current" : "next";
          return (
            <li key={p.stage} className={"rail-step rail-" + state}>
              <Link to={p.to} aria-current={state === "current" ? "step" : undefined}>
                <span className="rail-num">{p.stage}</span>
                <span className="rail-label">{p.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  let match: { route: Route; params: Record<string, string> } | null = null;
  for (const route of ROUTES) {
    const params = matchPath(route.path, pathname);
    if (params) { match = { route, params }; break; }
  }

  useEffect(() => {
    document.title = match && match.route.path !== "/" ? match.route.title + " | OfferReady" : "OfferReady — interview readiness for your job";
    setMenuOpen(false);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");
  const Page = match?.route.component;
  const initial = (auth.email || "").trim().charAt(0).toUpperCase();

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/" aria-label="OfferReady home"><Logo /> <span>Offer<b>Ready</b></span></Link>
          <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? "Close" : "Menu"}
          </button>
          <nav id="main-nav" className={"nav" + (menuOpen ? " open" : "")} aria-label="Main">
            {NAV_GROUPS.map((g) => (
              <div key={g.label} className="nav-group" role="group" aria-label={g.label}>
                <span className="nav-group-label">{g.label}</span>
                {g.items.map((n) => (
                  <Link key={n.to} to={n.to} className={"nav-link" + (isActive(n.to) ? " active" : "")} aria-current={isActive(n.to) ? "page" : undefined}>
                    {n.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <Link className={"account-link" + (isActive("/account") ? " active" : "")} to="/account" title={auth.email || "Sign in"}>
            {auth.session ? (
              <><span className="avatar" aria-hidden="true">{initial || "•"}</span><span className="account-text">Account</span></>
            ) : (
              "Sign in"
            )}
          </Link>
        </div>
      </header>

      {match?.route.stage ? <PipelineRail stage={match.route.stage} /> : null}

      <main id="main" className={"main" + (pathname === "/" ? " main-home" : "")}>
        {match?.route.subtitle ? (
          <header className="page-head">
            <h1>{match.route.title}</h1>
            <p>{match.route.subtitle}</p>
          </header>
        ) : null}
        <Suspense fallback={<div className="page"><Loading /></div>}>
          {Page ? <Page {...match!.params} /> : <NotFound />}
        </Suspense>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">Offer<b>Ready</b></span>
            <p>Interview preparation built around the one job you{"’"}re trying to land.</p>
          </div>
          <div className="footer-col">
            <h2>Product</h2>
            <Link to="/analyze">Analyze a job</Link>
            <Link to="/jobs">My jobs</Link>
            <Link to="/defend">Defend your decisions</Link>
            <Link to="/dashboard">Interview readiness</Link>
          </div>
          <div className="footer-col">
            <h2>Learn</h2>
            <ExternalLink href={STUDY_URL}>Study notes</ExternalLink>
            <Link to="/example">Sample walkthrough</Link>
            <Link to="/practice">Question bank</Link>
            <ExternalLink href={PRICING_URL}>Pricing</ExternalLink>
          </div>
          <div className="footer-col">
            <h2>Company</h2>
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
