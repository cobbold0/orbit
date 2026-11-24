/**
 * Web Audio synthesizer for loud, reliable alarm chimes and notifications.
 * Runs client-side without external asset dependencies.
 */
export function playAlarmChime(options?: { volume?: number; repeat?: number }) {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const volume = options?.volume ?? 0.35;
    const repeatCount = options?.repeat ?? 3;

    // Harmonious alert frequencies: D5 (587.33Hz) and A5 (880.00Hz)
    const tones = [587.33, 880.0];

    tones.forEach((freq, toneIdx) => {
      for (let r = 0; r < repeatCount; r++) {
        const startTime = ctx.currentTime + r * 0.35 + toneIdx * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
      }
    });

    // Clean up audio context after playback ends
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, (repeatCount * 0.35 + 0.5) * 1000);
  } catch {
    // Audio context was blocked by browser autoplay policy or unsupported
  }
}
