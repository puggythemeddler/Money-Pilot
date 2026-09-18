import { ok } from "@/lib/api";

export async function GET() {
  return ok({
    status: "ok",
    service: "moneypilot-api",
    time: new Date().toISOString(),
  });
}