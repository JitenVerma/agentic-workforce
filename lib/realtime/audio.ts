export const PCM_SAMPLE_RATE = 24_000;
export const USER_SPEECH_THRESHOLD = 0.018;
export const USER_SILENCE_GRACE_MS = 700;
export const MIN_ACTIVE_FRAMES = 2;

export function toBase64(bytes: Uint8Array) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

export function fromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function pcmFloatTo16Bit(input: Float32Array) {
  const output = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return new Uint8Array(output.buffer);
}

export function extractSampleRate(mimeType: string | undefined) {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : PCM_SAMPLE_RATE;
}

export function computeRms(input: Float32Array) {
  if (input.length === 0) {
    return 0;
  }

  let sumSquares = 0;

  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / input.length);
}
