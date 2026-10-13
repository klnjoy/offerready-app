/* Quick FAQ inside the help panel: instant answers to the questions people
 * ask most, without waiting for the assistant. Kept short and factual; the
 * Help Center has the full guides. */

import { docsUrl } from "../config";
import { BOT_FAQ } from "../content/faq";

export function HelpFaq({ onAsk }: { onAsk: () => void }) {
  return (
    <div className="hb-faq">
      <p className="hb-history-title">Quick answers</p>
      {BOT_FAQ.map((f) => (
        <details key={f.q} className="hb-faq-item">
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
      <p className="hb-note hb-faq-more">
        Didn{"’"}t find it? <button type="button" className="hb-link" onClick={onAsk}>Ask the assistant</button>, read the <a href={docsUrl("Help/index.html")} target="_blank" rel="noopener noreferrer">Help Center</a>, or <a href={docsUrl("Contact/index.html")} target="_blank" rel="noopener noreferrer">contact us</a>.
      </p>
    </div>
  );
}
