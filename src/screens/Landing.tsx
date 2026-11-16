import { type FormEvent, useState } from "react";
import { CODE_RE } from "../../shared/limits";
import { Attribution } from "../components/Attribution";
import "./Landing.css";

// Accepts a typed code (spaces and dashes ignored) or a pasted invite link.
function readCode(input: string) {
  const upper = input.toUpperCase();
  const fromLink = upper.match(/\/R\/([^/?#\s]+)/);
  const code = (fromLink ? fromLink[1] : upper).replace(/[\s-]/g, "");
  return CODE_RE.test(code) ? code : null;
}

export function Landing({ go }: { go: (to: string) => void }) {
  const [askCode, setAskCode] = useState(false);
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);

  const joinByCode = (event: FormEvent) => {
    event.preventDefault();
    const code = readCode(value);
    if (code) go(`/r/${code}`);
    else setBad(true);
  };

  return (
    <main className="screen landing">
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

      <div className="stack">
        <button className="btn btn-primary" type="button" onClick={() => go("/new")}>Open a room</button>
        {askCode ? (
          <form className="code-form" onSubmit={joinByCode} noValidate>
            <label htmlFor="room-code">Room no.</label>
            <div className="field-row">
              <input
                id="room-code" className="input input-room" value={value} autoFocus
                autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={120}
                aria-invalid={bad} aria-describedby={bad ? "room-code-error" : undefined}
                onChange={(e) => { setValue(e.target.value); setBad(false); }}
              />
              <button className="btn btn-primary" type="submit">Join</button>
            </div>
            {bad && <p id="room-code-error" className="error error-room" role="alert">Room numbers are 10 letters and digits. Check the invite.</p>}
          </form>
        ) : (
          <button className="btn-text" type="button" onClick={() => setAskCode(true)}>Got a room code?</button>
        )}
      </div>

      <footer className="landing-footer">
        <Attribution />
      </footer>
    </main>
  );
}
