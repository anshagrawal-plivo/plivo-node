/**
 * Real-time Transcription Example
 * Demonstrates how to transcribe audio in real-time using streaming
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

// Initialize stream manager
const streamManager = new PlivoStreamManager(client, {
  audioProcessing: true,
  sampleRate: 16000, // Higher sample rate for better transcription
  enableNoiseSuppression: true,
});

class RealTimeTranscriber {
  constructor(options = {}) {
    this.options = {
      language: "en-US",
      enablePunctuation: true,
      enableWordConfidence: true,
      interimResults: true,
      ...options,
    };

    this.audioBuffer = Buffer.alloc(0);
    this.transcriptionBuffer = [];
    this.isTranscribing = false;
  }

  async processAudioChunk(audioBuffer, callUuid) {
    try {
      // Accumulate audio data
      this.audioBuffer = Buffer.concat([this.audioBuffer, audioBuffer]);

      // Process in chunks (e.g., every 1 second of audio)
      const chunkSize = 32000; // 1 second at 16kHz, 16-bit

      while (this.audioBuffer.length >= chunkSize) {
        const chunk = this.audioBuffer.slice(0, chunkSize);
        this.audioBuffer = this.audioBuffer.slice(chunkSize);

        await this.transcribeChunk(chunk, callUuid);
      }
    } catch (error) {
      console.error("Error processing audio chunk:", error);
    }
  }

  async transcribeChunk(audioChunk, callUuid) {
    if (this.isTranscribing) return;

    this.isTranscribing = true;

    try {
      // In a real implementation, you would send this to a transcription service
      // such as Google Speech-to-Text, AWS Transcribe, Azure Speech, etc.

      const transcription = await this.simulateTranscription(audioChunk);

      if (transcription && transcription.text) {
        this.handleTranscriptionResult(transcription, callUuid);
      }
    } catch (error) {
      console.error("Transcription error:", error);
    } finally {
      this.isTranscribing = false;
    }
  }

  async simulateTranscription(audioChunk) {
    // Simulate transcription API call
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Return simulated transcription result
    const sampleTexts = [
      "Hello, I need help with my account",
      "Can you tell me my current balance?",
      "I want to make a payment",
      "What are your business hours?",
      "Thank you for your assistance",
    ];

    return {
      text: sampleTexts[Math.floor(Math.random() * sampleTexts.length)],
      confidence: 0.85 + Math.random() * 0.15,
      isFinal: Math.random() > 0.3,
      timestamp: Date.now(),
    };
  }

  handleTranscriptionResult(result, callUuid) {
    console.log(
      `[${callUuid}] Transcription: "${
        result.text
      }" (confidence: ${result.confidence.toFixed(2)})`
    );

    // Store transcription
    this.transcriptionBuffer.push({
      ...result,
      callUuid,
      timestamp: new Date().toISOString(),
    });

    // If it's a final result, save to file
    if (result.isFinal) {
      this.saveTranscription(result, callUuid);
    }

    // Emit event for real-time processing
    streamManager.emit("transcription", {
      callUuid,
      text: result.text,
      confidence: result.confidence,
      isFinal: result.isFinal,
    });
  }

  saveTranscription(result, callUuid) {
    const filename = `transcription-${callUuid}-${Date.now()}.txt`;
    const filepath = path.join(__dirname, "transcriptions", filename);

    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save transcription
    const transcriptionData = {
      callUuid,
      timestamp: new Date().toISOString(),
      text: result.text,
      confidence: result.confidence,
    };

    fs.appendFileSync(filepath, JSON.stringify(transcriptionData) + "\n");
    console.log(`Transcription saved to: ${filepath}`);
  }

  getFullTranscription() {
    return this.transcriptionBuffer;
  }

  clearBuffer() {
    this.transcriptionBuffer = [];
    this.audioBuffer = Buffer.alloc(0);
  }
}

async function startTranscriptionStream() {
  const transcriber = new RealTimeTranscriber({
    language: "en-US",
    enablePunctuation: true,
    interimResults: true,
  });

  try {
    // Example call UUID (replace with actual call UUID)
    const callUuid = "your-call-uuid-here";

    // Your WebSocket server URL
    const serviceUrl = "wss://your-server.com/transcription-stream";

    // Set up event listeners
    streamManager.on("streamStarted", ({ callUuid, streamId }) => {
      console.log(
        `Transcription stream started for call ${callUuid}, stream ID: ${streamId}`
      );
    });

    streamManager.on(
      "audioData",
      async ({ callUuid, audioBuffer, timestamp }) => {
        // Convert to 16kHz if needed
        let processedAudio = audioBuffer;

        // If audio is 8kHz, upsample to 16kHz for better transcription
        if (audioBuffer.length * 2 === 1600) {
          // 8kHz detection
          processedAudio = AudioConverter.resample(audioBuffer, 8000, 16000);
        }

        await transcriber.processAudioChunk(processedAudio, callUuid);
      }
    );

    streamManager.on(
      "transcription",
      ({ callUuid, text, confidence, isFinal }) => {
        const status = isFinal ? "FINAL" : "INTERIM";
        console.log(`[${status}] ${text} (${(confidence * 100).toFixed(1)}%)`);
      }
    );

    streamManager.on("streamError", ({ callUuid, error }) => {
      console.error(`Stream error for call ${callUuid}:`, error);
    });

    streamManager.on("streamStopped", ({ callUuid }) => {
      console.log(`Transcription stream stopped for call ${callUuid}`);

      // Save final transcription
      const fullTranscription = transcriber.getFullTranscription();
      const filename = `final-transcription-${callUuid}.json`;
      fs.writeFileSync(filename, JSON.stringify(fullTranscription, null, 2));
      console.log(`Final transcription saved to: ${filename}`);
    });

    // Start the transcription stream
    const wsClient = await streamManager.startStream(callUuid, serviceUrl, {
      ...StreamPresets.TRANSCRIPTION,
      statusCallbackUrl: "https://your-server.com/transcription-status",
    });

    console.log("Real-time transcription started successfully");
    console.log(
      "Transcriptions will be saved to the 'transcriptions' directory"
    );

    // Keep the stream running
    console.log("Transcription is active. Press Ctrl+C to stop.");
  } catch (error) {
    console.error("Error starting transcription stream:", error);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down transcription service...");
  streamManager.cleanup();
  process.exit(0);
});

// Start the example
if (require.main === module) {
  startTranscriptionStream();
}

module.exports = { startTranscriptionStream, RealTimeTranscriber };
