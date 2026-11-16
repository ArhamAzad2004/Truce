import { type FormEvent, useEffect, useState } from "react";
import type { Answers, Service, You } from "../../shared/protocol";
import "./Picks.css";

const MOODS: [Answers["mood"], string][] = [
  ["cosy", "Cosy"], ["funny", "Funny"], ["tense", "Tense"],
  ["moving", "Moving"], ["mind_bending", "Mind-bending"], ["feel_good", "Feel-good"],
];
const ENERGIES: [Answers["energy"], string][] = [["half_asleep", "Half asleep"], ["awake", "Awake"], ["wired", "Wired"]];
const TIMES: [Answers["maxMinutes"], string][] = [[90, "90 min"], [120, "2 hours"], [150, "2½ hours"], [null, "No limit"]];

type GroupProps<T> = {
  name: string; title: string; options: [T, string][];
  value: T | undefined; onChange: (value: T) => void;
};

function Group<T extends string | number | null>({ name, title, options, value, onChange }: GroupProps<T>) {
  return (
    <fieldset className="group ticket-section">
      <legend><span className="group-head">{title} <small>Pick one</small></span></legend>
      <div className="chips">
        {options.map(([option, label]) => (
          <label key={String(option)} className="chip">
            <input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Props = { you: You; region: string; onDone: (answers: Answers) => void; onBack: () => void };

export function QuickTaps({ you, region, onDone, onBack }: Props) {
  const [mood, setMood] = useState(you.answers?.mood);
  const [energy, setEnergy] = useState(you.answers?.energy);
  // `undefined` = not chosen yet; `null` is the real answer "No limit".
  const [maxMinutes, setMaxMinutes] = useState<Answers["maxMinutes"] | undefined>(you.answers?.maxMinutes);
  const [picked, setPicked] = useState<string[]>(you.answers?.serviceIds ?? []);
  const [services, setServices] = useState<Service[] | "loading" | "failed">("loading");

  useEffect(() => {
    const ctrl = new AbortController();
    setServices("loading");
    fetch(`/api/services?region=${region}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Service[]>) : Promise.reject()))
      .then((list) => {
        setServices(list);
        setPicked((ids) => ids.filter((id) => list.some((s) => s.id === id))); // a region change drops what it doesn't have
      })
      .catch(() => { if (!ctrl.signal.aborted) setServices("failed"); });
    return () => ctrl.abort();
  }, [region]);

  const done = mood && energy && maxMinutes !== undefined && picked.length > 0;
  const toggle = (id: string) => setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (done) onDone({ mood, energy, maxMinutes, serviceIds: picked });
  };

  return (
    <main className="screen">
      <header className="screen-head">
        <span className="wordmark" aria-label="Truce">TRUCE</span>
        <span className="label">Step 1 / 2</span>
      </header>
      <div className="stack">
        <h1 className="title">What are you in for?</h1>
        <p className="muted">Four taps. The others only see the reason on your final ticket.</p>
      </div>

      <form className="stack" onSubmit={submit}>
        <div className="ticket">
          <Group name="mood" title="Mood" options={MOODS} value={mood} onChange={setMood} />
          <div className="perf" aria-hidden="true" />
          <Group name="energy" title="Energy" options={ENERGIES} value={energy} onChange={setEnergy} />
          <div className="perf" aria-hidden="true" />
          <Group name="time" title="Time" options={TIMES} value={maxMinutes} onChange={setMaxMinutes} />
          <div className="perf" aria-hidden="true" />
          <fieldset className="group ticket-section">
            <legend><span className="group-head">Services <small>Pick any</small></span></legend>
            {services === "loading" && <p className="hint" role="status">Checking what streams here…</p>}
            {services === "failed" && <p className="error" role="alert">Couldn't load the services. Go back and try again in a moment.</p>}
            {Array.isArray(services) && services.length === 0 && (
              <p className="hint">We can't check streaming in this country yet. Ask the host to change the region.</p>
            )}
            {Array.isArray(services) && (
              <div className="chips">
                {services.map((s) => (
                  <label key={s.id} className="chip">
                    <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>
        <button className="btn btn-primary" type="submit" aria-disabled={!done}>Next: pick 3 films</button>
        <button className="btn-text" type="button" onClick={onBack}>Back to the lobby</button>
      </form>
    </main>
  );
}
