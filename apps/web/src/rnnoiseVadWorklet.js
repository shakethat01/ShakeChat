import { Rnnoise } from '@shiguredo/rnnoise-wasm';

const PROCESSOR_ID = 'shakechat-rnnoise-vad';
const AUDIO_WORKLET_BUFFER_SIZE = 128;
const RNNOISE_FRAME_SIZE = 480;
const TOTAL_BUFFER_SIZE = 1920;

function toPcm16Range(frame) {
  for (let i = 0; i < frame.length; i += 1) frame[i] *= 0x7fff;
}

function toFloatRange(frame) {
  for (let i = 0; i < frame.length; i += 1) frame[i] /= 0x7fff;
}

function createChannelProcessor(module) {
  const denoiseState = module.createDenoiseState();
  const totalBuffer = new Float32Array(TOTAL_BUFFER_SIZE);
  const delay = (Math.floor(RNNOISE_FRAME_SIZE / AUDIO_WORKLET_BUFFER_SIZE) + 1) * AUDIO_WORKLET_BUFFER_SIZE + AUDIO_WORKLET_BUFFER_SIZE;
  let input = 0;
  let pos = TOTAL_BUFFER_SIZE - RNNOISE_FRAME_SIZE * 2;

  return {
    process(inputBuffer, outputBuffer) {
      totalBuffer.set(inputBuffer, input);
      input = (input + AUDIO_WORKLET_BUFFER_SIZE) % TOTAL_BUFFER_SIZE;

      let vad;
      if (input === 128 || input === 512 || input === 1024 || input === 1536) {
        pos = (pos + RNNOISE_FRAME_SIZE) % TOTAL_BUFFER_SIZE;
        const frame = totalBuffer.subarray(pos, pos + RNNOISE_FRAME_SIZE);
        toPcm16Range(frame);
        vad = denoiseState.processFrame(frame);
        toFloatRange(frame);
      }

      const start = (input + (TOTAL_BUFFER_SIZE - delay)) % TOTAL_BUFFER_SIZE;
      outputBuffer.set(totalBuffer.subarray(start, start + AUDIO_WORKLET_BUFFER_SIZE));
      return vad;
    },
    destroy() {
      denoiseState.destroy();
    },
  };
}

function createProcessor(module, maxChannels) {
  if (module.frameSize !== RNNOISE_FRAME_SIZE) {
    throw new Error(`rnnoise frameSize must be ${RNNOISE_FRAME_SIZE}. (was ${module.frameSize})`);
  }

  const processors = Array.from({ length: maxChannels }, () => createChannelProcessor(module));
  return {
    process(input, output) {
      const channels = Math.min(input.length, output.length, maxChannels);
      let maxVad;
      for (let i = 0; i < channels; i += 1) {
        const vad = processors[i].process(input[i], output[i]);
        if (typeof vad === 'number') maxVad = maxVad === undefined ? vad : Math.max(maxVad, vad);
      }
      return maxVad;
    },
    destroy() {
      for (const processor of processors) processor.destroy();
    },
  };
}

class ShakeChatRnnoiseVadProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.processor = undefined;
    this.destroyed = false;

    this.port.addEventListener('message', event => {
      if (event.data === 'destroy') this.destroy();
    });
    this.port.start();

    void (async () => {
      const module = await Rnnoise.loadBinary(options.processorOptions.wasmBinary);
      this.processor = createProcessor(module, options.processorOptions.maxChannels || 1);
      if (this.destroyed) this.destroy();
    })();
  }

  process(inputs, outputs) {
    if (this.destroyed) return false;
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;
    if (!this.processor) return true;

    const probability = this.processor.process(input, output);
    if (typeof probability === 'number' && Number.isFinite(probability)) {
      this.port.postMessage({ type: 'vad', probability: Math.max(0, Math.min(1, probability)) });
    }
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.processor?.destroy();
    this.processor = undefined;
  }
}

registerProcessor(PROCESSOR_ID, ShakeChatRnnoiseVadProcessor);
