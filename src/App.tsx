import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { DOCS_BASE, STUDY_URL } from "./config";
import { useAuth } from "./lib/auth";
import { ExternalLink, Link, matchPath, useLocation } from "./lib/router";
import { HelpBot } from "./components/HelpBot";
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
const TodayPage = lazy(() => import("./pages/Today"));
const StoriesPage = lazy(() => import("./pages/Stories"));
const VoiceMockPage = lazy(() => import("./pages/VoiceMock"));
const PricingPage = lazy(() => import("./pages/Pricing"));
const TailorPage = lazy(() => import("./pages/Tailor"));
const DebriefPage = lazy(() => import("./pages/Debrief"));
const OffersPage = lazy(() => import("./pages/Offers"));

type StageKey = "understand" | "prepare" | "prove" | "decide";

interface Route {
  path: string;
  title: string;
  /** One line under the page title. Omit to let the screen render its own header. */
  subtitle?: string;
  /** Which of the four stages this screen belongs to — shows the stage rail. */
  stage?: StageKey;
  component: ComponentType<Record<string, string>>;
}

const ROUTES: Route[] = [
  { path: "/", title: "OfferReady", component: HomePage },
  { path: "/today", title: "Today", component: TodayPage },
  { path: "/analyze", title: "Analyze a job", stage: "understand", subtitle: "Paste a job description to see what the role requires, where you may fall short, and a preparation plan.", component: AnalyzePage },
  { path: "/jobs", title: "My jobs", subtitle: "Every role you’re preparing for, with its progress and the next step.", component: MyJobsPage },
  { path: "/jobs/:id", title: "Job", component: JobDetailPage },
  { path: "/fit", title: "Check my fit", stage: "understand", subtitle: "Compare your resume with a saved job. Your resume is read in your browser and never stored.", component: CheckFitPage },
  { path: "/tailor", title: "Tailor your resume", stage: "understand", subtitle: "Rewrite your resume bullets for one job’s skills and gaps, without inventing anything. Your resume is never stored.", component: TailorPage },
  { path: "/questions", title: "Practice questions", stage: "prepare", subtitle: "Interview questions written for this job and the gaps in your analysis, saved to the job.", component: QuestionsPage },
  { path: "/defend", title: "Defend your decisions", stage: "prepare", subtitle: "Make the call, then hold it while the interviewer pushes on trade-offs, constraints and incidents.", component: DefendPage },
  { path: "/stories", title: "Story bank", stage: "prepare", subtitle: "Your STAR stories, mapped to what each job asks for.", component: StoriesPage },
  { path: "/practice", title: "Interview practice", stage: "prepare", subtitle: "Drill the question bank with self-rated practice, flashcards, a timed exam, or your weakest topics.", component: PracticePage },
  { path: "/simulator", title: "Mock interview", stage: "prove", subtitle: "A mixed loop across areas and levels. Answer out loud, compare with a strong answer, then face the follow-up.", component: SimulatorPage },
  { path: "/interview/voice", title: "Voice mock interview", stage: "prove", subtitle: "Answer out loud. The interviewer follows up on what you actually said.", component: VoiceMockPage },
  { path: "/dashboard", title: "Interview readiness", stage: "prove", subtitle: "One blended score per job, built from your resume match, practice and preparation.", component: DashboardPage },
  { path: "/debrief", title: "Interview debrief", stage: "decide", subtitle: "Log each round while it’s fresh. Questions that went badly come back in your plan, and the next round date moves it forward.", component: DebriefPage },
  { path: "/offers", title: "Compare offers", stage: "decide", subtitle: "Put your offers side by side on year-1 and annualised pay, then plan the negotiation.", component: OffersPage },
  { path: "/account", title: "Account", component: AccountPage },
  { path: "/pricing", title: "Pricing", component: PricingPage },
  { path: "/example", title: "Sample walkthrough", subtitle: "A worked example on sample data: how one job becomes a focused preparation plan.", component: ExamplePage },
];

/** The four stages and their steps: the rail and the menu both read this. */
const STAGES: { key: StageKey; n: number; label: string; hint: string; steps: { to: string; label: string; short?: string }[] }[] = [
  { key: "understand", n: 1, label: "Understand", hint: "What the role needs", steps: [
    { to: "/analyze", label: "Analyze" },
    { to: "/fit", label: "Check fit" },
    { to: "/tailor", label: "Tailor resume", short: "Tailor" },
  ] },
  { key: "prepare", n: 2, label: "Prepare", hint: "Close the gaps", steps: [
    { to: "/questions", label: "Questions" },
    { to: "/defend", label: "Defend" },
    { to: "/stories", label: "Story bank", short: "Stories" },
    { to: "/practice", label: "Practice" },
  ] },
  { key: "prove", n: 3, label: "Prove", hint: "Show it under pressure", steps: [
    { to: "/simulator", label: "Mock interview", short: "Mock" },
    { to: "/interview/voice", label: "Voice mock", short: "Voice" },
    { to: "/dashboard", label: "Readiness" },
  ] },
  { key: "decide", n: 4, label: "Decide", hint: "After the interview", steps: [
    { to: "/debrief", label: "Debrief" },
    { to: "/offers", label: "Offers" },
  ] },
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

/** The signature element: the four stages, with the current one's steps. */
function StageRail({ stage, pathname }: { stage: StageKey; pathname: string }) {
  const cur = STAGES.findIndex((s) => s.key === stage);
  return (
    <nav className="rail srail" aria-label="Preparation stages">
      <ol className="srail-inner">
        {STAGES.map((s, i) => {
          const state = i < cur ? "past" : i === cur ? "current" : "next";
          return (
            <li key={s.key} className={"srail-stage srail-" + state}>
              <Link className="srail-head" to={s.steps[0].to} aria-current={state === "current" ? "step" : undefined}>
                <span className="srail-num" aria-hidden="true">{s.n}</span>
                <span className="srail-text" title={s.hint}>
                  <span className="srail-label">{s.label}</span>
                </span>
              </Link>
              <ul className="srail-steps" aria-label={s.label + " steps"}>
                {s.steps.map((st) => {
                  const on = pathname === st.to || pathname.startsWith(st.to + "/");
                  return (
                    <li key={st.to}>
                      <Link to={st.to} className={"srail-step" + (on ? " on" : "")} aria-current={on ? "page" : undefined}>
                        <span className="srail-full">{st.label}</span>
                        <span className="srail-short" aria-hidden="true">{st.short || st.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
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
  const currentStage = match?.route.stage;

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/" aria-label="OfferReady home"><Logo /> <span>Offer<b>Ready</b></span></Link>
          <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? "Close" : "Menu"}
          </button>
          <nav id="main-nav" className={"nav snav" + (menuOpen ? " open" : "")} aria-label="Main">
            <div className="snav-primary">
              <Link to="/today" className={"nav-link snav-today" + (isActive("/today") ? " active" : "")} aria-current={isActive("/today") ? "page" : undefined}>
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="10" cy="12.5" r="1.6" fill="currentColor" /></svg>
                Today
              </Link>
              <Link to="/jobs" className={"nav-link" + (isActive("/jobs") ? " active" : "")} aria-current={isActive("/jobs") ? "page" : undefined}>My jobs</Link>
            </div>
            <div className="snav-stages">
              {STAGES.map((st) => {
                const on = currentStage === st.key;
                return (
                  <div key={st.key} className={"nav-group snav-group" + (on ? " on" : "")} role="group" aria-label={st.label}>
                    <Link to={st.steps[0].to} className={"nav-link snav-stage" + (on ? " active" : "")}>
                      <span className="snav-num" aria-hidden="true">{st.n}</span>{st.label}
                    </Link>
                    <div className="snav-subs">
                      {st.steps.map((n) => (
                        <Link key={n.to} to={n.to} className={"nav-link snav-sub" + (isActive(n.to) ? " active" : "")} aria-current={isActive(n.to) ? "page" : undefined}>
                          {n.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
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

      {match?.route.stage ? <StageRail stage={match.route.stage} pathname={pathname} /> : null}

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

      <HelpBot />

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">Offer<b>Ready</b></span>
            <p>Interview preparation built around the one job you{"’"}re trying to land.</p>
          </div>
          <div className="footer-col">
            <h2>Product</h2>
            <Link to="/today">Today</Link>
            <Link to="/analyze">Analyze a job</Link>
            <Link to="/jobs">My jobs</Link>
            <Link to="/tailor">Tailor your resume</Link>
            <Link to="/stories">Story bank</Link>
            <Link to="/interview/voice">Voice mock interview</Link>
            <Link to="/dashboard">Interview readiness</Link>
            <Link to="/debrief">Interview debrief</Link>
            <Link to="/offers">Compare offers</Link>
            <Link to="/pricing">Pricing</Link>
          </div>
          <div className="footer-col">
            <h2>Learn</h2>
            <ExternalLink href={STUDY_URL}>Study notes</ExternalLink>
            <Link to="/example">Sample walkthrough</Link>
            <Link to="/practice">Question bank</Link>
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
