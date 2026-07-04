/** Returns true when the URL loads as an image in the browser. */
export function probeImageUrl(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!trimmed) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = trimmed;
  });
}
