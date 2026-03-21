import { Captions, Mic, MicOff, PhoneOff, Waves } from "lucide-react";

interface CallControlsProps {
  muted: boolean;
  speaking: boolean;
  transcriptVisible: boolean;
  onToggleMute: () => void;
  onToggleSpeaking: () => void;
  onToggleTranscript: () => void;
  onEndCall: () => void;
}

export function CallControls({
  muted,
  speaking,
  transcriptVisible,
  onToggleMute,
  onToggleSpeaking,
  onToggleTranscript,
  onEndCall,
}: CallControlsProps) {
  return (
    <div className="call-controls">
      <button className={`control-chip ${muted ? "control-chip--muted" : ""}`} onClick={onToggleMute}>
        {muted ? <MicOff size={16} /> : <Mic size={16} />}
        {muted ? "Unmute" : "Mute"}
      </button>
      <button className={`control-chip control-chip--priority ${speaking ? "control-chip--active" : ""}`} onClick={onToggleSpeaking}>
        <Waves size={16} />
        {speaking ? "Resume room" : "Take floor"}
      </button>
      <button className={`control-chip ${transcriptVisible ? "control-chip--active" : ""}`} onClick={onToggleTranscript}>
        <Captions size={16} />
        {transcriptVisible ? "Hide transcript" : "Show transcript"}
      </button>
      <button className="control-chip control-chip--danger" onClick={onEndCall}>
        <PhoneOff size={16} />
        End call
      </button>
    </div>
  );
}
