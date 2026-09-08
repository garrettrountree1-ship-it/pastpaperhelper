/**
 * Saving a teacher's own resources into their own Google Drive.
 *
 * Every call here runs on behalf of the signed-in teacher, using the Google
 * account they linked themselves. Server-only.
 */
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const DRIVE_CONNECTOR = "google_drive";
export const DRIVE_FOLDER_NAME = "PastPaperHelper.AI";

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/drive.file",
];

async function drive(
  connectionAPIKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const params: Parameters<typeof callAsAppUser>[0] = {
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: DRIVE_CONNECTOR,
    path,
  };
  if (init) params.init = init;
  return callAsAppUser(params);
}

async function readError(response: Response, what: string): Promise<never> {
  const body = await response.text();
  console.error(`Google Drive ${what} failed [${response.status}]: ${body}`);
  throw new Error(`Google Drive ${what} failed [${response.status}]: ${body}`);
}

/** The Google account this connection belongs to, for showing in the app. */
export async function driveAccountEmail(connectionAPIKey: string): Promise<string | null> {
  const response = await drive(connectionAPIKey, "/drive/v3/about?fields=user(emailAddress)");
  if (!response.ok) {
    const body = await response.text();
    console.error(`Google Drive account lookup failed [${response.status}]: ${body}`);
    return null;
  }
  const json = (await response.json()) as { user?: { emailAddress?: string } };
  return json.user?.emailAddress ?? null;
}

/** The app's own folder in the teacher's Drive, created the first time it is needed. */
export async function ensureAppFolder(connectionAPIKey: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const found = await drive(
    connectionAPIKey,
    `/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`,
  );
  if (found.ok) {
    const json = (await found.json()) as { files?: { id?: string }[] };
    const id = json.files?.[0]?.id;
    if (id) return id;
  }

  const created = await drive(connectionAPIKey, "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!created.ok) await readError(created, "folder creation");
  const json = (await created.json()) as { id?: string };
  if (!json.id) throw new Error("Google Drive did not return a folder.");
  return json.id;
}

function multipart(metadata: Record<string, unknown>, contentType: string, bytes: ArrayBuffer) {
  const boundary = `lovable-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--\r\n`,
  ]);
  return { boundary, body };
}

/** Copies one uploaded resource into the teacher's own Drive folder. */
export async function uploadToDrive(
  connectionAPIKey: string,
  args: { name: string; contentType: string; bytes: ArrayBuffer; folderId?: string },
): Promise<{ fileId: string; folderId: string; link: string | null }> {
  const folderId = args.folderId ?? (await ensureAppFolder(connectionAPIKey));
  const { boundary, body } = multipart(
    { name: args.name, parents: [folderId] },
    args.contentType || "application/octet-stream",
    args.bytes,
  );

  const response = await drive(
    connectionAPIKey,
    "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!response.ok) await readError(response, "upload");
  const json = (await response.json()) as { id?: string; webViewLink?: string };
  if (!json.id) throw new Error("Google Drive did not return the saved file.");
  return { fileId: json.id, folderId, link: json.webViewLink ?? null };
}

/** Removes the teacher's stored connection at Google's end as well. */
export async function revokeDriveConnection(connectionAPIKey: string): Promise<void> {
  const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
  await disconnectAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: DRIVE_CONNECTOR,
  });
}
