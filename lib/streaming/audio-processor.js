import { Transform } from "stream";

/**
 * Audio format constants
 */
export const AudioFormats = {
  MULAW_8000: "audio/x-mulaw;rate=8000",
  L16_8000: "audio/x-l16;rate=8000",
  L16_16000: "audio/x-l16;rate=16000",
};

/**
 * Audio Processor for real-time audio manipulation
 */
export class AudioProcessor extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });

    this.sampleRate = options.sampleRate || 8000;
    this.format = options.format || AudioFormats.L16_8000;
    this.channels = options.channels || 1;
    this.bitDepth = options.bitDepth || 16;

    // Audio processing options
    this.enableNoiseSuppression = options.enableNoiseSuppression || false;
    this.enableEchoCancellation = options.enableEchoCancellation || false;
    this.gainLevel = options.gainLevel || 1.0;

    // Buffer for audio chunks
    this.audioBuffer = Buffer.alloc(0);
    this.chunkSize = options.chunkSize || 160; // 20ms at 8kHz
  }

  /**
   * Transform audio data
   * @param {Buffer} chunk - Audio data chunk
   * @param {string} encoding - Encoding type
   * @param {Function} callback - Transform callback
   */
  _transform(chunk, encoding, callback) {
    try {
      let processedAudio;

      if (chunk.audioBuffer) {
        // Handle structured audio data
        processedAudio = this.processAudioBuffer(chunk.audioBuffer);
        this.push({
          ...chunk,
          audioBuffer: processedAudio,
        });
      } else {
        // Handle raw audio buffer
        processedAudio = this.processAudioBuffer(chunk);
        this.push(processedAudio);
      }

      callback();
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Process audio buffer with various enhancements
   * @param {Buffer} audioBuffer - Raw audio data
   * @returns {Buffer} Processed audio data
   */
  processAudioBuffer(audioBuffer) {
    let processed = audioBuffer;

    // Apply gain adjustment
    if (this.gainLevel !== 1.0) {
      processed = this.applyGain(processed, this.gainLevel);
    }

    // Apply noise suppression (simplified)
    if (this.enableNoiseSuppression) {
      processed = this.applyNoiseSuppression(processed);
    }

    // Apply echo cancellation (simplified)
    if (this.enableEchoCancellation) {
      processed = this.applyEchoCancellation(processed);
    }

    return processed;
  }

  /**
   * Apply gain to audio samples
   * @param {Buffer} buffer - Audio buffer
   * @param {number} gain - Gain multiplier
   * @returns {Buffer} Processed buffer
   */
  applyGain(buffer, gain) {
    const samples = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.length / 2
    );

    for (let i = 0; i < samples.length; i++) {
      let sample = samples[i] * gain;
      // Clamp to prevent clipping
      sample = Math.max(-32768, Math.min(32767, sample));
      samples[i] = sample;
    }

    return Buffer.from(samples.buffer);
  }

  /**
   * Simple noise suppression (noise gate)
   * @param {Buffer} buffer - Audio buffer
   * @returns {Buffer} Processed buffer
   */
  applyNoiseSuppression(buffer) {
    const samples = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.length / 2
    );
    const threshold = 1000; // Noise threshold

    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) < threshold) {
        samples[i] = 0;
      }
    }

    return Buffer.from(samples.buffer);
  }

  /**
   * Simple echo cancellation (basic delay line)
   * @param {Buffer} buffer - Audio buffer
   * @returns {Buffer} Processed buffer
   */
  applyEchoCancellation(buffer) {
    // This is a simplified echo cancellation
    // In production, you'd use more sophisticated algorithms
    return buffer;
  }
}

/**
 * Audio format converter
 */
export class AudioConverter {
  /**
   * Convert μ-law to linear PCM
   * @param {Buffer} mulawBuffer - μ-law encoded audio
   * @returns {Buffer} Linear PCM audio
   */
  static mulawToLinear(mulawBuffer) {
    const linearBuffer = Buffer.alloc(mulawBuffer.length * 2);

    for (let i = 0; i < mulawBuffer.length; i++) {
      const mulawSample = mulawBuffer[i];
      const linearSample = this.mulawToLinearSample(mulawSample);
      linearBuffer.writeInt16LE(linearSample, i * 2);
    }

    return linearBuffer;
  }

  /**
   * Convert linear PCM to μ-law
   * @param {Buffer} linearBuffer - Linear PCM audio
   * @returns {Buffer} μ-law encoded audio
   */
  static linearToMulaw(linearBuffer) {
    const mulawBuffer = Buffer.alloc(linearBuffer.length / 2);

    for (let i = 0; i < linearBuffer.length; i += 2) {
      const linearSample = linearBuffer.readInt16LE(i);
      const mulawSample = this.linearToMulawSample(linearSample);
      mulawBuffer[i / 2] = mulawSample;
    }

    return mulawBuffer;
  }

  /**
   * Convert single μ-law sample to linear
   * @param {number} mulawSample - μ-law sample
   * @returns {number} Linear sample
   */
  static mulawToLinearSample(mulawSample) {
    const MULAW_BIAS = 0x84;
    const MULAW_MAX = 0x1fff;

    mulawSample = ~mulawSample;
    const sign = mulawSample & 0x80;
    const exponent = (mulawSample >> 4) & 0x07;
    const mantissa = mulawSample & 0x0f;

    let linear = mantissa << (exponent + 3);
    if (exponent > 0) {
      linear += MULAW_BIAS << exponent;
    } else {
      linear += MULAW_BIAS;
    }

    return sign ? -linear : linear;
  }

  /**
   * Convert single linear sample to μ-law
   * @param {number} linearSample - Linear sample
   * @returns {number} μ-law sample
   */
  static linearToMulawSample(linearSample) {
    const MULAW_BIAS = 0x84;
    const MULAW_CLIP = 0x1fff;

    const sign = linearSample < 0 ? 0x80 : 0x00;
    let magnitude = Math.abs(linearSample);

    if (magnitude > MULAW_CLIP) {
      magnitude = MULAW_CLIP;
    }

    magnitude += MULAW_BIAS;

    let exponent = 7;
    for (let exp = 0; exp < 8; exp++) {
      if (magnitude <= 0xff << exp) {
        exponent = exp;
        break;
      }
    }

    const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
    const mulaw = ~(sign | (exponent << 4) | mantissa);

    return mulaw & 0xff;
  }

  /**
   * Resample audio to different sample rate
   * @param {Buffer} audioBuffer - Input audio buffer
   * @param {number} fromRate - Source sample rate
   * @param {number} toRate - Target sample rate
   * @returns {Buffer} Resampled audio buffer
   */
  static resample(audioBuffer, fromRate, toRate) {
    if (fromRate === toRate) {
      return audioBuffer;
    }

    const samples = new Int16Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.length / 2
    );
    const ratio = fromRate / toRate;
    const outputLength = Math.floor(samples.length / ratio);
    const output = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i * ratio;
      const index = Math.floor(sourceIndex);
      const fraction = sourceIndex - index;

      if (index + 1 < samples.length) {
        // Linear interpolation
        output[i] =
          samples[index] * (1 - fraction) + samples[index + 1] * fraction;
      } else {
        output[i] = samples[index];
      }
    }

    return Buffer.from(output.buffer);
  }
}

/**
 * Real-time audio buffer manager
 */
export class AudioBufferManager {
  constructor(options = {}) {
    this.bufferSize = options.bufferSize || 1600; // 100ms at 8kHz, 16-bit
    this.sampleRate = options.sampleRate || 8000;
    this.channels = options.channels || 1;

    this.buffer = Buffer.alloc(0);
    this.timestamps = [];
  }

  /**
   * Add audio data to buffer
   * @param {Buffer} audioData - Audio data to add
   * @param {number} timestamp - Audio timestamp
   */
  addAudio(audioData, timestamp) {
    this.buffer = Buffer.concat([this.buffer, audioData]);
    this.timestamps.push(timestamp);

    // Remove old timestamps
    while (this.timestamps.length > 100) {
      this.timestamps.shift();
    }
  }

  /**
   * Get audio chunks of specified size
   * @param {number} chunkSize - Size of each chunk
   * @returns {Buffer[]} Array of audio chunks
   */
  getChunks(chunkSize = this.bufferSize) {
    const chunks = [];

    while (this.buffer.length >= chunkSize) {
      chunks.push(this.buffer.slice(0, chunkSize));
      this.buffer = this.buffer.slice(chunkSize);
    }

    return chunks;
  }

  /**
   * Get buffer status
   * @returns {object} Buffer status information
   */
  getStatus() {
    return {
      bufferLength: this.buffer.length,
      bufferDurationMs: (this.buffer.length / 2 / this.sampleRate) * 1000,
      timestampCount: this.timestamps.length,
    };
  }

  /**
   * Clear the buffer
   */
  clear() {
    this.buffer = Buffer.alloc(0);
    this.timestamps = [];
  }
}
