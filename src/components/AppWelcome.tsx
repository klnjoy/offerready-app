/* The installed app's first screen (instead of the marketing website).
 * Signed out: what OfferReady does in three lines, Get started / Sign in,
 * and things to try without an account. Signed in with no job yet: add the
 * first job, or pick one from Open roles. (Signed in with a job, "/" opens
 * that job's Today, see LandOnJob.) */

import { Link } from "../lib/router";
import { Icon } from "./Icon";

export function AppWelcome({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="aw">
      <section className="aw-hero">
        <h1 className="aw-h">{signedIn ? "Let’s add your first job" : <>Interview prep for <span>the one job you want</span></>}</h1>
        <ul className="aw-points">
          <li><Icon name="target" size={18} /><span>See what the job asks and where your resume falls short</span></li>
          <li><Icon name="mic" size={18} /><span>Practise its questions with an AI coach and mock interviews</span></li>
          <li><Icon name="calendar" size={18} /><span>Know the day you{"’"}ll be ready</span></li>
        </ul>
        {signedIn ? (
          <>
            <Link className="btn aw-primary" to="/analyze">Add a job <span aria-hidden="true">→</span></Link>
            <Link className="aw-secondary" to="/roles">Or pick one from open roles</Link>
          </>
        ) : (
          <>
            <Link className="btn aw-primary" to="/analyze">Get started, free <span aria-hidden="true">→</span></Link>
            <Link className="aw-secondary" to="/account">I have an account · Sign in</Link>
          </>
        )}
      </section>

      <section className="aw-explore" aria-labelledby="aw-ex-h">
        <h2 id="aw-ex-h" className="more-h">{signedIn ? "Or start here" : "Explore without an account"}</h2>
        <div className="aw-grid">
          <Link className="aw-tile" to="/roles"><Icon name="briefcase" size={22} /><strong>Open roles</strong><span>AI, data and FDE jobs in the USA, daily</span></Link>
          <Link className="aw-tile" to="/learn/roadmap"><Icon name="list" size={22} /><strong>12-week AI roadmap</strong><span>Learn, build, practise</span></Link>
          {!signedIn && <Link className="aw-tile" to="/try"><Icon name="mic" size={22} /><strong>Try a question</strong><span>Answer one and get feedback</span></Link>}
          <Link className="aw-tile" to="/demo"><Icon name="spark" size={22} /><strong>1-minute tour</strong><span>See how it works</span></Link>
        </div>
      </section>
      <p className="aw-foot">Practice only, never during a live interview. <Link to="/?home=1&site=1">Full website</Link></p>
    </div>
  );
}
