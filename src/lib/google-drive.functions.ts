import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Each teacher links their own Google account once. After that, every resource
 * they upload is also copied into a private "PastPaperHelper.AI" folder in
 * their own Google Drive.
 */
const CONNECTOR = "google_drive";
const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

/** Is this teacher's own Google Drive linked, and which account is it? */
export const getMyDriveStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR);
    if (!key) return { connected: false, email: null as string | null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_user_connections")
      .select("account_email")
      .eq("user_id", context.userId)
      .eq("connector_id", CONNECTOR)
      .maybeSingle();
    return { connected: true, email: data?.account_email ?? null };
  });

/** Starts the Google sign-in for this teacher and returns where to send them. */
export const startMyDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env["GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("Google Drive sign-in is not configured yet.");

    const request = getRequest();
    if (!request) throw new Error("The Google connection must start from the app.");
    const url = new URL(request.url);
    const sandboxHost =
      url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL(
      "/oauth/google-drive/return",
      sandboxHost ? `https://${sandboxHost}` : url.origin,
    ).toString();

    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const { DRIVE_SCOPES } = await import("@/lib/google-drive.server");
    const existing = await getConnectionKeyForUser(context.userId, CONNECTOR);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: DRIVE_SCOPES },
    });
    return { authorizationUrl };
  });

/** Finishes the Google sign-in and remembers the teacher's connection. */
export const completeMyDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ code: z.string().min(1) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== CONNECTOR) throw new Error("That sign-in was for a different service.");

    const { saveConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);

    const { driveAccountEmail } = await import("@/lib/google-drive.server");
    const email = await driveAccountEmail(connectionAPIKey);
    if (email) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("app_user_connections")
        .update({ account_email: email })
        .eq("user_id", context.userId)
        .eq("connector_id", CONNECTOR);
    }
    return { connected: true, email };
  });

/** Unlinks this teacher's Google account. Their files in Drive stay theirs. */
export const disconnectMyDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, forgetConnectionForUser } = await import(
      "@/lib/app-user-connections.server"
    );
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR);
    if (key) {
      const { revokeDriveConnection } = await import("@/lib/google-drive.server");
      try {
        await revokeDriveConnection(key);
      } catch (error) {
        console.error("Google Drive disconnect failed", error);
      }
    }
    await forgetConnectionForUser(context.userId, CONNECTOR);
    return { connected: false };
  });

/**
 * Copies one uploaded resource into the teacher's own Drive. Called right after
 * an upload; quietly does nothing when they have not linked Google.
 */
export const saveMaterialToMyDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ materialId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const key = await getConnectionKeyForUser(userId, CONNECTOR);
    if (!key) return { saved: false, reason: "not-connected" as const, link: null };

    const { assertMaterialTeacher } = await import("@/lib/materials.server");
    await assertMaterialTeacher(supabase, data.materialId, userId);

    const { data: material } = await supabase
      .from("unit_materials")
      .select("storage_path, file_name, content_type, title")
      .eq("id", data.materialId)
      .maybeSingle();
    if (!material?.storage_path) return { saved: false, reason: "no-file" as const, link: null };

    const { data: file, error } = await supabase.storage
      .from("class-materials")
      .download(material.storage_path);
    if (error || !file) return { saved: false, reason: "unreadable" as const, link: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("app_user_connections")
      .select("folder_id")
      .eq("user_id", userId)
      .eq("connector_id", CONNECTOR)
      .maybeSingle();

    const { uploadToDrive } = await import("@/lib/google-drive.server");
    const result = await uploadToDrive(key, {
      name: material.file_name ?? material.title ?? "resource",
      contentType: material.content_type ?? file.type ?? "application/octet-stream",
      bytes: await file.arrayBuffer(),
      ...(row?.folder_id ? { folderId: row.folder_id } : {}),
    });

    if (result.folderId !== row?.folder_id) {
      await supabaseAdmin
        .from("app_user_connections")
        .update({ folder_id: result.folderId })
        .eq("user_id", userId)
        .eq("connector_id", CONNECTOR);
    }
    return { saved: true, reason: null, link: result.link };
  });
