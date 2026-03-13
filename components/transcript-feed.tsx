import { ActivityEntry, TranscriptEntry } from "@/lib/types";

interface TranscriptFeedProps {
  transcript: TranscriptEntry[];
  activity: ActivityEntry[];
  hidden?: boolean;
}

export function TranscriptFeed({ transcript, activity, hidden = false }: TranscriptFeedProps) {
  return (
    <div className="call-panels">
      {!hidden ? (
        <section className="panel transcript-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Live Transcript</p>
              <h3>Mocked conversation feed</h3>
            </div>
          </div>
          <div className="panel-scroll">
            {transcript.map((entry) => (
              <article key={entry.id} className={`transcript-entry transcript-entry--${entry.kind}`}>
                <div className="transcript-entry__meta">
                  <strong>{entry.name}</strong>
                  <span>{entry.role}</span>
                  <span>{entry.timestamp}</span>
                </div>
                <p>{entry.message}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel activity-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Activity Stream</p>
            <h3>Queue and turn-taking updates</h3>
          </div>
        </div>
        <div className="panel-scroll">
          {activity.map((item) => (
            <article key={item.id} className={`activity-entry activity-entry--${item.tone}`}>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
