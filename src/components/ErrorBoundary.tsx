/* Catches render errors in the screens so one broken page doesn't blank the
 * whole app. Shows a friendly card with Reload / Go home and reports the
 * error (lib/errorReport.ts). `resetKey` (the current path) clears the error
 * when the user navigates elsewhere. */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../lib/errorReport";
import { withBase } from "../lib/router";

interface Props {
  children: ReactNode;
  /** Changing this (e.g. the pathname) resets the boundary. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  key?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { kind: "boundary", componentStack: info?.componentStack || null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card lp-crash" role="alert">
          <span className="lp-crash-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <h1>Something went wrong on this page</h1>
          <p className="muted">
            Your saved work is safe. Reloading usually fixes it. If it keeps happening, please let us know through the Contact page.
          </p>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            <a className="btn btn-ghost" href={withBase("/")}>Go home</a>
          </div>
        </div>
      </div>
    );
  }
}
