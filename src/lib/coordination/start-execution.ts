import * as q from '@/lib/db/queries';
import type { AgentRequestRecord } from '@/db/types';
import { ActionError } from '@/lib/orchestrator/types';
import { UnsupportedPermissionModeError } from '@/lib/executor/permission-map';
import { HarnessDisabledError } from '@/lib/harness/registry';
import { requestScopedId } from './start-id';
import { executionStartPolicy, verifyLaunchReplay } from '@/lib/sessions/home-policy';

/** Validate both the proposed destination and the destination after approval. */
export function validateDelegationExecution(options: NonNullable<AgentRequestRecord['options']>, userId: string) {
  if (!options.executionId) return;
  if (options.deviceId || options.taskId) throw new ActionError('invalid_params', 'execution_id cannot be combined with device_id or task_id. The new chat shares the existing execution’s device and tasks.');
  const execution = q.getExecution(options.executionId);
  if (!execution || execution.userId !== userId) throw new ActionError('not_found', 'Execution not found.');
  if (execution.workspaceId !== options.workspaceId) throw new ActionError('invalid_params', 'The execution does not belong to the named agent.');
  if (execution.status !== 'active') throw new ActionError('conflict', 'This execution is archived. Restore it before starting a chat.');
  const workspace = q.getWorkspace(options.workspaceId);
  if (!workspace || workspace.status !== 'active') throw new ActionError('conflict', 'The destination agent is unavailable.');
}

async function startDelegatedChat(request: AgentRequestRecord, deliveryId: string) {
  const options = request.options!;
  const source = q.getChatSession(request.sourceSessionId!);
  if (!source) throw new ActionError('not_found', 'The requesting chat is unavailable.');
  validateDelegationExecution(options, source.userId);
  const input = {
    ...options, harness: options.provider,
    sessionId: requestScopedId('session', options.workspaceId, request.id),
    coordinationDeliveryId: deliveryId,
    actor: { source: 'ai' as const, sessionId: source.id, apiKeyId: null },
  };
  const existing = q.getChatSessionWithExecution(input.sessionId);
  if (existing) {
    if (existing.executionId !== options.executionId) throw new ActionError('conflict', 'This launch id already belongs to another execution.');
    verifyLaunchReplay(options.workspaceId, existing, input.actor, input);
    return existing;
  }
  const policy = await executionStartPolicy(q.getWorkspace(options.workspaceId)!, input);
  policy.verify();
  validateDelegationExecution(options, source.userId);
  const session = q.createExecutionChat({
    id: input.sessionId,
    executionId: options.executionId!,
    harness: policy.selection.providerId,
    model: policy.selection.model,
    modelVariant: policy.selection.variant,
    effort: policy.selection.effort,
    serviceTier: policy.selection.serviceTier,
    permissionMode: policy.permissionMode,
    prePlanMode: policy.prePlanMode,
    label: options.label,
  });
  if (!session) throw new ActionError('not_found', 'Execution not found.');
  policy.initialize(session.id);
  return q.getChatSessionWithExecution(session.id)!;
}

/** Approval precedes creation. The shared launcher owns ceiling and child policy. */
export async function startDelegatedExecution(requestId: string) {
  const request = q.getAgentRequest(requestId);
  const initial = q.initialAgentDelivery(requestId);
  if (!request?.options || request.kind !== 'delegation' || !initial || initial.status !== 'queued' || request.status !== 'queued' || !request.sourceSessionId) throw new ActionError('conflict', 'An approved open delegation is required.');
  const { dispatchExecutionSession, WorkspaceNotFoundForDispatch, DeviceUnavailableForDispatch, TaskNotStartableForDispatch } = await import('@/lib/sessions/dispatch');
  let session;
  try {
    session = request.options.executionId
      ? await startDelegatedChat(request, initial.id)
      : await dispatchExecutionSession({ ...request.options, harness: request.options.provider, sessionId: requestScopedId('session', request.options.workspaceId, request.id), coordinationDeliveryId: initial.id, actor: { source: 'ai', sessionId: request.sourceSessionId, apiKeyId: null } });
  } catch (error) {
    if (error instanceof WorkspaceNotFoundForDispatch) throw new ActionError('not_found', error.message);
    if (error instanceof TaskNotStartableForDispatch || error instanceof DeviceUnavailableForDispatch || error instanceof HarnessDisabledError) throw new ActionError('conflict', error.message);
    if (error instanceof UnsupportedPermissionModeError) throw new ActionError('invalid_params', error.message);
    throw error;
  }
  q.updateAgentRequest(request.id, { targetSessionId: session.id });
  q.updateAgentDelivery(initial.id, { targetSessionId: session.id });
  return { sessionId: session.id, executionId: session.executionId };
}
