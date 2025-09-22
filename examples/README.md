# Plivo Streaming Examples

This directory contains comprehensive examples demonstrating how to use Plivo's WebSocket audio streaming capabilities.

## Examples Overview

### 1. Basic Audio Streaming (`streaming-basic.js`)

- Simple one-way audio streaming from calls
- Audio data processing and logging
- Event handling and cleanup
- Perfect for getting started with streaming

**Usage:**

```bash
PLIVO_AUTH_ID=your_id PLIVO_AUTH_TOKEN=your_token node streaming-basic.js
```

### 2. Bidirectional Streaming (`streaming-bidirectional.js`)

- Two-way audio communication
- Voice bot implementation with automated responses
- Real-time audio processing and response generation
- Demonstrates interactive voice applications

**Features:**

- Voice input processing
- Automated response generation
- Bidirectional audio flow
- Voice bot interaction patterns

### 3. Real-time Transcription (`streaming-transcription.js`)

- Live speech-to-text conversion
- High-quality audio processing for transcription
- Transcription result storage and management
- Optimized for speech recognition services

**Features:**

- Real-time audio transcription
- Confidence scoring
- Interim and final results
- Transcription file storage

### 4. WebSocket Server (`streaming-websocket-server.js`)

- Complete WebSocket server implementation
- Handles Plivo stream events and audio data
- Recording capabilities
- Status callbacks and monitoring

**Features:**

- Production-ready WebSocket server
- Audio recording to files
- Stream event handling
- HTTP status endpoint
- Real-time monitoring

## Setup Instructions

1. **Install Dependencies**

   ```bash
   npm install plivo ws express
   ```

2. **Set Environment Variables**

   ```bash
   export PLIVO_AUTH_ID="your_auth_id"
   export PLIVO_AUTH_TOKEN="your_auth_token"
   ```

3. **Start WebSocket Server (if needed)**

   ```bash
   node streaming-websocket-server.js
   ```

4. **Run Examples**
   ```bash
   node streaming-basic.js
   node streaming-bidirectional.js
   node streaming-transcription.js
   ```

## Integration Patterns

### XML Response for Starting Streams

```xml
<Response>
  <Stream bidirectional="true"
          contentType="audio/x-l16;rate=8000"
          statusCallbackUrl="https://your-app.com/status">
    wss://your-server.com/audio-stream
  </Stream>
</Response>
```

### Basic Stream Setup

```javascript
const plivo = require("plivo");
const client = new plivo.Client();

// Set up event listeners
client.streaming.on("audioData", ({ callUuid, audioBuffer }) => {
  // Process audio data
  console.log(`Audio from ${callUuid}: ${audioBuffer.length} bytes`);
});

// Start streaming
const stream = await client.streaming.startStream(
  callUuid,
  "wss://your-server.com/stream",
  { bidirectional: true }
);
```

### Advanced Audio Processing

```javascript
const { AudioProcessor, AudioConverter } = require("plivo/lib/streaming");

const processor = new AudioProcessor({
  enableNoiseSuppression: true,
  enableEchoCancellation: true,
  gainLevel: 1.2,
});

client.streaming.on("audioData", ({ audioBuffer }) => {
  const processedAudio = processor.processAudioBuffer(audioBuffer);
  // Use processed audio for transcription, analysis, etc.
});
```

## Configuration Examples

### Stream Presets

```javascript
const { StreamPresets } = require("plivo/lib/streaming");

// For transcription
await client.streaming.startStream(
  callUuid,
  serviceUrl,
  StreamPresets.TRANSCRIPTION
);

// For voice bots
await client.streaming.startStream(
  callUuid,
  serviceUrl,
  StreamPresets.VOICE_BOT
);

// For high-quality recording
await client.streaming.startStream(
  callUuid,
  serviceUrl,
  StreamPresets.HIGH_QUALITY
);
```

### Custom Configuration

```javascript
const customConfig = {
  bidirectional: true,
  audioTrack: "both",
  contentType: "audio/x-l16;rate=16000",
  streamTimeout: 7200,
  statusCallbackUrl: "https://your-app.com/callbacks",
  extraHeaders: {
    Authorization: "Bearer your-token",
    "X-Session-ID": "unique-session-id",
  },
};

await client.streaming.startStream(callUuid, serviceUrl, customConfig);
```

## Production Deployment

### Environment Setup

```bash
# Production environment variables
export PLIVO_AUTH_ID="your_production_auth_id"
export PLIVO_AUTH_TOKEN="your_production_auth_token"
export WS_PORT="8080"
export HTTP_PORT="3000"
export RECORDING_PATH="/app/recordings"
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080 3000
CMD ["node", "streaming-websocket-server.js"]
```

### Load Balancing

For high-volume deployments, use multiple WebSocket servers:

```javascript
const serviceUrls = [
  "wss://stream1.your-domain.com",
  "wss://stream2.your-domain.com",
  "wss://stream3.your-domain.com",
];

const selectedUrl = serviceUrls[Math.floor(Math.random() * serviceUrls.length)];
await client.streaming.startStream(callUuid, selectedUrl, options);
```

## Monitoring and Logging

### Stream Health Monitoring

```javascript
setInterval(() => {
  const status = client.streaming.getStatus();
  console.log(`Active streams: ${status.activeStreamCount}`);

  // Log per-stream details
  Object.entries(status.streams).forEach(([callUuid, streamInfo]) => {
    console.log(
      `Call ${callUuid}: ${
        streamInfo.wsStatus.isConnected ? "Connected" : "Disconnected"
      }`
    );
  });
}, 30000);
```

### Error Tracking

```javascript
client.streaming.on("streamError", ({ callUuid, error }) => {
  console.error(`Stream error for ${callUuid}:`, error);
  // Send to monitoring service (e.g., Sentry, DataDog)
  errorTracker.captureError(error, { callUuid });
});
```

## Testing

### Unit Tests

```javascript
const { PlivoStreamManager } = require("plivo/lib/streaming");

describe("PlivoStreamManager", () => {
  it("should start stream successfully", async () => {
    const client = new plivo.Client();
    const manager = new PlivoStreamManager(client);

    const stream = await manager.startStream(
      "test-call-uuid",
      "ws://localhost:8080"
    );

    expect(stream).toBeDefined();
  });
});
```

### Integration Tests

```javascript
// Test with actual Plivo API
const callResponse = await client.calls.create(
  "+1234567890",
  "+0987654321",
  "https://your-app.com/answer"
);

const stream = await client.streaming.startStream(
  callResponse.requestUuid,
  "wss://your-server.com/test-stream"
);
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failures**

   - Check firewall settings
   - Verify SSL certificates for WSS
   - Ensure WebSocket server is running

2. **Audio Quality Issues**

   - Use appropriate content types
   - Enable audio processing features
   - Check network bandwidth

3. **Stream Disconnections**
   - Enable auto-reconnect
   - Implement proper error handling
   - Monitor network stability

### Debug Mode

```javascript
const client = new plivo.Client(authId, authToken, {
  streaming: {
    debug: true,
    logLevel: "verbose",
  },
});
```

## Support

For additional support and documentation:

- [Plivo Audio Streaming Documentation](https://docs.plivo.com/docs/voice/audio-streaming/)
- [Plivo Node.js SDK Documentation](https://docs.plivo.com/docs/sdk/server/node-sdk/)
- [GitHub Issues](https://github.com/plivo/plivo-node/issues)

## License

These examples are part of the Plivo Node.js SDK and are licensed under the MIT License.
