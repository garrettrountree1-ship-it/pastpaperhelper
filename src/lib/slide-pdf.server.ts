/**
 * Turns an uploaded PowerPoint into a faithful, page-per-slide PDF.
 *
 * A browser cannot open a .pptx, so the scrolling slide view used to rebuild
 * each slide from its parts. Instead we hand the original file to Google Drive
 * once (through the Lovable connector gateway), export it as a PDF, and show
 * those exact pages. Editable text boxes are layered on top in the app.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function gatewayHeaders(userDriveKey?: string | null) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  // A teacher who linked their own Google account converts through their Drive;
  // otherwise the shared workspace connection is used.
  const driveKey = userDriveKey || process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !driveKey) {
    throw new Error("The slide conversion service is not connected yet.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": driveKey,
  };
}

async function failed(response: Response, what: string): Promise<never> {
  const body = await response.text();
  console.error(`Drive ${what} failed [${response.status}]: ${body}`);
  throw new Error(`Slide conversion failed [${response.status}]: ${body}`);
}

/** Uploads the deck as a Google Slides file and returns its Drive file id. */
async function uploadAsSlides(
  bytes: ArrayBuffer,
  name: string,
  driveKey?: string | null,
): Promise<string> {
  const boundary = `lovable-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name,
    mimeType: "application/vnd.google-apps.presentation",
  });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${PPTX_MIME}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--\r\n`,
  ]);

  const response = await fetch(`${GATEWAY}/upload/drive/v3/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      ...gatewayHeaders(driveKey),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) await failed(response, "upload");
  const json = (await response.json()) as { id?: string };
  if (!json.id) throw new Error("Slide conversion returned no file.");
  return json.id;
}

async function exportPdf(fileId: string, driveKey?: string | null): Promise<ArrayBuffer> {
  const response = await fetch(
    `${GATEWAY}/drive/v3/files/${fileId}/export?mimeType=application/pdf`,
    { headers: gatewayHeaders(driveKey) },
  );
  if (!response.ok) await failed(response, "export");
  return await response.arrayBuffer();
}

async function removeFile(fileId: string, driveKey?: string | null): Promise<void> {
  try {
    await fetch(`${GATEWAY}/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: gatewayHeaders(driveKey),
    });
  } catch {
    // The temporary copy is disposable; a failed cleanup must not break the view.
  }
}

/** The whole round trip: original deck in, faithful PDF out. */
export async function pptxToPdf(
  bytes: ArrayBuffer,
  name: string,
  driveKey?: string | null,
): Promise<ArrayBuffer> {
  const fileId = await uploadAsSlides(bytes, name, driveKey);
  try {
    return await exportPdf(fileId, driveKey);
  } finally {
    await removeFile(fileId, driveKey);
  }
}
