/* Shapes returned by the OfferReady API (../api). Kept loose where the AI
 * output varies, strict where the UI depends on a field. */

export interface Skill {
  name: string;
  type?: string;
}

export interface PotentialGap {
  requirement: string;
  whatIsMissing?: string;
  whyItMatters?: string;
  whatToStudy?: string[];
  whatToBuild?: string[];
  whatToPractice?: string[];
  interviewExpectation?: string;
  title?: string;
}

export interface PlanItem {
  priority: number | string;
  title: string;
  why?: string;
  skills?: string[];
  resource?: { label: string; path: string };
}

export interface Analysis {
  /** The title exactly as the posting names it ("" when it doesn't). */
  jobTitle?: string;
  /** The hiring company as the posting names it. */
  company?: string;
  roleSummary: string;
  seniority?: string;
  coreSkills?: (string | Skill)[];
  preferredSkills?: (string | Skill)[];
  technologies?: string[];
  experienceRequirements?: string[];
  responsibilities?: (string | { title?: string; requirement?: string })[];
  interviewSignals?: ({ area?: string; type?: string; note?: string } | string)[];
  resumeProvided?: boolean;
  alignment?: { requirement: string; status: string; evidence: string }[];
  readiness?: { dimension: string; status: string; roleRequires: string; candidateHas: string; gap: string }[];
  potentialGaps?: PotentialGap[];
  preparationPlan?: PlanItem[];
  offerReadyResources?: { label: string; path: string }[];
  nextStep?: string;
}

export interface JobRow {
  id: string;
  title?: string;
  company?: string;
  seniority?: string;
  created_at?: string;
  skills_count?: number;
  gaps_count?: number;
  prep_progress?: number;
  job_description?: string;
  analysis?: Analysis;
}

export interface GapResult {
  matchScore?: number;
  summary?: string;
  technicalScore?: number;
  behavioralScore?: number;
  architectureScore?: number;
  domainScore?: number;
  strengths?: string[];
  missingSkills?: string[];
  missingKeywords?: string[];
  missingExperience?: string[];
}

export interface GapRow {
  match_score?: number;
  technical_score?: number;
  behavioral_score?: number;
  architecture_score?: number;
  domain_score?: number;
  result?: GapResult;
  created_at?: string;
}

export interface ProgressRow {
  overall_readiness?: number | null;
  avg_answer_score?: number;
  questions_practiced?: number;
  technical_score?: number | null;
  behavioral_score?: number | null;
  architecture_score?: number | null;
  domain_score?: number | null;
  recorded_at?: string;
}

export interface PracticeRow {
  completed?: boolean;
  score?: number | null;
  category?: string;
  content_slug?: string;
  mode?: string;
  completed_at?: string;
}

export type QuestionCategory = "technical" | "behavioral" | "system_design" | "leadership";

export interface GeneratedQuestion {
  category: QuestionCategory | string;
  difficulty?: "easy" | "medium" | "hard" | string;
  prompt: string;
  /** What a strong answer says (saved with the job's question set). */
  model_answer?: string;
  /** What the interviewer listens for. */
  signals?: string[];
  created_at?: string;
}

export interface JobDetail {
  job: JobRow;
  gap: GapRow | null;
  questions: GeneratedQuestion[];
  progress: ProgressRow[];
  practice: PracticeRow[];
}

export type NodeKind =
  | "decision" | "why" | "tradeoff" | "constraint" | "incident"
  | "reflection" | "next_drill" | "choice";

export interface ScenarioNode {
  id: string;
  kind: NodeKind | string;
  prompt: string;
  model?: string;
  signals?: string[];
  next?: string;
  checklist?: string[];
  recommend?: { label: string; path?: string }[];
  options?: { label: string; note?: string; next?: string }[];
}

export interface ScenarioTeaser {
  setup?: string;
  you_will_practice?: string[];
  sample_node?: { prompt: string; model?: string };
}

export interface Scenario {
  slug: string;
  title: string;
  category: string;
  teaser?: ScenarioTeaser;
  content?: { start: string; nodes: Record<string, ScenarioNode> };
  entitled?: boolean;
  exactJob?: boolean;
  jobId?: string;
}

export interface FeedbackCriterion {
  id: string;
  label: string;
  weight: number;
  /** 0 missing · 1 vague · 2 solid (senior) · 3 staff level */
  rating: 0 | 1 | 2 | 3;
  /** Quote from the answer that earned the rating (checked by the server). */
  evidence?: string;
  note?: string;
}

export interface AnswerFeedback {
  score?: number;
  verdict?: string;
  covered?: string[];
  missing?: string[];
  followup?: string;
  /** Rubric grading (api/_lib/gradeAnswer.js v2). */
  level?: "staff" | "senior" | "almost" | "not_yet";
  criteria?: FeedbackCriterion[];
  staff_upgrade?: string;
  rubric?: { id: string; label: string; version: string };
  caps?: string[];
}
