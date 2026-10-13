/* /demo: the three-step product demo on its own page, to share or watch full
 * screen. Starts playing straight away. */

import { DemoTour } from "../components/DemoTour";
import { Icon } from "../components/Icon";
import { Link } from "../lib/router";

export default function DemoPage() {
  return (
    <div className="page demo-page">
      <DemoTour autoStart />
      <div className="row demo-cta">
        <Link className="btn btn-primary btn-lg" to="/analyze">Add your job, free <Icon name="arrow" size={18} /></Link>
        <Link className="btn btn-lg" to="/example">See a full worked example</Link>
      </div>
    </div>
  );
}
