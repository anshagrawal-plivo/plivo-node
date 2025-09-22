export * from "./websocket-client";
export * from "./audio-processor";
export * from "./stream-manager";
export * from "./websocket-handler";

import { PlivoWebSocketClient } from "./websocket-client";
import {
  AudioProcessor,
  AudioConverter,
  AudioBufferManager,
  AudioFormats,
} from "./audio-processor";
import {
  PlivoStreamManager,
  StreamEvents,
  StreamPresets,
} from "./stream-manager";
import {
  PlivoWebSocketHandler,
  PlivoWebSocketHandlerFactory,
  WebSocketMessageTypes,
} from "./websocket-handler";

export declare const Streaming: {
  Client: typeof PlivoWebSocketClient;
  Manager: typeof PlivoStreamManager;
  Handler: typeof PlivoWebSocketHandler;
  HandlerFactory: typeof PlivoWebSocketHandlerFactory;
  AudioProcessor: typeof AudioProcessor;
  AudioConverter: typeof AudioConverter;
  AudioBufferManager: typeof AudioBufferManager;
  Formats: typeof AudioFormats;
  Events: typeof StreamEvents;
  Presets: typeof StreamPresets;
  MessageTypes: typeof WebSocketMessageTypes;
};

export default Streaming;
