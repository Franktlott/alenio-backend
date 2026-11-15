# Check-in live transcription

In-person 1:1 recordings can stream speech-to-text while the leader talks.
Video calls already used Daily live transcription; this path covers device-mic
and browser recordings.

## Provider and transport

- **Provider:** OpenAI Realtime transcription (same `OPENAI_API_KEY` as batch STT).
- **Model:** `OPENAI_REALTIME_TRANSCRIBE_MODEL`, falling back to `OPENAI_TRANSCRIBE_MODEL`
  (`gpt-4o-mini-transcribe` by default).
- **Keys:** Never sent to the client. The app requests a short-lived ticket, then
  connects to Alenio at `/api/check-in-transcription?ticket=…`. The backend
  proxies PCM16 audio to OpenAI and returns interim/final events.
- **Persistence:** Final utterances only, in `CheckInTranscriptSegment`. Interim
  text stays in memory on the client.

## Audio + recording

- Retention capture is unchanged: segmented m4a/webm uploads for up to seven-day
  replay ([check-in-audio-retention.md](./check-in-audio-retention.md)).
- Live STT tees PCM from a short-clip native tap (mobile) or a shared
  `MediaStream` / AudioContext (web). If the live tap cannot open, recording
  continues and the UI shows that live transcript is unavailable.
- Hiding the transcript panel does not stop transcription.

## Seneca

On finish, if enough finalized live words exist, they are stitched into
`CheckInRecording.transcript` and fed to the existing `structureOpenTranscript`
write-up. Otherwise the previous batch segment STT path runs. Transcript text is
treated as untrusted meeting data in the structuring prompt.

## Transcript retention

Audio still expires after seven days or on publish. **Transcript text remains
with the check-in** (existing product policy). No separate transcript deletion
job was added.

## Environment

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for live and batch STT |
| `OPENAI_TRANSCRIBE_MODEL` | Batch STT (+ live fallback) |
| `OPENAI_REALTIME_TRANSCRIBE_MODEL` | Optional live-specific model |
| `BACKEND_URL` | Used to build the WS URL returned to clients |

## Platform notes

- **iOS/Android:** A second short WAV clip recorder may fail if the OS refuses
  two concurrent recorders; live STT then degrades gracefully.
- **Web:** Shares the MediaRecorder mic stream via ScriptProcessor → PCM16.
- **Speakers:** Labels are shown only when the provider supplies them. Device-mic
  1:1 usually has no diarization; we never invent Speaker 1/2.
