"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { microphoneErrorMessage } from "@/lib/speech";

export type VoiceStatus = "idle" | "recording" | "transcribing";

export interface VoiceController {
  supported: boolean;
  status: VoiceStatus;
  seconds: number;
  model: string | null;
  detail: string | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  clearError: () => void;
}

interface WorkerMessage {
  type?: string;
  requestId?: number;
  model?: string;
  message?: string;
  text?: string;
  progress?: { status?: string; progress?: number; file?: string };
}

const SAMPLE_RATE = 16_000;
const MAX_SECONDS = 120;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const legacy = window as typeof window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? legacy.webkitAudioContext;
}

/** Decode a recorded blob and resample it to the mono 16 kHz Whisper expects. */
async function blobToMono16k(blob: Blob): Promise<Float32Array> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) throw new Error("Audio decoding is not available in this browser.");

  const buffer = await blob.arrayBuffer();
  const decodeContext = new Ctor();
  try {
    const decoded = await decodeContext.decodeAudioData(buffer.slice(0));
    const frames = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    await decodeContext.close().catch(() => undefined);
  }
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

function shortModel(model: string): string {
  return model.split("/").pop() ?? model;
}

/**
 * Microphone capture plus local Whisper transcription.
 *
 * Recording is capped at two minutes. Audio is decoded in the page and the PCM
 * samples are transferred to a worker; the only network traffic is the one-time
 * download of the Whisper library and model weights.
 */
export function useVoice({
  onTranscript,
  maxSeconds = MAX_SECONDS,
}: {
  onTranscript: (text: string) => void;
  maxSeconds?: number;
}): VoiceController {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [model, setModel] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(0);
  const requestRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== "undefined" &&
        typeof Worker !== "undefined" &&
        Boolean(getAudioContextCtor()),
    );
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const showWorkerError = useCallback((message: string) => {
    setStatus("idle");
    setSeconds(0);
    setDetail(null);
    setError(
      message.length > 220
        ? `${message.slice(0, 220)}… The model is downloaded once; check your connection and try again.`
        : message,
    );
  }, []);

  const ensureWorker = useCallback((): Worker | null => {
    if (typeof Worker === "undefined") return null;
    if (workerRef.current) return workerRef.current;

    const worker = new Worker("/workers/whisper.worker.js", { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;

      if (message.type === "ready" && message.model) {
        setModel(message.model);
        setDetail(null);
        return;
      }

      if (message.type === "progress") {
        const progress = message.progress;
        if (!progress || !message.model) return;
        if (progress.status === "progress" && typeof progress.progress === "number") {
          setDetail(`${shortModel(message.model)} · ${Math.round(progress.progress)}%`);
        } else if (progress.status === "ready" || progress.status === "done") {
          setDetail(`Loading ${shortModel(message.model)}…`);
        }
        return;
      }

      if (message.type === "transcribing" && message.model) {
        setModel(message.model);
        setDetail(`Running ${shortModel(message.model)}…`);
        return;
      }

      if (message.type === "warning") {
        // The worker retries with the smaller model; keep this out of the UI.
        console.warn("Whisper warm-up failed:", message.message);
        return;
      }

      if (message.type === "model-error") {
        console.warn(`Whisper ${message.model ?? "model"} failed:`, message.message);
        return;
      }

      if (message.type === "result" && message.requestId === pendingRef.current) {
        pendingRef.current = 0;
        setStatus("idle");
        setSeconds(0);
        setDetail(null);
        const text = (message.text ?? "").trim();
        if (!text) {
          setError("No speech detected. Try again a little closer to the microphone.");
          return;
        }
        onTranscriptRef.current(text);
        return;
      }

      if (message.type === "error" && message.requestId === pendingRef.current) {
        pendingRef.current = 0;
        showWorkerError(message.message ?? "Transcription failed.");
      }
    };

    worker.onerror = () => {
      setStatus("idle");
      setSeconds(0);
      setDetail(null);
      setError("The local speech model failed to load. Check your connection and try again.");
    };

    workerRef.current = worker;
    return worker;
  }, [showWorkerError]);

  const finalize = useCallback(async () => {
    clearTimer();
    releaseStream();

    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (discardRef.current || chunks.length === 0) {
      discardRef.current = false;
      setStatus("idle");
      setSeconds(0);
      setDetail(null);
      return;
    }

    setStatus("transcribing");
    setDetail("Preparing audio…");
    try {
      const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      const audio = await blobToMono16k(blob);
      if (audio.length < SAMPLE_RATE * 0.3) {
        throw new Error("That recording was too short. Hold the mic a little longer.");
      }

      const worker = ensureWorker();
      if (!worker) throw new Error("Web Workers are not available in this browser.");

      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      pendingRef.current = requestId;
      worker.postMessage({ type: "transcribe", requestId, audio }, [audio.buffer as ArrayBuffer]);
    } catch (finalizeError) {
      setStatus("idle");
      setSeconds(0);
      setDetail(null);
      setError(
        finalizeError instanceof Error ? finalizeError.message : "The recording could not be read.",
      );
    }
  }, [clearTimer, ensureWorker, releaseStream]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    releaseStream();
    chunksRef.current = [];
    if (pendingRef.current) {
      pendingRef.current = 0;
      terminateWorker();
    }
    setStatus("idle");
    setSeconds(0);
    setDetail(null);
    setError(null);
  }, [clearTimer, releaseStream, terminateWorker]);

  const stop = useCallback(() => {
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setStatus("transcribing");
      setDetail("Preparing audio…");
      recorderRef.current.stop();
    }
  }, [clearTimer]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (!supported || status !== "idle") return;
    setError(null);
    setDetail(null);
    setSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        recorderRef.current = null;
        void finalize();
      };

      recorder.start(250);
      recorderRef.current = recorder;
      setStatus("recording");
      startedAtRef.current = Date.now();

      // Download and initialise while the user is still speaking.
      ensureWorker()?.postMessage({ type: "warm" });

      clearTimer();
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setSeconds(Math.min(elapsed, maxSeconds));
        if (elapsed >= maxSeconds) {
          clearTimer();
          stopRef.current();
        }
      }, 250);
    } catch (startError) {
      releaseStream();
      terminateWorker();
      setStatus("idle");
      setSeconds(0);
      setError(microphoneErrorMessage(startError));
    }
  }, [clearTimer, ensureWorker, finalize, maxSeconds, releaseStream, status, supported, terminateWorker]);

  useEffect(
    () => () => {
      discardRef.current = true;
      clearTimer();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      releaseStream();
      terminateWorker();
    },
    [clearTimer, releaseStream, terminateWorker],
  );

  return {
    supported,
    status,
    seconds,
    model,
    detail,
    error,
    start,
    stop,
    cancel,
    clearError: () => setError(null),
  };
}
