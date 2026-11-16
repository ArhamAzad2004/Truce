import { useEffect, useState } from "react";
import { Attribution } from "../components/Attribution";
import "./Landing.css";

type Status = "checking" | "ready" | "offline";

export function Landing() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/health", { signal: ctrl.signal })
      .then((r) => setStatus(r.ok ? "ready" : "offline"))
      .catch((e) => { if (e.name !== "AbortError") setStatus("offline"); });
    return () => ctrl.abort();
  }, []);

  return (
    <main className="landing">
      <span className="wordmark" aria-label="Truce">TRUCE</span>

      <article className="ticket landing-ticket" aria-labelledby="landing-title">
        <div className="ticket-section">
          <div className="ticket-row label">
            <span>Admit all · Tonight</span>
            <span className="ink-muted">No. 000001</span>
          </div>
          <h1 id="landing-title" className="landing-title">Movie night, settled.</h1>
          <p className="ink-muted">
            Everyone joins from their own phone, taps a few answers and names three films they love.
            Truce prints one film you can all stream tonight, and tells each of you why.
          </p>
        </div>

        <div className="perf" aria-hidden="true" />

        <ol className="ticket-section steps">
          <li><span className="label">01</span> Open a room and share the link.</li>
          <li><span className="label">02</span> Friends join with just a nickname.</li>
          <li><span className="label">03</span> One pick. One veto each.</li>
        </ol>
      </article>

      <div className="landing-actions">
        <button className="btn btn-primary" type="button" aria-disabled="true" aria-describedby="landing-status">
          Start a room
        </button>
        <p id="landing-status" className="landing-status" role="status">
          {status === "checking" && "Warming up the projector…"}
          {status === "ready" && "Rooms open soon. The projector is warm."}
          {status === "offline" && "Can't reach Truce right now. Try again in a moment."}
        </p>
      </div>

      <footer className="landing-footer">
        <Attribution />
      </footer>
    </main>
  );
}
