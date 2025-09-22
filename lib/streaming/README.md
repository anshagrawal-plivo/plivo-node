# Plivo WebSocket Audio Streaming

This module provides comprehensive WebSocket audio streaming capabilities for the Plivo Node.js SDK, enabling real-time audio processing, bidirectional streaming, and advanced audio manipulation.

## Features

- **Real-time Audio Streaming**: Stream audio from calls over WebSocket connections
- **Bidirectional Communication**: Send audio back to calls in real-time
- **Audio Processing**: Built-in noise suppression, echo cancellation, and gain control
- **Format Support**: μ-law, Linear PCM (8kHz/16kHz), automatic conversion
- **High-level Management**: Easy-to-use stream manager with event handling
- **TypeScript Support**: Full TypeScript definitions included
- **Production Ready**: Automatic reconnection, error handling, and monitoring

## Quick Start

```javascript
const plivo = require("plivo");
const client = new plivo.Client();

// Basic audio streaming
client.streaming.on("audioData", ({ callUuid, audioBuffer }) => {
  console.log(
    `Received audio for call ${callUuid}: ${audioBuffer.length} bytes`
  );
});

const wsClient = await client.streaming.startStream(
  "call-uuid",
  "wss://your-server.com/stream"
);
```

## Core Components

### PlivoStreamManager

High-level interface for managing audio streams:

```javascript
const streamManager = new PlivoStreamManager(client, {
  audioProcessing: true,
  enableNoiseSuppression: true,
  gainLevel: 1.2,
});
```

### PlivoWebSocketClient

Low-level WebSocket client for direct stream control:

```javascript
const wsClient = new PlivoWebSocketClient({
  autoReconnect: true,
  maxReconnectAttempts: 5,
});
```

### PlivoWebSocketHandler

WebSocket handler that wraps incoming connections and provides Plivo streaming methods:

```javascript
const { PlivoWebSocketHandlerFactory } = require("plivo/lib/streaming");

const handlerFactory = new PlivoWebSocketHandlerFactory(client);

// On WebSocket server connection
wss.on("connection", (ws) => {
  const handler = handlerFactory.createHandler(ws);
  // Handler automatically manages Plivo streaming for this connection
});
```

### AudioProcessor

Real-time audio processing pipeline:

```javascript
const processor = new AudioProcessor({
  enableNoiseSuppression: true,
  enableEchoCancellation: true,
  gainLevel: 1.5,
});
```

## Common Use Cases

### 1. Real-time Transcription

```javascript
const { StreamPresets } = require("plivo/lib/streaming");

await client.streaming.startStream(callUuid, serviceUrl, {
  ...StreamPresets.TRANSCRIPTION,
  statusCallbackUrl: "https://your-app.com/transcription-status",
});

client.streaming.on("audioData", async ({ audioBuffer }) => {
  const transcription = await transcribeAudio(audioBuffer);
  console.log("Transcription:", transcription);
});
```

### 2. Voice Bot / Assistant

```javascript
await client.streaming.startStream(callUuid, serviceUrl, {
  ...StreamPresets.VOICE_BOT,
  bidirectional: true,
});

client.streaming.on("audioData", async ({ callUuid, audioBuffer }) => {
  const response = await processVoiceInput(audioBuffer);

  // Send audio response back
  client.streaming.sendAudio(callUuid, response.audioBuffer);
});
```

### 3. Call Recording with Processing

```javascript
const fs = require("fs");
const recordingStream = fs.createWriteStream("call-recording.raw");

client.streaming.on("audioData", ({ audioBuffer }) => {
  recordingStream.write(audioBuffer);
});
```

### 4. Real-time Audio Analysis

```javascript
client.streaming.on("processedAudioData", ({ audioBuffer }) => {
  const volume = calculateVolume(audioBuffer);
  const frequency = analyzeFrequency(audioBuffer);

  console.log(`Volume: ${volume}dB, Dominant frequency: ${frequency}Hz`);
});
```

## Stream Presets

Pre-configured settings for common scenarios:

- **BASIC**: Simple inbound audio streaming
- **BIDIRECTIONAL**: Two-way audio communication
- **HIGH_QUALITY**: 16kHz audio for better quality
- **TRANSCRIPTION**: Optimized for speech-to-text
- **VOICE_BOT**: Interactive voice applications

## Audio Formats

Supported audio formats with automatic conversion:

```javascript
import { AudioFormats, AudioConverter } from "plivo/lib/streaming";

// Convert between formats
const linearAudio = AudioConverter.mulawToLinear(mulawBuffer);
const mulawAudio = AudioConverter.linearToMulaw(linearBuffer);

// Resample audio
const resampledAudio = AudioConverter.resample(audioBuffer, 8000, 16000);
```

## Event Handling

The streaming module emits various events for different stages:

```javascript
client.streaming.on("streamStarted", ({ callUuid, streamId }) => {
  console.log(`Stream ${streamId} started for call ${callUuid}`);
});

client.streaming.on("streamError", ({ callUuid, error }) => {
  console.error(`Stream error for ${callUuid}:`, error);
});

client.streaming.on("audioData", ({ callUuid, audioBuffer, timestamp }) => {
  // Process incoming audio
});
```

## Configuration Options

### Stream Manager Options

```javascript
const options = {
  autoReconnect: true, // Auto-reconnect on disconnect
  maxReconnectAttempts: 5, // Max reconnection attempts
  audioProcessing: true, // Enable audio processing
  bufferSize: 1600, // Audio buffer size
  enableNoiseSuppression: true, // Noise suppression
  enableEchoCancellation: true, // Echo cancellation
  gainLevel: 1.0, // Audio gain multiplier
};
```

### Stream Options

```javascript
const streamOptions = {
  bidirectional: false, // Enable two-way audio
  audioTrack: "inbound", // 'inbound', 'outbound', 'both'
  contentType: "audio/x-l16;rate=8000",
  streamTimeout: 3600, // Stream timeout in seconds
  statusCallbackUrl: "https://your-app.com/status",
  extraHeaders: {
    // Custom headers for WebSocket
    "X-Custom-Header": "value",
  },
};
```

## Error Handling

```javascript
client.streaming.on("streamError", ({ callUuid, error }) => {
  console.error(`Stream error for call ${callUuid}:`, error);

  // Implement retry logic or fallback
  setTimeout(() => {
    client.streaming.startStream(callUuid, serviceUrl);
  }, 5000);
});

client.streaming.on("streamReconnectFailed", ({ callUuid, attempt }) => {
  console.error(
    `Failed to reconnect stream for ${callUuid} after ${attempt} attempts`
  );
});
```

## Production Considerations

1. **Resource Management**: Always clean up streams when done:

   ```javascript
   process.on("SIGINT", () => {
     client.streaming.cleanup();
     process.exit(0);
   });
   ```

2. **Monitoring**: Track stream health and performance:

   ```javascript
   const status = client.streaming.getStatus();
   console.log(`Active streams: ${status.activeStreamCount}`);
   ```

3. **Security**: Use secure WebSocket connections (WSS) and validate headers

4. **Scalability**: Consider using multiple WebSocket servers for high-volume scenarios

## WebSocket Server Implementation

A complete WebSocket server example is provided in `examples/streaming-websocket-server.js` that demonstrates:

- Handling Plivo stream events
- Audio data processing
- Bidirectional communication
- Recording capabilities
- Status callbacks

## Dependencies

The streaming module requires the `ws` package for WebSocket functionality:

```bash
npm install ws
```

## API Reference

### Client Integration

```javascript
// Access via main client
const client = new plivo.Client();
client.streaming.startStream(callUuid, serviceUrl, options);

// Or import directly
const { PlivoStreamManager } = require("plivo/lib/streaming");
const streamManager = new PlivoStreamManager(client);
```

For complete API documentation, see the TypeScript definitions in the `types/streaming/` directory.

## Examples

See the `examples/` directory for complete working examples:

- `streaming-basic.js` - Basic audio streaming
- `streaming-bidirectional.js` - Two-way communication
- `streaming-transcription.js` - Real-time transcription
- `streaming-websocket-server.js` - WebSocket server implementation

## License

This module is part of the Plivo Node.js SDK and follows the same MIT license.
