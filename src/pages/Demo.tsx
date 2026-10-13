/* /demo: the full product tour on its own page, to share or watch full
 * screen. Starts playing straight away. The same tour is also offered as a
 * one-minute MP4 (public/offerready-demo.mp4) to watch or download. */

import { DemoTour } from "../components/DemoTour";
import { Icon } from "../components/Icon";
import { Link } from "../lib/router";

const BASE = import.meta.env.BASE_URL || "/";
export const DEMO_VIDEO = BASE + "offerready-demo.mp4";

export default function DemoPage() {
  return (
    <div className="page demo-page">
      <DemoTour autoStart />
      <div className="row demo-cta">
        <Link className="btn btn-primary btn-lg" to="/analyze">Add your job, free <Icon name="arrow" size={18} /></Link>
        <Link className="btn btn-lg" to="/example">See a full worked example</Link>
      </div>
      <section className="demo-video" aria-labelledby="demo-video-h">
        <h2 id="demo-video-h">Prefer a video?</h2>
        <p className="muted">The same tour as a one-minute video, to watch here or share.</p>
        <video controls preload="none" poster={BASE + "offerready-demo-poster.jpg"} width={1280} height={720}>
          <source src={DEMO_VIDEO} type="video/mp4" />
        </video>
        <p><a className="hm-link" href={DEMO_VIDEO} download="offerready-demo.mp4">Download the video (MP4, 1 minute)</a></p>
      </section>
    </div>
  );
}
