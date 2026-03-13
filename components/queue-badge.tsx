interface QueueBadgeProps {
  position: number;
}

export function QueueBadge({ position }: QueueBadgeProps) {
  return <span className="queue-badge">{position}</span>;
}
