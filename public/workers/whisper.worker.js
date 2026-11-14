/**
 * Local speech-to-text worker.
 *
 * Audio never leaves this tab: the Float32 PCM samples are transferred into the
 * worker and processed by Whisper via onnxruntime-web (WASM). Only the library and
 * model weights are downloaded, and they are cached by the browser afterwards.
 *
 * The worker is intentionally plain JavaScript and loaded from /public so that
 * Next.js does not try to bundle the ONNX runtime.
 */

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
const MODELS = ["Xenova/whisper-small", "Xenova/whisper-base"];

let modulePromise = null;
/** @type {Map<string, Promise<(audio: Float32Array, options: object) => Promise<{ text?: string }>>>} */
const pipelinePromises = new Map();

function post(message, transfer) {
  self.postMessage(message, transfer || []);
}

function errorMessage(error) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

async function loadTransformers() {
  if (!modulePromise) {
    modulePromise = import(TRANSFORMERS_URL).then((mod) => {
      // Prefer weights mirrored into /public/models; fall back to the Hub cache.
      mod.env.allowLocalModels = true;
      mod.env.localModelPath = "/models/";
      mod.env.useBrowserCache = true;
      return mod;
    });
    modulePromise.catch(() => {
      modulePromise = null;
    });
  }
  return modulePromise;
}

async function getTranscriber(model) {
  if (!pipelinePromises.has(model)) {
    const promise = (async () => {
      const { pipeline } = await loadTransformers();
      return pipeline("automatic-speech-recognition", model, {
        quantized: true,
        progress_callback: (progress) => post({ type: "progress", model, progress }),
      });
    })();
    pipelinePromises.set(model, promise);
    promise.catch(() => pipelinePromises.delete(model));
  }
  return pipelinePromises.get(model);
}

async function warm() {
  try {
    await getTranscriber(MODELS[0]);
    post({ type: "ready", model: MODELS[0] });
  } catch (error) {
    // Not fatal: transcription will retry and fall back to the smaller model.
    post({ type: "warning", model: MODELS[0], message: errorMessage(error) });
  }
}

async function transcribe(requestId, audio) {
  if (!(audio instanceof Float32Array) || audio.length === 0) {
    post({ type: "error", requestId, message: "No audio was received." });
    return;
  }

  let lastError = "The local speech model could not be loaded.";
  for (const model of MODELS) {
    try {
      post({ type: "transcribing", requestId, model });
      const transcriber = await getTranscriber(model);
      const output = await transcriber(audio, {
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      post({
        type: "result",
        requestId,
        model,
        text: typeof output?.text === "string" ? output.text : "",
      });
      return;
    } catch (error) {
      lastError = errorMessage(error);
      post({ type: "model-error", requestId, model, message: lastError });
    }
  }

  post({ type: "error", requestId, message: lastError });
}

self.onmessage = (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "warm") {
    void warm();
    return;
  }

  if (data.type === "transcribe") {
    void transcribe(data.requestId, data.audio);
  }
};
