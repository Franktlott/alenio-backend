import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 44100;
const notes = [
  { freq: 523.25, start: 0.0, dur: 0.24, gain: 0.34 },
  { freq: 659.25, start: 0.16, dur: 0.24, gain: 0.3 },
  { freq: 783.99, start: 0.32, dur: 0.36, gain: 0.26 },
  { freq: 523.25, start: 1.05, dur: 0.2, gain: 0.2 },
  { freq: 659.25, start: 1.18, dur: 0.2, gain: 0.18 },
  { freq: 783.99, start: 1.31, dur: 0.34, gain: 0.16 },
];

const totalDuration = 1.85;
const numSamples = Math.floor(sampleRate * totalDuration);
const samples = new Float32Array(numSamples);

for (const note of notes) {
  const startSample = Math.floor(note.start * sampleRate);
  const endSample = Math.min(numSamples, Math.floor((note.start + note.dur) * sampleRate));
  for (let i = startSample; i < endSample; i++) {
    const t = (i - startSample) / sampleRate;
    const attack = Math.min(1, t / 0.012);
    const decay = Math.exp(-t * 7.5);
    const env = attack * decay;
    const phase = (2 * Math.PI * note.freq * i) / sampleRate;
    samples[i] += Math.sin(phase) * note.gain * env;
  }
}

let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
for (let i = 0; i < samples.length; i += 1) {
  samples[i] /= peak * 1.08;
}

const pcm = Buffer.alloc(numSamples * 2);
for (let i = 0; i < numSamples; i += 1) {
  const clamped = Math.max(-1, Math.min(1, samples[i]));
  pcm.writeInt16LE(Math.round(clamped * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const outPath = join(dirname(fileURLToPath(import.meta.url)), "../public/sounds/alenio-alert.wav");
writeFileSync(outPath, Buffer.concat([header, pcm]));
console.log(`Wrote ${outPath}`);
