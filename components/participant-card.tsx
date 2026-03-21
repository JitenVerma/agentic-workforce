import type { CSSProperties } from "react";
import { Hand, Mic, MicOff, Sparkles } from "lucide-react";
import { ParticipantState } from "@/lib/types";
import { QueueBadge } from "@/components/queue-badge";

interface ParticipantCardProps {
  name: string;
  role: string;
  initials: string;
  accent: string;
  state: ParticipantState;
  queuePosition?: number;
  human?: boolean;
  muted?: boolean;
}

type AccentStyle = CSSProperties & {
  "--avatar-accent"?: string;
};

export function ParticipantCard({
  name,
  role,
  initials,
  accent,
  state,
  queuePosition,
  human = false,
  muted = false,
}: ParticipantCardProps) {
  const icon =
    state === "speaking" ? (
      <Sparkles size={16} />
    ) : state === "thinking" ? (
      <Sparkles size={16} />
    ) : state === "queued" || state === "hand-raised" ? (
      <Hand size={16} />
    ) : muted ? (
      <MicOff size={16} />
    ) : (
      <Mic size={16} />
    );

  return (
    <article className={`participant-card participant-card--${state}`}>
      <div className="participant-card__top">
        <div className="participant-card__identity">
          <div className="avatar" style={{ "--avatar-accent": accent } as AccentStyle}>
            <span>{initials}</span>
          </div>
          <div>
            <h3>{name}</h3>
            <p>{role}</p>
          </div>
        </div>
        {typeof queuePosition === "number" ? <QueueBadge position={queuePosition} /> : null}
      </div>

      <div className="participant-card__bottom">
        <span className="participant-state">
          {icon}
          {state === "priority"
            ? "Human priority"
            : state === "thinking"
              ? "Preparing response"
            : state === "queued"
              ? "Queued to speak"
              : state === "hand-raised"
                ? "Hand raised"
                : state === "speaking"
                  ? "Speaking"
                  : state === "listening"
                    ? "Listening"
                    : human && muted
                      ? "Muted"
                      : "Idle"}
        </span>
        {human ? <span className="participant-meta">Host override enabled</span> : <span className="participant-meta">Specialist perspective</span>}
      </div>
    </article>
  );
}
