/**
 * Bidirectional Audio Streaming Example
 * Demonstrates two-way audio streaming for real-time voice processing
 */

const plivo = require("plivo");
const fs = require("fs");
const path = require("path");
const {
  PlivoStreamManager,
  StreamPresets,
  AudioConverter,
} = require("../lib/streaming");

// Initialize Plivo client
const client = new plivo.Client(
  process.env.PLIVO_AUTH_ID,
  process.env.PLIVO_AUTH_TOKEN
);

// Initialize stream manager with audio processing
const streamManager = new PlivoStreamManager(client, {
  audioProcessing: true,
  enableNoiseSuppression: true,
  enableEchoCancellation: true,
  gainLevel: 1.0,
});

class VoiceBot {
  constructor() {
    this.audioQueue = [];
    this.isProcessing = false;
    this.responses = [
      "Hello! How can I help you today?",
      "I understand. Let me process that for you.",
      "Thank you for calling. Is there anything else I can help with?",
    ];
    this.responseIndex = 0;
  }

  async processVoiceInput(audioBuffer, callUuid) {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      // Simulate voice recognition and processing
      console.log("Processing voice input...");

      // In a real implementation, you would:
      // 1. Send audio to speech-to-text service
      // 2. Process the text with NLP
      // 3. Generate appropriate response
      // 4. Convert response to speech

      await this.simulateProcessing();

      // Generate response audio
      const responseText =
        this.responses[this.responseIndex % this.responses.length];
      this.responseIndex++;

      console.log(`Bot response: "${responseText}"`);

      // In a real implementation, convert text to speech
      // For demo, we'll play a pre-recorded response
      await this.playResponse(callUuid, responseText);
    } catch (error) {
      console.error("Error processing voice input:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  async simulateProcessing() {
    // Simulate processing delay
    return new Promise((resolve) => setTimeout(resolve, 1000));
  }

  async playResponse(callUuid, responseText) {
    try {
      // In a real implementation, you would:
      // 1. Convert text to speech
      // 2. Get audio buffer
      // 3. Send audio to stream

      console.log(`Playing response: "${responseText}"`);

      // For demo, we'll use the playAudio method with a URL
      // In production, you'd generate this audio dynamically
      const audioUrl = "https://example.com/audio-responses/response.wav";
      streamManager.playAudio(callUuid, audioUrl);
    } catch (error) {
      console.error("Error playing response:", error);
    }
  }
}

async function startBidirectionalStreaming() {
  const voiceBot = new VoiceBot();

  try {
    // Example call UUID (replace with actual call UUID)
    const callUuid = "your-call-uuid-here";

    // Your WebSocket server URL
    const serviceUrl = "wss://your-server.com/bidirectional-stream";

    // Set up event listeners
    streamManager.on("streamStarted", ({ callUuid, streamId }) => {
      console.log(
        `Bidirectional stream started for call ${callUuid}, stream ID: ${streamId}`
      );
    });

    streamManager.on(
      "audioData",
      async ({ callUuid, audioBuffer, timestamp, track }) => {
        console.log(
          `Received ${track} audio: ${audioBuffer.length} bytes at ${timestamp}`
        );

        if (track === "inbound") {
          // Process incoming audio from caller
          await voiceBot.processVoiceInput(audioBuffer, callUuid);
        }
      }
    );

    streamManager.on("streamError", ({ callUuid, error }) => {
      console.error(`Stream error for call ${callUuid}:`, error);
    });

    streamManager.on("streamConnected", ({ callUuid }) => {
      console.log(`WebSocket connected for call ${callUuid}`);

      // Send welcome message
      setTimeout(() => {
        voiceBot.playResponse(callUuid, voiceBot.responses[0]);
      }, 1000);
    });

    // Start bidirectional stream
    const wsClient = await streamManager.startStream(callUuid, serviceUrl, {
      ...StreamPresets.BIDIRECTIONAL,
      statusCallbackUrl: "https://your-server.com/stream-status",
      extraHeaders: {
        "X-Custom-Header": "bidirectional-voice-bot",
      },
    });

    console.log("Bidirectional streaming started successfully");

    // Keep the stream running
    console.log("Voice bot is now active. Press Ctrl+C to stop.");
  } catch (error) {
    console.error("Error starting bidirectional stream:", error);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down voice bot...");
  streamManager.cleanup();
  process.exit(0);
});

// Start the example
if (require.main === module) {
  startBidirectionalStreaming();
}

module.exports = { startBidirectionalStreaming, VoiceBot };
