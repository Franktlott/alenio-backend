# Check-in audio retention

Recorded check-in audio is kept for seven days so the person who recorded the
conversation can replay it, then deleted. Everything else the check-in produced
— the structured answers, the transcript, the Seneca summary, notes and action
items — is unaffected and stays for good.

## How deletion happens

Three independent layers, so no single failure keeps audio alive:

1. **Access stops on time.** Every playback request re-checks the expiry against
   server time. Once `audioExpiresAt` has passed, the API refuses, whether or
   not the objects have been removed yet.
2. **The hourly sweep deletes it.** `sweepExpiredRecordingAudio` runs inside the
   existing hourly `runCleanup` in `backend/src/index.ts`, up to 50 recordings a
   pass. Anything that fails is left as `deletion_failed` and retried next hour.
3. **The bucket lifecycle rule is the backstop.** If the API were down for days,
   Cloud Storage deletes the objects itself at 10 days.

The clock starts when the last audio part finishes uploading, not when the
write-up finishes, so a slow or failed transcription cannot extend the window.

## Deployment configuration

Neither of the following is applied by a deploy. Both are one-time changes on
the Firebase / Google Cloud project.

### 1. Storage security rules — deny all client access to audio

Check-in audio is only ever read by the backend, which signs a five-minute URL
per playback. No client should reach it directly, and the objects deliberately
carry no Firebase download token. Add this to the bucket's rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Check-in audio is private to whoever recorded it. Reads and writes go
    // through the API, which authorises per request and signs a short-lived
    // URL. Admin SDK access is unaffected by these rules.
    match /check-in-audio/{allPaths=**} {
      allow read, write: if false;
    }

    // ...existing rules for other prefixes...
  }
}
```

### 2. Lifecycle rule — delete audio at 10 days

Ten days, not seven, so the rule never races the app: the sweep should always
get there first, and this only catches what it missed.

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 10,
          "matchesPrefix": ["check-in-audio/"]
        }
      }
    ]
  }
}
```

Apply it with:

```bash
gcloud storage buckets update gs://$BUCKET --lifecycle-file=lifecycle.json
```

Merge this rule into the bucket's existing lifecycle configuration rather than
replacing it; `buckets update` overwrites the whole configuration.

### Note on the storage path

New audio is written under `check-in-audio/{teamId}/…` precisely so a lifecycle
rule can target it by prefix. Audio recorded before this change lives under
`teams/{teamId}/check-in-audio/…`; those objects were already deleted right
after transcription, so the prefix rule has nothing to catch up on.
