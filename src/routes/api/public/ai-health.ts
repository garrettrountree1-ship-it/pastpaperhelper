import { createFileRoute } from "@tanstack/react-router";

/**
 * Tiny diagnostic: confirms which AI provider host the server will use and
 * whether that host accepts a request from this server's region. It never
 * returns any key material.
 */
export const Route = createFileRoute("/api/public/ai-health")({
  server: {
    handlers: {
      GET: async () => {
        const base = (process.env["OPENAI_BASE_URL"] || "https://api.openai.com/v1")
          .trim()
          .replace(/\/+$/, "");
        const key = process.env["OPENAI_API_KEY"] || "";
        let status = 0;
        let code = "";
        if (key) {
          const response = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
            }),
          });
          status = response.status;
          if (!response.ok) {
            const detail = await response.text();
            code = /unsupported_country_region_territory/.test(detail)
              ? "region_blocked"
              : detail.slice(0, 120);
          }
        }
        return Response.json({
          host: new URL(base).host,
          usingRelay: base !== "https://api.openai.com/v1",
          hasOpenAiKey: key.length > 0,
          status,
          code,
        });
      },
    },
  },
});
