import type { NextRequest } from 'next/server';
import { requireWorker } from '@/lib/workers/route-auth';
import { rateLimitResumeAdmission } from '@/lib/runs/rate-limit-resume';
import { getWorkerCommand, agentMessageAdmission } from '@/lib/db/queries';

/** Live check after device preparation, immediately before native acceptance. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const worker = requireWorker(request.headers);
  if (worker instanceof Response) return worker;
  const command = getWorkerCommand(id);
  if (!command || command.deviceId !== worker.device.id || command.kind !== 'send') return Response.json({ allowed: false, refusal: 'Send command unavailable.' }, { status: 404 });
  const payload = command.payload as { runId?: string | null; coordinationDeliveryIds?: string[] };
  const admission = agentMessageAdmission(command.sourceEventId, payload.runId, payload.coordinationDeliveryIds);
  const held = !!admission?.held && command.actor.source !== 'human';
  const refusal = (payload.runId && payload.runId === command.sourceEventId ? rateLimitResumeAdmission(payload.runId) : null)
    ?? admission?.refusal ?? null;
  const allowed = !held && !refusal && ['queued', 'sent', 'delivered'].includes(command.state);
  return Response.json({ allowed, held, refusal });
}
