import {
  computeRms,
  MIN_ACTIVE_FRAMES,
  pcmFloatTo16Bit,
  PCM_SAMPLE_RATE,
  toBase64,
  USER_SILENCE_GRACE_MS,
  USER_SPEECH_THRESHOLD,
} from "@/lib/realtime/audio";

interface MicrophoneStreamOptions {
  onSpeechStart: (messageId: string, mimeType: string) => void;
  onAudioChunk: (messageId: string, chunkId: string, audio: string, mimeType: string) => void;
  onSpeechEnd: (messageId: string) => void;
}

export class MicrophoneStream {
  private readonly options: MicrophoneStreamOptions;
  private muted = false;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private monitorGain: GainNode | null = null;
  private currentMessageId: string | null = null;
  private activeFrameCount = 0;
  private lastVoiceDetectedAt = 0;

  constructor(options: MicrophoneStreamOptions) {
    this.options = options;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser cannot open a microphone stream.");
    }

    if (this.stream) {
      return;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
    await this.audioContext.resume();

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.monitorGain = this.audioContext.createGain();
    this.monitorGain.gain.value = 0;
    this.lastVoiceDetectedAt = performance.now();

    this.processor.onaudioprocess = (event) => {
      if (this.muted) {
        this.finishCurrentTurn();
        return;
      }

      const input = event.inputBuffer.getChannelData(0);
      const rms = computeRms(input);
      const now = performance.now();
      const pcmChunk = pcmFloatTo16Bit(input);
      const mimeType = `audio/pcm;rate=${PCM_SAMPLE_RATE}`;

      if (rms >= USER_SPEECH_THRESHOLD) {
        this.activeFrameCount += 1;
        this.lastVoiceDetectedAt = now;

        if (!this.currentMessageId && this.activeFrameCount >= MIN_ACTIVE_FRAMES) {
          this.currentMessageId = crypto.randomUUID();
          this.options.onSpeechStart(this.currentMessageId, mimeType);
        }
      }

      if (this.currentMessageId) {
        this.options.onAudioChunk(
          this.currentMessageId,
          crypto.randomUUID(),
          toBase64(pcmChunk),
          mimeType,
        );
      }

      if (this.currentMessageId && now - this.lastVoiceDetectedAt >= USER_SILENCE_GRACE_MS) {
        this.finishCurrentTurn();
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.monitorGain);
    this.monitorGain.connect(this.audioContext.destination);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.finishCurrentTurn();
    }
  }

  private finishCurrentTurn() {
    if (!this.currentMessageId) {
      this.activeFrameCount = 0;
      return;
    }

    this.options.onSpeechEnd(this.currentMessageId);
    this.currentMessageId = null;
    this.activeFrameCount = 0;
  }

  async stop() {
    this.finishCurrentTurn();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.monitorGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());

    this.processor = null;
    this.source = null;
    this.monitorGain = null;
    this.stream = null;

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}
