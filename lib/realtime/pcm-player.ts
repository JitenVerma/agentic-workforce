import { extractSampleRate, fromBase64, PCM_SAMPLE_RATE } from "@/lib/realtime/audio";

export class PcmPlayer {
  private audioContext: AudioContext | null = null;
  private playbackCursor = 0;

  async ensureReady() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
    }

    await this.audioContext.resume();
  }

  playBase64Pcm(data: string, mimeType?: string) {
    if (!this.audioContext) {
      return;
    }

    if (this.audioContext.state !== "running") {
      void this.audioContext.resume();
    }

    const bytes = fromBase64(data);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const samples = new Float32Array(sampleCount);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getInt16(index * 2, true) / 0x8000;
    }

    const sampleRate = extractSampleRate(mimeType);
    const audioBuffer = this.audioContext.createBuffer(1, sampleCount, sampleRate);
    audioBuffer.copyToChannel(samples, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const startAt = Math.max(this.audioContext.currentTime, this.playbackCursor);
    source.start(startAt);
    this.playbackCursor = startAt + audioBuffer.duration;
  }

  interrupt() {
    if (!this.audioContext) {
      return;
    }

    this.playbackCursor = this.audioContext.currentTime;
  }

  async dispose() {
    if (!this.audioContext) {
      return;
    }

    await this.audioContext.close();
    this.audioContext = null;
    this.playbackCursor = 0;
  }
}
