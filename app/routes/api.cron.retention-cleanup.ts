import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { RetentionCleanupService } from "../services/compliance/retention-cleanup.service";

async function handleRetentionCron(request: Request) {
  // Verify Bearer Token from Vercel Cron
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  // FAIL CLOSED: If CRON_SECRET is not configured or header does not match, reject
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json(
      { error: "Unauthorized: Invalid or missing CRON_SECRET authentication" },
      { status: 401 }
    );
  }

  try {
    const result = await RetentionCleanupService.runScheduledCleanup();
    return Response.json({
      success: true,
      message: "Retention cleanup executed successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("[Retention Cleanup Cron] Execution failed:", error);
    return Response.json(
      { error: error?.message || "Internal server error during retention cleanup" },
      { status: 500 }
    );
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleRetentionCron(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleRetentionCron(request);
}
