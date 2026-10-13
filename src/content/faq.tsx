/* One list of questions and answers, used in three places:
 *  - home page: the few that settle doubts before signing up (HOME_FAQ)
 *  - /faq: every question (FAQ)
 *  - help assistant: practical in-app answers first (BOT_FAQ)
 * Edit an answer here and it changes everywhere. */
import type { ReactNode } from "react";
import { docsUrl } from "../config";
import { LIMITS } from "../lib/plans";
import { ExternalLink, Link } from "../lib/router";

export const STUDY_TOPICS = ["GenAI foundations", "Agents", "RAG", "Data platforms", "System design", "Interview guides"];

const fmt = (n: number | null) => (n == null ? "unlimited" : String(n));

export interface QA { id: string; q: string; a: ReactNode }

const ALL: QA[] = [
  { id: "who", q: "Who is OfferReady for?",
    a: <>Engineers preparing for a specific technical interview: AI/ML engineering, data and platform engineering, solutions and forward-deployed engineering, and architect roles, especially at senior, staff and principal level, where interviewers probe trade-offs and judgment rather than trivia.</> },
  { id: "free", q: "Is OfferReady free?",
    a: <>Yes. The free plan covers the full prep loop for one job, with no card needed: {fmt(LIMITS.free.saved_jobs)} saved job, {fmt(LIMITS.free.analyses)} job analyses a month, the day-by-day plan to your interview date and {fmt(LIMITS.free.voice_mock)} voice mock interview a month, plus the study library and question banks. When an interview is booked, a one-time pass raises the limits. <Link to="/pricing">See pricing</Link>.</> },
  { id: "live", q: "Does OfferReady help during a live interview?",
    a: <>No, and that{"’"}s on purpose. OfferReady is practice-only: there is no live mode, overlay or answer feed, and nothing listens to your real interview. It prepares you before and helps you debrief after. During the interview you can type the questions into <Link to="/notes">Interview notes</Link>, a plain notepad with no AI and no microphone.</> },
  { id: "chatgpt", q: "How is this different from ChatGPT, Claude or Gemini?",
    a: <>General assistants are great at answering the questions you think to ask. OfferReady is organised around one job and one date: it keeps your gaps, practice, stories and debriefs, runs an interview loop with follow-ups on what you said, and forecasts when you{"’"}ll be ready. You can still use your favourite assistant alongside it.</> },
  { id: "coach", q: "Is OfferReady an AI interview assistant?",
    a: <>Yes, for practice. The <Link to="/coach">AI Interview Coach</Link> answers any interview question with an outline built from your resume and stories, labels where each point came from, and flags numbers you never gave it. It doesn{"’"}t run during the real interview: you go in able to give the answer yourself.</> },
  { id: "data", q: "What happens to my resume and data?",
    a: <>Your resume is read in your browser and saved on your device; it{"’"}s stored on your account only if you turn on resume sync. Jobs, plans, practice and stories sync to your account so you can pick up on any device. Details in <ExternalLink href={docsUrl("Security/index.html")}>Security and your data</ExternalLink>.</> },
  { id: "voice", q: "Does the voice interview work in my browser?",
    a: <>It works best in Chrome or Edge on a computer. Allow the microphone when asked. If it doesn{"’"}t hear you, tick {"“"}Type my answers instead of speaking{"”"}; every other practice tool works in any browser.</> },
  { id: "ready", q: "How is readiness worked out?",
    a: <>From your resume match, your practice for that job and your plan progress. The ready date uses your pace over the last 14 days, checked against your interview date. <Link to="/dashboard">See readiness</Link>.</> },
  { id: "roles", q: "Which roles and levels does it cover?",
    a: <>Technical roles in AI/ML, data and platform engineering, solutions and forward-deployed engineering, and architecture. Questions, scenarios and scoring take the level into account, from senior through staff and principal.</> },
  { id: "rounds", q: "Which interview rounds can I practise?",
    a: <>Behavioral (STAR stories, said out loud), system design (a voice round with a whiteboard), trade-off rounds where the interviewer keeps asking why, technical deep dives written from the job, phone and recruiter screens, and concept reps for SQL, Python and cloud. There is no live coding environment yet; coding concepts are covered in the question bank.</> },
  { id: "safe", q: "Is my data safe?",
    a: <>Your resume stays on your device unless you turn on sync, payments go through Stripe, there are no ads or third-party trackers, and you can download or delete your data any time. <ExternalLink href={docsUrl("Security/index.html")}>Security and your data</ExternalLink> lists exactly what we do.</> },
  { id: "refund", q: "Can I cancel or get a refund?",
    a: <>Passes are one-time payments, so there{"’"}s no subscription to cancel. Refunds are covered in <ExternalLink href={docsUrl("Terms/index.html#7-refunds")}>the terms</ExternalLink>.</> },
  { id: "delete", q: "How do I delete my data?",
    a: <>Account → Your data → Delete my data. You can download a copy first.</> },
];

const pick = (ids: string[]) => ids.map((id) => ALL.find((x) => x.id === id)).filter((x): x is QA => !!x);

/** /faq: everything, in reading order. */
export const FAQ: QA[] = ALL;
/** Home: the doubts people have just before signing up. */
export const HOME_FAQ: QA[] = pick(["free", "live", "chatgpt", "data", "voice"]);
/** Help assistant: practical answers for someone already using the app. */
export const BOT_FAQ: QA[] = pick(["free", "live", "coach", "data", "ready", "voice", "refund", "delete"]);
