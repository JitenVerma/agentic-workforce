import type { CSSProperties } from "react";
import { AgentProfile } from "@/lib/types";

interface AgentCardProps {
  agent: AgentProfile;
  selected: boolean;
  onToggle: (agentId: string) => void;
  disabled?: boolean;
  footerLabel?: string;
  statusLabel?: string;
}

type AccentStyle = CSSProperties & {
  "--avatar-accent"?: string;
  "--accent-line"?: string;
};

export function AgentCard({
  agent,
  selected,
  onToggle,
  disabled = false,
  footerLabel,
  statusLabel,
}: AgentCardProps) {
  return (
    <button
      type="button"
      className={`agent-card ${selected ? "agent-card--selected" : ""} ${
        disabled ? "agent-card--disabled" : ""
      }`}
      onClick={() => onToggle(agent.id)}
      disabled={disabled}
    >
      <div className="agent-card__header">
        <div className="avatar avatar--small" style={{ "--avatar-accent": agent.accent } as AccentStyle}>
          <span>{agent.initials}</span>
        </div>
        <div>
          <h3>{agent.name}</h3>
          <p className="muted">{agent.role}</p>
        </div>
      </div>
      <p className="agent-card__description">{agent.description}</p>
      <p className="agent-card__perspective">{agent.perspective}</p>
      <div className="agent-card__footer">
        <span className="accent-line" style={{ "--accent-line": agent.accent } as AccentStyle} />
        <span>
          {footerLabel ??
            (disabled
              ? "Unavailable for call"
              : selected
                ? "Selected for call"
                : "Tap to invite")}
        </span>
        {statusLabel ? <span className="participant-meta">{statusLabel}</span> : null}
      </div>
    </button>
  );
}
