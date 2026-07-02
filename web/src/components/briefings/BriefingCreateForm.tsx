import { useState } from "react";
import { uploadChatMedia } from "../../lib/api";

type Props = {
  busy?: boolean;
  error?: string | null;
  onSubmit: (payload: {
    title: string;
    description: string;
    documentUrl: string;
    documentFilename?: string;
    contentType?: string;
    dueAt?: string | null;
    requireSignature: boolean;
    allowInitials: boolean;
  }) => Promise<void>;
};

const ACCEPT = ".pdf,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function BriefingCreateForm({ busy, error, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [requireSignature, setRequireSignature] = useState(false);
  const [allowInitials, setAllowInitials] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (!title.trim() || !description.trim()) {
      setLocalErr("Title and description are required.");
      return;
    }
    if (!file) {
      setLocalErr("Upload a briefing document.");
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadChatMedia(file);
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        documentUrl: uploaded.url,
        documentFilename: uploaded.originalFilename,
        contentType: uploaded.contentType,
        dueAt: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        requireSignature,
        allowInitials: requireSignature ? false : allowInitials,
      });
      setTitle("");
      setDescription("");
      setDueDate("");
      setFile(null);
      setRequireSignature(false);
      setAllowInitials(true);
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : "Could not publish briefing.");
    } finally {
      setUploading(false);
    }
  }

  const disabled = busy || uploading;

  return (
    <form className="briefing-create-form" onSubmit={(e) => void handleSubmit(e)}>
      <label className="enterprise-alenio-go-alert-label" htmlFor="briefing-title">
        Briefing title
      </label>
      <input
        id="briefing-title"
        className="enterprise-alenio-go-alert-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
      />

      <label className="enterprise-alenio-go-alert-label" htmlFor="briefing-description">
        Description / purpose
      </label>
      <textarea
        id="briefing-description"
        className="enterprise-alenio-go-alert-textarea"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        maxLength={2000}
        required
      />

      <label className="enterprise-alenio-go-alert-label" htmlFor="briefing-file">
        Upload document
      </label>
      <input
        id="briefing-file"
        type="file"
        accept={ACCEPT}
        className="briefing-file-input"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file ? <p className="enterprise-muted briefing-file-name">{file.name}</p> : null}

      <label className="enterprise-alenio-go-alert-label" htmlFor="briefing-due">
        Due date (optional)
      </label>
      <input
        id="briefing-due"
        type="date"
        className="enterprise-alenio-go-alert-input"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />

      <fieldset className="enterprise-alenio-go-alert-targets">
        <legend className="enterprise-alenio-go-alert-label">Completion requirements</legend>
        <label className="enterprise-alenio-go-alert-check">
          <input
            type="checkbox"
            checked={allowInitials}
            disabled={requireSignature}
            onChange={(e) => setAllowInitials(e.target.checked)}
          />
          <span>Require initials</span>
        </label>
        <label className="enterprise-alenio-go-alert-check">
          <input
            type="checkbox"
            checked={requireSignature}
            onChange={(e) => {
              setRequireSignature(e.target.checked);
              if (e.target.checked) setAllowInitials(false);
            }}
          />
          <span>Require signature</span>
        </label>
      </fieldset>

      <p className="enterprise-muted briefing-create-note">
        Publishing sends this briefing to everyone in this workspace and linked Alenio Go devices.
      </p>

      {localErr || error ? (
        <p className="enterprise-alenio-go-alert-error" role="alert">
          {localErr || error}
        </p>
      ) : null}

      <button type="submit" className="enterprise-alenio-go-link-btn" disabled={disabled}>
        {uploading ? "Uploading…" : busy ? "Publishing…" : "Publish briefing"}
      </button>
    </form>
  );
}
