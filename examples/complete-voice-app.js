/**
 * Complete Voice Application Example
 * Demonstrates a full voice application using Plivo's WebSocket Handler
 *
 * This example shows:
 * - Incoming call handling
 * - WebSocket stream management
 * - Real-time audio processing
 * - Voice bot responses
 * - Call recording and transcription
 */

const express = require("express");
const WebSocket = require("ws");
const plivo = require("plivo");
const fs = require("fs");
const path = require("path");
const {
  PlivoWebSocketHandlerFactory,
  WebSocketMessageTypes,
} = require("../lib/streaming/websocket-handler");

class CompleteVoiceApp {
  constructor() {
    // Initialize Plivo client
    this.plivoClient = new plivo.Client(
      process.env.PLIVO_AUTH_ID,
      process.env.PLIVO_AUTH_TOKEN
    );

    // Express app for HTTP endpoints
    this.app = express();
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // WebSocket handler factory
    this.handlerFactory = new PlivoWebSocketHandlerFactory(this.plivoClient, {
      enableAudioProcessing: true,
      defaultStreamOptions: {
        contentType: "audio/x-l16;rate=8000",
        statusCallbackUrl: "https://your-app.com/stream-status",
        bidirectional: true,
      },
    });

    // Application state
    this.activeCalls = new Map();
    this.callHandlers = new Map();
    this.recordings = new Map();

    this.setupHTTPRoutes();
    this.setupWebSocketServer();
  }

  setupHTTPRoutes() {
    // Answer URL - called when someone dials your Plivo number
    this.app.post("/answer", (req, res) => {
      console.log("📞 Incoming call:", req.body);

      const { CallUUID, From, To } = req.body;

      // Store call information
      this.activeCalls.set(CallUUID, {
        callUuid: CallUUID,
        from: From,
        to: To,
        startTime: new Date(),
        status: "answered",
      });

      // Generate Plivo XML response
      const response = new plivo.Response();

      // Welcome message
      response.addSpeak(
        "Hello! Welcome to our voice application. Please hold while we connect you to our AI assistant.",
        {
          voice: "WOMAN",
          language: "en-US",
        }
      );

      // Start audio streaming
      response.addStream(`wss://your-domain.com:8080/stream/${CallUUID}`, {
        bidirectional: true,
        contentType: "audio/x-l16;rate=8000",
        statusCallbackUrl: `https://your-app.com/stream-status/${CallUUID}`,
        keepCallAlive: true,
      });

      res.type("text/xml");
      res.send(response.toXML());
    });

    // Hangup URL - called when call ends
    this.app.post("/hangup", (req, res) => {
      const { CallUUID } = req.body;
      console.log("📱 Call ended:", CallUUID);

      this.handleCallEnd(CallUUID);
      res.status(200).send("OK");
    });

    // Stream status callback
    this.app.post("/stream-status/:callUuid", (req, res) => {
      const { callUuid } = req.params;
      console.log(`🔊 Stream status for ${callUuid}:`, req.body);

      const { Event, StreamID } = req.body;

      if (Event === "StartStream") {
        console.log(`✅ Stream started: ${StreamID} for call ${callUuid}`);
      } else if (Event === "StopStream") {
        console.log(`⏹️ Stream stopped: ${StreamID} for call ${callUuid}`);
      }

      res.status(200).send("OK");
    });

    // API endpoints
    this.app.get("/calls", (req, res) => {
      res.json({
        activeCalls: Array.from(this.activeCalls.values()),
        activeHandlers: this.handlerFactory.getStatus(),
      });
    });

    this.app.get("/call/:callUuid", (req, res) => {
      const { callUuid } = req.params;
      const call = this.activeCalls.get(callUuid);
      const handler = this.callHandlers.get(callUuid);

      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }

      res.json({
        call,
        handler: handler ? handler.getStatus() : null,
        recording: this.recordings.get(callUuid),
      });
    });

    // Health check
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        activeCalls: this.activeCalls.size,
        activeHandlers: this.handlerFactory.getStatus().activeHandlersCount,
        timestamp: new Date().toISOString(),
      });
    });
  }

  setupWebSocketServer() {
    this.wss = new WebSocket.Server({ port: 8080 });

    console.log("🔌 WebSocket server listening on port 8080");

    this.wss.on("connection", (ws, req) => {
      // Extract call UUID from path if available
      const pathMatch = req.url.match(/\/stream\/(.+)$/);
      const callUuid = pathMatch ? pathMatch[1] : null;

      console.log(`🔗 WebSocket connection for call: ${callUuid || "unknown"}`);

      // Create handler for this connection
      const handler = this.handlerFactory.createHandler(ws, {
        callUuid,
        enableAudioProcessing: true,
        enableNoiseSuppression: true,
        gainLevel: 1.2,
      });

      // Associate handler with call
      if (callUuid) {
        this.callHandlers.set(callUuid, handler);
        this.setupCallHandlerEvents(handler, callUuid);
      }

      // Handler cleanup
      handler.on("disconnected", () => {
        if (callUuid) {
          this.callHandlers.delete(callUuid);
        }
      });
    });
  }

  setupCallHandlerEvents(handler, callUuid) {
    // Initialize voice bot for this call
    const voiceBot = new VoiceBot(callUuid, handler);

    // Initialize call recording
    this.initializeRecording(callUuid);

    // Handle incoming audio
    handler.streamManager.on(
      "audioData",
      async ({ callUuid: audioCallUuid, audioBuffer, track }) => {
        if (audioCallUuid !== callUuid || track !== "inbound") return;

        // Save audio to recording
        this.appendToRecording(callUuid, audioBuffer);

        // Process audio with voice bot
        await voiceBot.processAudio(audioBuffer);
      }
    );

    // Handle stream events
    handler.streamManager.on(
      "streamStarted",
      ({ callUuid: streamCallUuid }) => {
        if (streamCallUuid === callUuid) {
          console.log(`🎵 Audio stream started for call ${callUuid}`);

          // Send welcome message after stream starts
          setTimeout(() => {
            voiceBot.sayWelcome();
          }, 1000);
        }
      }
    );

    handler.streamManager.on(
      "streamError",
      ({ callUuid: errorCallUuid, error }) => {
        if (errorCallUuid === callUuid) {
          console.error(`❌ Stream error for call ${callUuid}:`, error);
        }
      }
    );
  }

  initializeRecording(callUuid) {
    const recordingDir = path.join(__dirname, "recordings");
    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }

    const filename = `call-${callUuid}-${Date.now()}.raw`;
    const filepath = path.join(recordingDir, filename);
    const stream = fs.createWriteStream(filepath);

    this.recordings.set(callUuid, {
      filename,
      filepath,
      stream,
      startTime: new Date(),
      size: 0,
    });

    console.log(`🎙️ Recording started: ${filename}`);
  }

  appendToRecording(callUuid, audioBuffer) {
    const recording = this.recordings.get(callUuid);
    if (recording && recording.stream) {
      recording.stream.write(audioBuffer);
      recording.size += audioBuffer.length;
    }
  }

  handleCallEnd(callUuid) {
    // Update call status
    const call = this.activeCalls.get(callUuid);
    if (call) {
      call.status = "ended";
      call.endTime = new Date();
      call.duration = call.endTime - call.startTime;
    }

    // Close recording
    const recording = this.recordings.get(callUuid);
    if (recording && recording.stream) {
      recording.stream.end();
      recording.endTime = new Date();
      recording.duration = recording.endTime - recording.startTime;

      console.log(
        `🎙️ Recording ended: ${recording.filename} (${recording.size} bytes)`
      );
    }

    // Cleanup handler
    const handler = this.callHandlers.get(callUuid);
    if (handler) {
      handler.cleanup();
      this.callHandlers.delete(callUuid);
    }

    console.log(`📱 Call ${callUuid} processing completed`);
  }

  start(port = 3000) {
    this.app.listen(port, () => {
      console.log(`🚀 Complete Voice App started`);
      console.log(`📡 HTTP server: http://localhost:${port}`);
      console.log(`🔌 WebSocket server: ws://localhost:8080`);
      console.log(`📞 Plivo Answer URL: http://your-domain.com:${port}/answer`);
      console.log(`📱 Plivo Hangup URL: http://your-domain.com:${port}/hangup`);
    });
  }

  stop() {
    console.log("🛑 Stopping voice application...");

    // Cleanup all handlers
    this.handlerFactory.closeAllHandlers();

    // Close all recordings
    for (const recording of this.recordings.values()) {
      if (recording.stream) {
        recording.stream.end();
      }
    }

    // Close WebSocket server
    this.wss.close();

    console.log("✅ Voice application stopped");
  }
}

/**
 * Voice Bot for handling conversations
 */
class VoiceBot {
  constructor(callUuid, handler) {
    this.callUuid = callUuid;
    this.handler = handler;
    this.conversationState = "greeting";
    this.audioBuffer = Buffer.alloc(0);
    this.silenceCount = 0;
    this.isProcessing = false;

    // Conversation responses
    this.responses = {
      welcome: "Hello! I'm your AI assistant. How can I help you today?",
      listening: "I'm listening. Please tell me how I can assist you.",
      processing: "Let me process that for you.",
      goodbye: "Thank you for calling. Have a great day!",
      error: "I'm sorry, I didn't understand that. Could you please repeat?",
    };
  }

  async processAudio(audioBuffer) {
    if (this.isProcessing) return;

    // Accumulate audio
    this.audioBuffer = Buffer.concat([this.audioBuffer, audioBuffer]);

    // Detect silence (simplified)
    const volume = this.calculateVolume(audioBuffer);

    if (volume < 100) {
      // Low volume threshold
      this.silenceCount++;
    } else {
      this.silenceCount = 0;
    }

    // Process accumulated audio if we detect end of speech
    if (this.silenceCount > 20 && this.audioBuffer.length > 8000) {
      // ~250ms silence + min audio
      await this.processUserSpeech();
    }

    // Prevent buffer from growing too large
    if (this.audioBuffer.length > 160000) {
      // 10 seconds max
      this.audioBuffer = this.audioBuffer.slice(-80000); // Keep last 5 seconds
    }
  }

  async processUserSpeech() {
    if (this.audioBuffer.length === 0) return;

    this.isProcessing = true;

    try {
      console.log(
        `🎤 Processing speech for call ${this.callUuid}: ${this.audioBuffer.length} bytes`
      );

      // In a real implementation, you would:
      // 1. Send audio to speech-to-text service
      // 2. Process the text with NLP/LLM
      // 3. Generate appropriate response
      // 4. Convert response to speech

      // Simulate processing
      await this.simulateAIProcessing();

      // Generate response based on conversation state
      let responseText;
      switch (this.conversationState) {
        case "greeting":
          responseText = this.responses.listening;
          this.conversationState = "conversation";
          break;
        case "conversation":
          responseText = await this.generateContextualResponse();
          break;
        default:
          responseText = this.responses.listening;
      }

      // Send response
      await this.speak(responseText);
    } catch (error) {
      console.error(
        `❌ Error processing speech for call ${this.callUuid}:`,
        error
      );
      await this.speak(this.responses.error);
    } finally {
      this.audioBuffer = Buffer.alloc(0);
      this.silenceCount = 0;
      this.isProcessing = false;
    }
  }

  async simulateAIProcessing() {
    // Simulate AI processing delay
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 1000)
    );
  }

  async generateContextualResponse() {
    // In a real implementation, this would use AI/LLM to generate responses
    const responses = [
      "That's interesting. Can you tell me more about that?",
      "I understand. Let me help you with that.",
      "Based on what you've told me, I recommend...",
      "Is there anything else I can help you with today?",
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  async sayWelcome() {
    await this.speak(this.responses.welcome);
  }

  async speak(text) {
    console.log(`🗣️ Bot speaking to ${this.callUuid}: "${text}"`);

    // In a real implementation, you would:
    // 1. Convert text to speech using TTS service
    // 2. Get audio buffer
    // 3. Send audio buffer to the stream

    // For demo, we use Plivo's play audio feature
    try {
      await this.handler.streamManager.playAudio(
        this.callUuid,
        `https://your-tts-service.com/speak?text=${encodeURIComponent(text)}`
      );
    } catch (error) {
      console.error(`❌ Error speaking to ${this.callUuid}:`, error);
    }
  }

  calculateVolume(audioBuffer) {
    // Simple volume calculation (RMS)
    const samples = new Int16Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.length / 2
    );
    let sum = 0;

    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }

    return Math.sqrt(sum / samples.length);
  }
}

// Start the application
if (require.main === module) {
  const app = new CompleteVoiceApp();
  app.start(process.env.PORT || 3000);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    app.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Shutting down...");
    app.stop();
    process.exit(0);
  });
}

module.exports = { CompleteVoiceApp, VoiceBot };
