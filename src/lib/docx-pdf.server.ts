/**
 * Turns an uploaded Word document into a faithful PDF.
 *
 * A .docx has no fixed pages, so rebuilding it in the browser used to re-lay the
 * text out — that rebuild changed symbols and dropped boxed panels. Instead the
 * original file is handed to Google Drive once (through the Lovable connector
 * gateway), converted to a Google Doc and exported as PDF, so the pages that get
 * cut are exactly what Word prints.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function gatewayHeaders(userDriveKey?: string | null) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const driveKey = userDriveKey || process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !driveKey) {
    throw new Error(
      "Word conversion isn't connected yet. Please save the file as a PDF and upload it again.",
    );
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": driveKey,
  };
}

async function failed(response: Response, what: string): Promise<never> {
  const body = await response.text();
  console.error(`Drive ${what} failed [${response.status}]: ${body}`);
  throw new Error(`Word conversion failed [${response.status}]: ${body.slice(0, 300)}`);
}

async function uploadAsDoc(
  bytes: ArrayBuffer,
  name: string,
  driveKey?: string | null,
): Promise<string> {
  const boundary = `lovable-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name,
    mimeType: "application/vnd.google-apps.document",
  });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`,
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
  if (!json.id) throw new Error("Word conversion returned no file.");
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
    // The temporary copy is disposable; a failed cleanup must not break the upload.
  }
}

/** Original Word file in, faithful PDF out. */
export async function docxToPdf(
  bytes: ArrayBuffer,
  name: string,
  driveKey?: string | null,
): Promise<ArrayBuffer> {
  const fileId = await uploadAsDoc(bytes, name, driveKey);
  try {
    return await exportPdf(fileId, driveKey);
  } finally {
    await removeFile(fileId, driveKey);
  }
}
