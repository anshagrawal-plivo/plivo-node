import { Transform } from "stream";

export declare const AudioFormats: {
  MULAW_8000: "audio/x-mulaw;rate=8000";
  L16_8000: "audio/x-l16;rate=8000";
  L16_16000: "audio/x-l16;rate=16000";
};

export interface AudioProcessorOptions {
  sampleRate?: number;
  format?: string;
  channels?: number;
  bitDepth?: number;
  enableNoiseSuppression?: boolean;
  enableEchoCancellation?: boolean;
  gainLevel?: number;
  chunkSize?: number;
}

export declare class AudioProcessor extends Transform {
  constructor(options?: AudioProcessorOptions);

  processAudioBuffer(audioBuffer: Buffer): Buffer;
  applyGain(buffer: Buffer, gain: number): Buffer;
  applyNoiseSuppression(buffer: Buffer): Buffer;
  applyEchoCancellation(buffer: Buffer): Buffer;
}

export declare class AudioConverter {
  static mulawToLinear(mulawBuffer: Buffer): Buffer;
  static linearToMulaw(linearBuffer: Buffer): Buffer;
  static mulawToLinearSample(mulawSample: number): number;
  static linearToMulawSample(linearSample: number): number;
  static resample(
    audioBuffer: Buffer,
    fromRate: number,
    toRate: number
  ): Buffer;
}

export interface AudioBufferManagerOptions {
  bufferSize?: number;
  sampleRate?: number;
  channels?: number;
}

export interface BufferStatus {
  bufferLength: number;
  bufferDurationMs: number;
  timestampCount: number;
}

export declare class AudioBufferManager {
  constructor(options?: AudioBufferManagerOptions);

  addAudio(audioData: Buffer, timestamp: number): void;
  getChunks(chunkSize?: number): Buffer[];
  getStatus(): BufferStatus;
  clear(): void;
}
