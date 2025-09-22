/**
 * Basic Audio Streaming Example
 * Demonstrates how to stream audio from a call and process it in real-time
 */

const plivo = require("plivo");
const { PlivoStreamManager, StreamPresets } = require("../lib/streaming");

// Initialize Plivo client
const client = new plivo.Client(
  process.env.PLIVO_AUTH_ID,
  process.env.PLIVO_AUTH_TOKEN
);

// Initialize stream manager
const streamManager = new PlivoStreamManager(client, {
  audioProcessing: true,
  enableNoiseSuppression: true,
  gainLevel: 1.2,
});

async function startBasicStreaming() {
  try {
    // Example call UUID (replace with actual call UUID)
    const callUuid = "your-call-uuid-here";

    // Your WebSocket server URL
    const serviceUrl = "wss://your-server.com/audio-stream";

    // Set up event listeners
    streamManager.on("streamStarted", ({ callUuid, streamId }) => {
      console.log(
        `Stream started for call ${callUuid}, stream ID: ${streamId}`
      );
    });

    streamManager.on("audioData", ({ callUuid, audioBuffer, timestamp }) => {
      console.log(
        `Received audio data for call ${callUuid}: ${audioBuffer.length} bytes at ${timestamp}`
      );

      // Process audio data here
      // Example: Save to file, send to transcription service, etc.
      processAudioData(audioBuffer);
    });

    streamManager.on("streamError", ({ callUuid, error }) => {
      console.error(`Stream error for call ${callUuid}:`, error);
    });

    streamManager.on("streamStopped", ({ callUuid }) => {
      console.log(`Stream stopped for call ${callUuid}`);
    });

    // Start the stream
    const wsClient = await streamManager.startStream(
      callUuid,
      serviceUrl,
      StreamPresets.BASIC
    );

    console.log("Audio streaming started successfully");

    // Stop the stream after 60 seconds (for demo purposes)
    setTimeout(async () => {
      await streamManager.stopStream(callUuid);
      console.log("Stream stopped");
    }, 60000);
  } catch (error) {
    console.error("Error starting stream:", error);
  }
}

function processAudioData(audioBuffer) {
  // Example audio processing
  console.log(`Processing ${audioBuffer.length} bytes of audio data`);

  // You can:
  // 1. Save to file
  // 2. Send to transcription service
  // 3. Apply real-time audio analysis
  // 4. Stream to another service
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  streamManager.cleanup();
  process.exit(0);
});

// Start the example
if (require.main === module) {
  startBasicStreaming();
}

module.exports = { startBasicStreaming };
