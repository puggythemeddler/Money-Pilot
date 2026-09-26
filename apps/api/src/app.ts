import { Hono } from "hono";
import { ErrorCodes } from "@moneypilot/shared";
import { fail, ok } from "@/lib/api";
import { csrfMiddleware, securityHeaders } from "@/middleware";
import { authRoutes } from "@/routes/auth";
import { financeRoutes } from "@/routes/finance";
import { householdRoutes } from "@/routes/household";
import { adminRoutes } from "@/routes/admin";
import { userRoutes } from "@/routes/users";

/**
 * The MoneyPilot API application.
 *
 * All routes live under /api: the browser reaches them through the web app's
 * same-origin /api/* proxy (Vercel -> Render), and native/mobile clients use
 * token-mode auth without cookies. Security middleware enforces the CSRF
 * origin checks and hardening headers before any route runs.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.use("*", securityHeaders);
  app.use("/api/*", csrfMiddleware);

  app.get("/api/health", () =>
    ok({ status: "ok", service: "moneypilot-api", time: new Date().toISOString() }),
  );

  app.route("/api", authRoutes);
  app.route("/api", financeRoutes);
  app.route("/api", householdRoutes);
  app.route("/api", adminRoutes);
  app.route("/api", userRoutes);

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Not found.",
          requestId: c.req.header("x-request-id") ?? undefined,
        },
      },
      404,
    ),
  );

  // Final safety net: handlers already catch their own errors; this covers
  // anything thrown from middleware or framework code.
  app.onError((err) => fail(err));

  return app;
}
