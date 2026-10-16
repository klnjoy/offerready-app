/* "Skills this job wants" on Resume match: each skill the job asks for, whether
 * your resume shows it, and for the missing ones how to get it — learn (study
 * library + official docs), build (a small project), prove it (a resume line),
 * and an optional certification. Plus how to succeed. No AI, no credits. */

import { useMemo, useState } from "react";
import { docsUrl } from "../config";
import { ExternalLink, Link } from "../lib/router";
import { mentions } from "../lib/tailor";

interface Res { match: RegExp; library?: [string, string]; docs: [string, string]; build: string; line: string; cert?: string }

const R: Res[] = [
  { match: /^snowflake|snowpark|snowpipe/i, library: ["Snowflake notes", "Technologies/snowflake/index.html"], docs: ["Snowflake docs", "https://docs.snowflake.com/"], build: "Load a public dataset into a free Snowflake trial, model it, and tune one slow query with clustering.", line: "Built a Snowflake model over N GB of data, cutting query time by X% with clustering and pruning.", cert: "SnowPro Core" },
  { match: /cortex/i, library: ["Snowflake Cortex notes", "Snowflake-Cortex/index.html"], docs: ["Snowflake Cortex docs", "https://docs.snowflake.com/en/guides-overview-ai-features"], build: "Add Cortex Search over a folder of documents and answer questions with citations.", line: "Shipped a Cortex Search assistant over N documents, answering X questions a week." },
  { match: /\bdbt\b/i, library: ["dbt notes", "Technologies/dbt/index.html"], docs: ["dbt docs", "https://docs.getdbt.com/docs/introduction"], build: "Build a dbt project with staging and mart models, tests and one incremental model.", line: "Rebuilt N reports as tested dbt models, with incremental loads cutting run time by X%.", cert: "dbt Certified Developer" },
  { match: /databricks|delta lake|unity catalog/i, library: ["Databricks notes", "Technologies/databricks/index.html"], docs: ["Databricks docs", "https://docs.databricks.com/"], build: "Build a bronze-silver-gold Delta pipeline on Databricks Community Edition.", line: "Designed a medallion pipeline on Databricks processing N rows a day.", cert: "Databricks Data Engineer Associate" },
  { match: /\bspark\b|pyspark/i, docs: ["Apache Spark docs", "https://spark.apache.org/docs/latest/"], build: "Process a large public dataset with PySpark and explain each shuffle you removed.", line: "Rewrote a PySpark job to cut shuffles, reducing run time from X to Y minutes." },
  { match: /airflow/i, docs: ["Apache Airflow docs", "https://airflow.apache.org/docs/"], build: "Schedule a daily pipeline in Airflow with retries, alerts and a backfill.", line: "Orchestrated N daily pipelines in Airflow with retries and SLAs." },
  { match: /kafka|streaming|kinesis/i, docs: ["Apache Kafka docs", "https://kafka.apache.org/documentation/"], build: "Stream events through Kafka into a warehouse and handle duplicates and late data.", line: "Built a streaming pipeline handling N events a second with exactly-once loads." },
  { match: /^sql$|\bsql\b/i, library: ["SQL interview Q&A", "Personal-SourceCode/SQL_Interview_QA.html"], docs: ["PostgreSQL tutorial", "https://www.postgresql.org/docs/current/tutorial.html"], build: "Solve 20 window-function and join problems and explain the plan for each.", line: "Tuned N slow SQL queries, cutting warehouse cost by X%." },
  { match: /python/i, library: ["Python interview Q&A", "Personal-SourceCode/Python_Interview_QA.html"], docs: ["Python tutorial", "https://docs.python.org/3/tutorial/"], build: "Write a small, tested Python package that cleans and validates a dataset.", line: "Wrote Python tooling used by N engineers, with X% test coverage." },
  { match: /\baws\b|amazon web services|s3|lambda|redshift|glue/i, library: ["AWS interview Q&A", "Personal-SourceCode/AWS_Interview_QA.html"], docs: ["AWS Skill Builder", "https://skillbuilder.aws/"], build: "Deploy a small serverless data pipeline (S3 → Lambda → a table) with infrastructure as code.", line: "Built an AWS pipeline (S3, Lambda, Glue) moving N GB a day at $X a month.", cert: "AWS Certified Data Engineer – Associate" },
  { match: /\bgcp\b|google cloud|bigquery/i, docs: ["Google Cloud learning", "https://cloud.google.com/learn/training"], build: "Load and model a public dataset in BigQuery with scheduled queries.", line: "Moved N reports to BigQuery, cutting cost by X%.", cert: "Google Professional Data Engineer" },
  { match: /azure|synapse|fabric/i, docs: ["Microsoft Learn", "https://learn.microsoft.com/training/"], build: "Build a small pipeline in Azure Data Factory into a lakehouse.", line: "Built Azure pipelines feeding N dashboards.", cert: "Azure Data Engineer Associate" },
  { match: /kubernetes|\bk8s\b/i, library: ["Kubernetes notes", "GenAI-Topics/kubernetes/index.html"], docs: ["Kubernetes tutorials", "https://kubernetes.io/docs/tutorials/"], build: "Deploy an API to a local cluster with health checks, autoscaling and a rollout.", line: "Ran N services on Kubernetes with zero-downtime deploys.", cert: "CKA / CKAD" },
  { match: /docker|container/i, docs: ["Docker get started", "https://docs.docker.com/get-started/"], build: "Containerise an app with a small, secure image and a compose file.", line: "Containerised N services, cutting image size by X%." },
  { match: /terraform|infrastructure as code|\biac\b/i, docs: ["Terraform tutorials", "https://developer.hashicorp.com/terraform/tutorials"], build: "Provision a small cloud setup with Terraform modules and remote state.", line: "Managed N environments with Terraform modules.", cert: "Terraform Associate" },
  { match: /\brag\b|retrieval/i, library: ["RAG notes", "GenAI-Topics/rag/index.html"], docs: ["RAG how-to (LangChain)", "https://python.langchain.com/docs/tutorials/rag/"], build: "Build a RAG app over your own documents and measure answer quality on 20 questions.", line: "Built a RAG assistant over N documents with X% answer accuracy on an eval set." },
  { match: /langgraph|agent/i, library: ["AI agents notes", "GenAI-Topics/agent-engineering/index.html"], docs: ["LangGraph docs", "https://langchain-ai.github.io/langgraph/"], build: "Build a small tool-using agent with a human approval step and tests.", line: "Shipped an agent that automated N tasks a week with human review." },
  { match: /langchain/i, library: ["LangChain notes", "GenAI-Topics/langchain/index.html"], docs: ["LangChain docs", "https://python.langchain.com/docs/introduction/"], build: "Build a chain with structured output and retries, then add tracing.", line: "Built LangChain pipelines serving N requests a day." },
  { match: /\bllm|genai|generative|gpt|openai|claude|anthropic/i, library: ["How LLMs work", "GenAI-Topics/llm-fundamentals/index.html"], docs: ["OpenAI docs", "https://platform.openai.com/docs/"], build: "Ship a small LLM feature end to end: prompt, structured output, eval set, cost per call.", line: "Shipped an LLM feature used by N users at $X per 1,000 calls." },
  { match: /prompt/i, library: ["Prompt engineering notes", "GenAI-Topics/prompt-engineering/index.html"], docs: ["Prompt engineering guide (Anthropic)", "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview"], build: "Write prompts for one task, then compare versions on a 20-example eval set.", line: "Raised task accuracy from X% to Y% through prompt and eval iteration." },
  { match: /vector|embedding|pinecone|pgvector|weaviate/i, library: ["Vector DB notes", "GenAI-Topics/vector-db/index.html"], docs: ["pgvector", "https://github.com/pgvector/pgvector"], build: "Index N documents with embeddings and compare search quality with keyword search.", line: "Built semantic search over N documents, improving relevance by X%." },
  { match: /\bmcp\b|model context protocol/i, library: ["MCP notes", "GenAI-Topics/mcp/index.html"], docs: ["MCP docs", "https://modelcontextprotocol.io/"], build: "Write a small MCP server that exposes one internal tool safely.", line: "Built an MCP server giving AI apps safe access to N internal tools." },
  { match: /mlops|llmops|model serving|deployment/i, library: ["LLMOps notes", "GenAI-Topics/llmops/index.html"], docs: ["MLflow docs", "https://mlflow.org/docs/latest/"], build: "Serve a model behind an API with versioning, monitoring and a rollback.", line: "Deployed N models with monitoring and one-click rollback." },
  { match: /fastapi|rest api|\bapi\b/i, library: ["FastAPI notes", "Technologies/fastapi/index.html"], docs: ["FastAPI tutorial", "https://fastapi.tiangolo.com/tutorial/"], build: "Build a typed API with auth, tests and OpenAPI docs.", line: "Built APIs serving N requests a day at p95 under X ms." },
  { match: /system design|architecture|distributed/i, library: ["System design Q&A", "Personal-SourceCode/System_Design_Interview_QA.html"], docs: ["System design primer", "https://github.com/donnemartin/system-design-primer"], build: "Write a one-page design for a system you know: requirements, trade-offs, cost.", line: "Designed a system handling N requests a second across X regions." },
];

function resourceFor(skill: string): Res | null {
  return R.find((r) => r.match.test(skill)) || null;
}

export function SkillPlan({ skills, resumeText, jobId }: { skills: string[]; resumeText: string; jobId: string }) {
  const rows = useMemo(() => skills.slice(0, 14).map((s) => ({ s, has: !!resumeText && mentions(resumeText, s), res: resourceFor(s) })), [skills, resumeText]);
  const missing = rows.filter((r) => !r.has);
  const [open, setOpen] = useState<string | null>(missing[0]?.s || null);
  if (!rows.length) return null;
  const coach = (s: string) => "/coach?job=" + encodeURIComponent(jobId) + "&q=" + encodeURIComponent("How would I explain my experience with " + s + " in this interview, and what should I learn first?");
  return (
    <section className="card skp" aria-labelledby="skp-h">
      <div>
        <h2 id="skp-h">Skills this job wants</h2>
        <p className="muted small">
          {resumeText ? <>{rows.length - missing.length} of {rows.length} show on your resume. Open a missing one to see how to get it and how to show it.</>
            : <>Add your resume above to see which you already show. Open any skill to see how to get it.</>}
        </p>
      </div>
      <div className="skp-chips" aria-hidden="true">
        {rows.map((r) => <span key={r.s} className={"skp-chip" + (r.has ? " has" : "")}>{r.has ? "✓ " : ""}{r.s}</span>)}
      </div>
      <ul className="skp-list">
        {(missing.length ? missing : rows).map((r) => {
          const on = open === r.s;
          return (
            <li key={r.s} className={"skp-item" + (on ? " on" : "")}>
              <button type="button" className="skp-head" aria-expanded={on} onClick={() => setOpen(on ? null : r.s)}>
                <span className="skp-name">{r.s}</span>
                <span className="small muted">{r.has ? "On your resume" : "Not on your resume yet"}</span>
                <span className="skp-chev" aria-hidden="true">{"›"}</span>
              </button>
              {on ? (
                <div className="skp-body">
                  {r.res ? (
                    <>
                      <p><strong>Learn.</strong>{" "}
                        {r.res.library ? <><ExternalLink href={docsUrl(r.res.library[1])}>{r.res.library[0]}</ExternalLink> in the study library, then </> : null}
                        <ExternalLink href={r.res.docs[1]}>{r.res.docs[0]}</ExternalLink>.</p>
                      <p><strong>Build.</strong> {r.res.build}</p>
                      <p><strong>Prove it.</strong> Once it{"’"}s true, a line like: <em>{"“"}{r.res.line}{"”"}</em> Use your real numbers.</p>
                      {r.res.cert ? <p><strong>Optional certification.</strong> {r.res.cert}. Useful when the posting lists it; projects usually count for more.</p> : null}
                    </>
                  ) : (
                    <p>Start with the official docs and a small project that uses <strong>{r.s}</strong> on real data, then add one honest resume line with a result.</p>
                  )}
                  <Link className="btn btn-small" to={coach(r.s)}>Ask the AI Coach about {r.s}</Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <details className="skp-succeed">
        <summary>How to succeed</summary>
        <ul>
          <li><strong>Show proof, not just keywords.</strong> One small public project per missing skill beats a long skills list.</li>
          <li><strong>Learn the gap the job asks about most first.</strong> Two skills done well beat five half done.</li>
          <li><strong>Put numbers on everything.</strong> Data size, time saved, cost, users.</li>
          <li><strong>Practise saying it.</strong> Explain each project out loud in two minutes: problem, your choice, the trade-off, the result.</li>
          <li><strong>Be honest in the interview.</strong> {"“"}I{"’"}ve used it in a project, not yet in production{"”"} is better than bluffing.</li>
        </ul>
      </details>
    </section>
  );
}
