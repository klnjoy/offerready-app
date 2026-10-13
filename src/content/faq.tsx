/* Questions answered on the home page (first five) and on /faq (all). */
import type { ReactNode } from "react";
import { DOCS_BASE } from "../config";
import { LIMITS } from "../lib/plans";
import { ExternalLink, Link } from "../lib/router";


export const STUDY_TOPICS = ["GenAI foundations", "Agents", "RAG", "Data platforms", "System design", "Interview guides"];

const fmt = (n: number | null) => (n == null ? "unlimited" : String(n));

export const FAQ: { q: string; a: ReactNode }[] = [
  { q: "Who is OfferReady for?",
    a: <>Engineers preparing for a specific technical interview: AI/ML engineering, data and platform engineering, solutions and forward-deployed engineering, and architect roles, especially at senior, staff and principal level, where interviewers probe trade-offs and judgment rather than trivia.</> },
  { q: "Is it free?",
    a: <>Yes, there is a free plan. It includes the study library, question banks and practice mode, {fmt(LIMITS.free.saved_jobs)} saved job, {fmt(LIMITS.free.analyses)} job analyses a month, the day-by-day plan to your interview date and {fmt(LIMITS.free.voice_mock)} voice mock interview a month. Pro raises the limits and unlocks the full scenario library. <Link to="/pricing">See pricing</Link>.</> },
  { q: "What happens to my resume and data?",
    a: <>Your resume is read in your browser and saved on your device, so you add it once; it syncs to your account only if you turn that on. Jobs, plans, practice and stories sync to your account so you can pick up on any device. You can download or delete your data any time from Account.</> },
  { q: "Is OfferReady an AI interview assistant?",
    a: <>Yes, for practice. The <Link to="/coach">AI Interview Coach</Link> answers any interview question with an outline built from your resume and stories, flags anything it couldn’t verify, and lets you rehearse and compare attempts. Unlike live interview assistants, it doesn’t run during the real interview: you go in able to give the answer yourself.</> },
  { q: "Does OfferReady help during a live interview?",
    a: <>No, and that’s on purpose. OfferReady is practice-only: there is no live mode, overlay or answer feed. It prepares you before the interview and helps you debrief after it. The follow-ups you practise are the same kind interviewers use to tell rehearsed or AI-fed answers from real understanding, so what you bring into the room is your own.</> },
  { q: "How is this different from ChatGPT, Claude or Gemini?",
    a: <>General assistants are great at answering the questions you think to ask. OfferReady is organised around one job and one date: it keeps your gaps, practice, stories and debriefs, runs an interview loop with follow-ups on what you said, and forecasts when you’ll be ready. You can still use your favourite assistant alongside it.</> },
  { q: "Which roles and levels does it cover?",
    a: <>Technical roles in AI/ML, data and platform engineering, solutions and forward-deployed engineering, and architecture. Questions, scenarios and scoring take the level into account, from senior through staff and principal.</> },
  { q: "Which interview rounds can I practise?",
    a: <>Behavioral (STAR stories, said out loud), system design (a voice round with a whiteboard), trade-off rounds where the interviewer keeps asking why, technical deep dives written from the job, phone and recruiter screens, and concept reps for SQL, Python and cloud. There is no live coding environment yet; coding concepts are covered in the question bank.</> },
  { q: "Is my data safe?",
    a: <>Your resume stays on your device unless you turn on sync, payments go through Stripe, there are no ads or third-party trackers, and you can download or delete your data any time. <ExternalLink href={DOCS_BASE + "Security/index.html"}>Security and your data</ExternalLink> lists exactly what we do.</> },
  { q: "Does the voice interview work in my browser?",
    a: <>It works best in Chrome or Edge on desktop, which have the most reliable speech recognition. Your browser will ask for microphone access when you start. If voice isn’t supported in your browser, every other practice tool still works.</> },
];
