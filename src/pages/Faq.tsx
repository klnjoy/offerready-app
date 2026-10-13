/* /faq: every common question in one place, plus the free study library,
 * so the home page can stay short. */
import { STUDY_URL, DOCS_BASE } from "../config";
import { ExternalLink } from "../lib/router";
import { Icon } from "../components/Icon";
import { FAQ, STUDY_TOPICS } from "../content/faq";

export default function FaqPage() {
  return (
    <div className="page faqp">
      <section className="faqp-study card" aria-labelledby="faqp-study-h">
        <div>
          <p className="hm-kicker">Free study library</p>
          <h2 id="faqp-study-h">Study the concepts behind the questions</h2>
          <p className="muted">Deep notes written for interviews, free and open to everyone, no account needed.</p>
          <ul className="hm-chips">{STUDY_TOPICS.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <ExternalLink className="btn btn-primary" href={STUDY_URL}>
          Open the study notes <Icon name="ext" size={16} /><span className="hm-sr"> (opens in a new tab)</span>
        </ExternalLink>
      </section>

      <section aria-labelledby="faqp-h">
        <h2 id="faqp-h" className="faqp-h">Questions, answered</h2>
        <div className="hm-faq faqp-list">
          {FAQ.map((f) => (
            <details key={f.q} className="hm-qa">
              <summary><span>{f.q}</span><span className="hm-qa-ico" aria-hidden="true"><Icon name="plus" size={18} /></span></summary>
              <div className="hm-qa-body"><p>{f.a}</p></div>
            </details>
          ))}
        </div>
        <p className="faqp-more muted">
          Still stuck? Read the <ExternalLink className="hm-link" href={DOCS_BASE + "Help/index.html"}>Help Center</ExternalLink>, ask the assistant in the corner, or <ExternalLink className="hm-link" href={DOCS_BASE + "Contact/index.html"}>contact us</ExternalLink>.
        </p>
      </section>
    </div>
  );
}
