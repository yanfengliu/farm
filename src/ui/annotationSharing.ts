export async function copyAnnotationJsonOrDownload(filename: string, json: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    downloadAnnotationJson(filename, json);
    return false;
  }
}

export function downloadAnnotationJson(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
