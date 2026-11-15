"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speechLangFor, stripForSpeech } from "@/lib/speech";

/**
 * Text-to-speech through the browser's own speech synthesis.
 *
 * Nothing leaves the device beyond whatever the user's OS/browser does for its
 * installed voices. Placeholders are never read out; see `stripForSpeech`.
 */
export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      mountedRef.current = false;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  const stop = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const clean = stripForSpeech(text);
      if (!clean) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      const lang = speechLangFor(text);
      utterance.lang = lang;
      utterance.rate = 0.98;
      utterance.pitch = 1;

      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((item) => item.lang === lang && item.localService) ??
        voices.find((item) => item.lang === lang) ??
        voices.find((item) => item.lang.toLowerCase().startsWith(lang.slice(0, 2)));
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        if (mountedRef.current) setSpeaking(true);
      };
      utterance.onend = () => {
        if (mountedRef.current) setSpeaking(false);
      };
      utterance.onerror = () => {
        if (mountedRef.current) setSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  return useMemo(() => ({ supported, speaking, speak, stop }), [supported, speaking, speak, stop]);
}

export type SpeechController = ReturnType<typeof useSpeech>;
