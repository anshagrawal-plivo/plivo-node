import { EventEmitter } from "events";

export interface WebSocketOptions {
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  headers?: Record<string, string>;
  wsOptions?: any;
}

export interface StreamStatus {
  isConnected: boolean;
  streamId: string | null;
  callUuid: string | null;
  reconnectAttempts: number;
}

export interface AudioData {
  timestamp: number;
  track: string;
  audioBuffer: Buffer;
  sequenceNumber?: number;
}

export interface StreamEvent {
  event: string;
  streamId?: string;
  callUuid?: string;
  [key: string]: any;
}

export interface MediaEvent extends StreamEvent {
  media: {
    timestamp: number;
    payload: string;
    track: string;
  };
  sequenceNumber?: number;
}

export declare class PlivoWebSocketClient extends EventEmitter {
  constructor(options?: WebSocketOptions);

  connect(
    streamUrl: string,
    options?: { headers?: Record<string, string>; wsOptions?: any }
  ): Promise<void>;
  disconnect(): void;

  sendAudio(
    audioBuffer: Buffer,
    options?: { timestamp?: number; track?: string }
  ): void;
  playAudio(audioUrl: string): void;
  stopAudio(): void;

  getStatus(): StreamStatus;

  // Event handlers
  on(event: "connected", listener: () => void): this;
  on(
    event: "disconnected",
    listener: (data: { code: number; reason: string }) => void
  ): this;
  on(event: "audioData", listener: (data: AudioData) => void): this;
  on(event: "rawAudioData", listener: (data: Buffer) => void): this;
  on(event: "streamStart", listener: (event: StreamEvent) => void): this;
  on(event: "streamStop", listener: (event: StreamEvent) => void): this;
  on(event: "streamError", listener: (event: StreamEvent) => void): this;
  on(event: "streamEvent", listener: (event: StreamEvent) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(
    event: "reconnecting",
    listener: (data: { attempt: number }) => void
  ): this;
  on(
    event: "reconnectFailed",
    listener: (data: { attempt: number; error: Error }) => void
  ): this;
}
