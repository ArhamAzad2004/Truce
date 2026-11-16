import { useRef } from "react";

const API_URL = "https://www.movieofthenight.com/about/api";

// Required by the Streaming Availability API terms (§4). Short form here; the full sentence is in the about sheet.
export function Attribution() {
  return (
    <p>
      Streaming data and images:{" "}
      <a href={API_URL} target="_blank" rel="noopener noreferrer">Streaming Availability API by Movie of the Night</a>
    </p>
  );
}

/** Footer for Landing and Reveal: the credit line and the about sheet. Text mirrors docs/SECURITY_PRIVACY.md §10. */
export function SiteFooter() {
  const sheet = useRef<HTMLDialogElement>(null);
  return (
    <footer className="site-footer">
      <Attribution />
      <button className="btn-text btn-inline" type="button" onClick={() => sheet.current?.showModal()}>About and privacy</button>

      <dialog ref={sheet} className="sheet" aria-labelledby="about-title">
        <h2 id="about-title" className="title">About Truce</h2>
        <p>Truce picks one film your group can stream tonight. It has no accounts and no tracking.</p>

        <h3>What we keep, and for how long</h3>
        <p>
          Your nickname, the answers you tap, and the films you pick as favourites. They live in your room and are deleted
          automatically 4 hours after the room was opened. We guess the room's country from the host's connection so we can
          check what is streaming there; the host can change it.
        </p>

        <h3>Who sees what</h3>
        <p>
          Everyone in your room sees your nickname, whether you are ready, and the reason the pick fits you. Your taps and your
          three films are never shown as a list, and nobody sees them in the lobby. The reason on the final ticket is written
          from them, so it may name a film you picked or the mood you chose, and everyone in the room can read it.
        </p>

        <h3>Who else is involved</h3>
        <p>
          Film details, posters and streaming availability come from the Streaming Availability API by Movie of the Night. When
          you search for a film, it receives your search words, but not your nickname or who you are. We keep search results
          for up to 30 days so the same search is faster next time; they are not linked to you. Posters load straight from its
          image servers, so they see your device's IP address, as any website does when it shows you an image.
        </p>
        <p>
          When the pick is ranked by a language model, it receives the group's tapped answers and favourite film titles
          labelled only as "P1", "P2" and so on. It never receives your nickname or anything you typed. The app runs on
          Cloudflare.
        </p>

        <h3>Stopping abuse</h3>
        <p>
          We count requests per network address for up to a day so one person cannot use up the service for everyone. The count
          is held in memory only. It is never saved or logged.
        </p>

        <h3>What we do not do</h3>
        <p>No cookies, no ads, no analytics, no selling or sharing of data.</p>

        <h3>On your phone</h3>
        <p>A random key is kept in this browser tab so you can refresh without losing your seat. It is gone when you close the tab.</p>

        <p className="hint">
          Streaming availability metadata and images are provided by{" "}
          <a href={API_URL} target="_blank" rel="noopener noreferrer">Streaming Availability API by Movie of the Night</a>.
        </p>

        <form method="dialog"><button className="btn btn-ghost" type="submit">Close</button></form>
      </dialog>
    </footer>
  );
}
