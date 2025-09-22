import { EventEmitter } from "events";
import { PlivoWebSocketClient } from "./websocket-client";
import { AudioProcessor } from "./audio-processor";

export interface StreamManagerOptions {
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  audioProcessing?: boolean;
  bufferSize?: number;
  [key: string]: any;
}

export interface StreamOptions {
  bidirectional?: boolean;
  audioTrack?: "inbound" | "outbound" | "both";
  streamTimeout?: number;
  statusCallbackUrl?: string;
  statusCallbackMethod?: "GET" | "POST";
  contentType?: string;
  extraHeaders?: Record<string, string>;
  keepCallAlive?: boolean;
}

export interface StreamInfo {
  wsClient: PlivoWebSocketClient;
  streamId: string;
  options: StreamOptions;
}

export interface StreamManagerStatus {
  activeStreamCount: number;
  streams: Record<
    string,
    {
      streamId: string;
      wsStatus: any;
      options: StreamOptions;
    }
  >;
  audioProcessingEnabled: boolean;
}

export declare const StreamEvents: {
  STREAM_STARTED: "streamStarted";
  STREAM_STOPPED: "streamStopped";
  STREAM_CONNECTED: "streamConnected";
  STREAM_DISCONNECTED: "streamDisconnected";
  STREAM_ERROR: "streamError";
  AUDIO_DATA: "audioData";
  RAW_AUDIO_DATA: "rawAudioData";
  PROCESSED_AUDIO_DATA: "processedAudioData";
  STREAM_RECONNECTING: "streamReconnecting";
  STREAM_RECONNECT_FAILED: "streamReconnectFailed";
  AUDIO_PROCESSING_ERROR: "audioProcessingError";
};

export declare const StreamPresets: {
  BASIC: StreamOptions;
  BIDIRECTIONAL: StreamOptions;
  HIGH_QUALITY: StreamOptions;
  TRANSCRIPTION: StreamOptions;
  VOICE_BOT: StreamOptions;
};

export declare class PlivoStreamManager extends EventEmitter {
  constructor(client: any, options?: StreamManagerOptions);

  startStream(
    callUuid: string,
    serviceUrl: string,
    streamOptions?: StreamOptions
  ): Promise<PlivoWebSocketClient>;
  stopStream(callUuid: string, streamId?: string): Promise<void>;
  getStreamInfo(callUuid: string, streamId: string): Promise<any>;
  getAllStreams(callUuid: string): Promise<any>;

  sendAudio(
    callUuid: string,
    audioBuffer: Buffer,
    options?: { processAudio?: boolean; [key: string]: any }
  ): void;
  playAudio(callUuid: string, audioUrl: string): void;
  stopAudio(callUuid: string): void;

  getStatus(): StreamManagerStatus;
  cleanup(): void;

  // Event handlers
  on(
    event: "streamStarted",
    listener: (data: {
      callUuid: string;
      streamId: string;
      wsClient: PlivoWebSocketClient;
    }) => void
  ): this;
  on(
    event: "streamStopped",
    listener: (data: { callUuid: string; streamId?: string }) => void
  ): this;
  on(
    event: "streamConnected",
    listener: (data: { callUuid: string }) => void
  ): this;
  on(
    event: "streamDisconnected",
    listener: (data: { callUuid: string; code: number; reason: string }) => void
  ): this;
  on(
    event: "streamError",
    listener: (data: { callUuid: string; error: Error }) => void
  ): this;
  on(
    event: "audioData",
    listener: (data: {
      callUuid: string;
      timestamp: number;
      track: string;
      audioBuffer: Buffer;
      sequenceNumber?: number;
    }) => void
  ): this;
  on(
    event: "rawAudioData",
    listener: (data: { callUuid: string; audioBuffer: Buffer }) => void
  ): this;
  on(
    event: "processedAudioData",
    listener: (data: { callUuid: string; [key: string]: any }) => void
  ): this;
  on(
    event: "streamReconnecting",
    listener: (data: { callUuid: string; attempt: number }) => void
  ): this;
  on(
    event: "streamReconnectFailed",
    listener: (data: {
      callUuid: string;
      attempt: number;
      error: Error;
    }) => void
  ): this;
  on(
    event: "audioProcessingError",
    listener: (data: { callUuid: string; error: Error }) => void
  ): this;
}
