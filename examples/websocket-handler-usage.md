# Plivo WebSocket Handler Usage Guide

The `PlivoWebSocketHandler` wraps incoming WebSocket connections and provides methods to interact with Plivo's streaming capabilities. This is perfect for building WebSocket servers that need to manage Plivo audio streams.

## Overview

The WebSocket Handler acts as a bridge between:

- **Incoming WebSocket connections** (from your clients)
- **Plivo's streaming API** (for managing call audio streams)

## Architecture

```
Client WebSocket ←→ PlivoWebSocketHandler ←→ Plivo Streaming API
                                        ↓
                               PlivoStreamManager ←→ Plivo API
```

## Basic Usage

### 1. Server Setup

```javascript
const WebSocket = require("ws");
const plivo = require("plivo");
const { PlivoWebSocketHandlerFactory } = require("plivo/lib/streaming");

// Initialize Plivo client
const client = new plivo.Client();

// Create handler factory
const handlerFactory = new PlivoWebSocketHandlerFactory(client, {
  enableAudioProcessing: true,
  defaultStreamOptions: {
    contentType: "audio/x-l16;rate=8000",
    statusCallbackUrl: "https://your-app.com/status",
  },
});

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", (ws) => {
  // Create handler for this connection
  const handler = handlerFactory.createHandler(ws);

  // Handler automatically manages the connection
  console.log(`New connection: ${handler.connectionId}`);
});
```

### 2. Client Connection

```javascript
const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:8080");

ws.on("message", (data) => {
  const message = JSON.parse(data.toString());
  console.log("Received:", message);
});

// Start a stream
ws.send(
  JSON.stringify({
    type: "startStream",
    requestId: 1,
    callUuid: "your-call-uuid",
    serviceUrl: "wss://your-stream-service.com/stream",
    streamOptions: {
      bidirectional: true,
    },
  })
);
```

## Message Protocol

### Client to Server Messages

#### Start Stream

```javascript
{
  type: 'startStream',
  requestId: 1,
  callUuid: 'call-uuid',
  serviceUrl: 'wss://your-stream-service.com/stream',
  streamOptions: {
    bidirectional: true,
    contentType: 'audio/x-l16;rate=8000'
  }
}
```

#### Stop Stream

```javascript
{
  type: 'stopStream',
  requestId: 2,
  callUuid: 'call-uuid',
  streamId: 'optional-stream-id'
}
```

#### Send Audio

```javascript
{
  type: 'sendAudio',
  requestId: 3,
  callUuid: 'call-uuid',
  audioData: 'base64-encoded-audio-data',
  options: {
    track: 'inbound'
  }
}
```

#### Play Audio

```javascript
{
  type: 'playAudio',
  requestId: 4,
  callUuid: 'call-uuid',
  audioUrl: 'https://example.com/audio.wav'
}
```

#### Get Status

```javascript
{
  type: 'getStatus',
  requestId: 5
}
```

#### Ping

```javascript
{
  type: 'ping',
  requestId: 6
}
```

### Server to Client Messages

#### Connection Established

```javascript
{
  type: 'connected',
  connectionId: 'ws-1234567890-abc',
  timestamp: 1234567890123
}
```

#### Stream Started

```javascript
{
  type: 'streamStarted',
  callUuid: 'call-uuid',
  streamId: 'stream-id',
  wsClient: { /* WebSocket client info */ }
}
```

#### Audio Data

```javascript
{
  type: 'audioData',
  callUuid: 'call-uuid',
  timestamp: 1234567890123,
  track: 'inbound',
  audioData: 'base64-encoded-audio-data',
  sequenceNumber: 123
}
```

#### Response Messages

```javascript
{
  type: 'streamStartResponse',
  requestId: 1,
  success: true,
  callUuid: 'call-uuid',
  streamId: 'stream-id'
}
```

#### Error Messages

```javascript
{
  type: 'error',
  requestId: 1,
  message: 'Error description',
  error: 'Detailed error message',
  timestamp: 1234567890123
}
```

## Advanced Configuration

### Handler Options

```javascript
const handler = handlerFactory.createHandler(ws, {
  enableAudioProcessing: true,
  autoStartStream: false,
  defaultStreamOptions: {
    bidirectional: true,
    contentType: "audio/x-l16;rate=16000",
    streamTimeout: 3600,
  },
  // Audio processing options
  enableNoiseSuppression: true,
  enableEchoCancellation: true,
  gainLevel: 1.2,
});
```

### Factory Options

```javascript
const handlerFactory = new PlivoWebSocketHandlerFactory(client, {
  enableAudioProcessing: true,
  defaultStreamOptions: {
    statusCallbackUrl: "https://your-app.com/stream-status",
    extraHeaders: {
      Authorization: "Bearer your-token",
    },
  },
});
```

## Event Handling

### Handler Events

```javascript
handler.on("disconnected", (data) => {
  console.log(`Handler disconnected: ${data.code} - ${data.reason}`);
});

handler.on("error", (error) => {
  console.error("Handler error:", error);
});

handler.on("cleanup", () => {
  console.log("Handler cleaned up");
});
```

### Stream Events (forwarded to client)

The handler automatically forwards these events from the stream manager:

- `streamStarted`
- `streamStopped`
- `streamConnected`
- `streamDisconnected`
- `audioData`
- `streamError`

## Audio Processing

### Enable/Disable Processing

```javascript
// Enable audio processing
handler.setAudioProcessing(true, {
  enableNoiseSuppression: true,
  gainLevel: 1.5,
});

// Disable audio processing
handler.setAudioProcessing(false);
```

### Audio Format Conversion

```javascript
// Convert audio formats
const convertedAudio = handler.convertAudioFormat(
  audioBuffer,
  "mulaw",
  "linear"
);
```

## Monitoring and Management

### Get Handler Status

```javascript
const status = handler.getStatus();
console.log(status);
// Output:
// {
//   connectionId: 'ws-1234567890-abc',
//   isConnected: true,
//   activeStreamsCount: 2,
//   activeStreams: ['call-uuid-1', 'call-uuid-2'],
//   streamManagerStatus: { /* stream manager status */ },
//   audioProcessingEnabled: true,
//   options: { /* handler options */ }
// }
```

### Factory Management

```javascript
// Get all active handlers
const handlers = handlerFactory.getActiveHandlers();

// Get specific handler
const handler = handlerFactory.getHandler("ws-1234567890-abc");

// Close all handlers
handlerFactory.closeAllHandlers();

// Factory status
const factoryStatus = handlerFactory.getStatus();
```

## Error Handling

### Client-side Error Handling

```javascript
ws.on("message", (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === "error") {
    console.error(`Error (${message.requestId}): ${message.message}`);
    // Handle specific error
  }
});
```

### Server-side Error Handling

```javascript
handler.on("error", (error) => {
  console.error("Handler error:", error);

  // Optionally close connection
  handler.close(1011, "Internal server error");
});
```

## Production Considerations

### Authentication

```javascript
const wss = new WebSocket.Server({
  port: 8080,
  verifyClient: (info) => {
    // Verify authentication token
    const token = info.req.headers.authorization;
    return verifyToken(token);
  },
});
```

### Rate Limiting

```javascript
const rateLimiter = new Map();

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;

  // Check rate limit
  if (isRateLimited(ip)) {
    ws.close(1008, "Rate limited");
    return;
  }

  const handler = handlerFactory.createHandler(ws);
});
```

### Resource Cleanup

```javascript
process.on("SIGINT", () => {
  console.log("Shutting down...");
  handlerFactory.closeAllHandlers();
  wss.close();
  process.exit(0);
});
```

## Example Use Cases

### 1. Voice Bot Server

```javascript
// Create a voice bot that responds to audio
handler.on("message", async (audioData) => {
  if (audioData.type === "audioData") {
    const response = await processVoiceInput(audioData.audioData);

    // Send response back
    handler.sendMessage({
      type: "sendAudio",
      callUuid: audioData.callUuid,
      audioData: response.audioBuffer.toString("base64"),
    });
  }
});
```

### 2. Real-time Transcription

```javascript
// Transcribe incoming audio in real-time
handler.on("message", async (audioData) => {
  if (audioData.type === "audioData") {
    const transcription = await transcribeAudio(audioData.audioData);

    // Send transcription via WebSocket
    handler.sendMessage({
      type: "transcription",
      callUuid: audioData.callUuid,
      text: transcription.text,
      confidence: transcription.confidence,
    });
  }
});
```

### 3. Conference Bridge

```javascript
// Bridge multiple calls together
const activeCalls = new Map();

handler.on("message", (audioData) => {
  if (audioData.type === "audioData") {
    // Broadcast audio to all other calls in conference
    for (const [callUuid, callHandler] of activeCalls) {
      if (callUuid !== audioData.callUuid) {
        callHandler.sendAudio(callUuid, audioData.audioData);
      }
    }
  }
});
```

## Testing

See the example files:

- `websocket-handler-server.js` - Complete server implementation
- `websocket-handler-client.js` - Test client with full protocol support

```bash
# Start server
node websocket-handler-server.js

# Start client (in another terminal)
node websocket-handler-client.js
```

## API Reference

For complete API documentation, see the TypeScript definitions in `types/streaming/websocket-handler.d.ts`.
