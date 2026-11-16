import { type FormEvent, useState } from "react";
import { NICKNAME_RE, cleanNickname } from "../../shared/limits";

type Props = {
  code?: string; // shown to guests; a host has no room yet
  busy?: boolean;
  nameTaken?: boolean;
  failure?: string;
  onSubmit: (nickname: string) => void;
};

export function Nickname({ code, busy, nameTaken, failure, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState("");
  const name = cleanNickname(value);
  const invalid = name !== "" && !NICKNAME_RE.test(name);

  const error = invalid
    ? "Use letters, numbers, spaces, and - _ ' only. 20 at most."
    : nameTaken && name === sent
      ? `Someone here is already ${sent}. Add an initial?`
      : failure;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !NICKNAME_RE.test(name)) return;
    setSent(name);
    onSubmit(name);
  };

  return (
    <main className="screen">
      <header className="screen-head">
        <span className="wordmark" aria-label="Truce">TRUCE</span>
        {code && <span className="label">Room {code}</span>}
      </header>

      <form className="stack" onSubmit={submit} noValidate>
        <div className="ticket">
          <div className="ticket-section stack">
            <h1 className="title">Take a seat.</h1>
            <div className="field">
              <label htmlFor="nickname">Your name for tonight</label>
              <input
                id="nickname" className="input" value={value} autoFocus
                autoComplete="off" enterKeyHint="go" maxLength={40}
                aria-invalid={Boolean(error)} aria-describedby="nickname-help"
                onChange={(e) => setValue(e.target.value)}
              />
              <p id="nickname-help" className={error ? "error" : "hint"} role={error ? "alert" : undefined}>
                {error ?? "Up to 20 letters or numbers. No account."}
              </p>
            </div>
          </div>
        </div>
        <button className="btn btn-primary" type="submit" aria-disabled={busy || name === "" || invalid}>
          {busy ? "Finding your seat…" : "Take my seat"}
        </button>
      </form>
    </main>
  );
}
