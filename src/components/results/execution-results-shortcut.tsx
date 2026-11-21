'use client';

import { Button } from '@/components/system/button';
import { HomeLink as Link } from '@/components/home/home-link';
import { FileCheck2 } from 'lucide-react';
import { useResultCapabilities, useResults } from '@/hooks/use-results';

export function ExecutionResultsShortcut({ executionId, size = "sm" }: { executionId: string; size?: "sm" | "touch" }) {
  const capabilities = useResultCapabilities();
  const retained = useResults({ executionId, includeSuperseded: true, limit: 1 });
  if (!capabilities.data?.handoffsEnabled && !retained.data?.length) return null;
  return <Button asChild variant="secondary" size={size} className="inline-flex shrink-0 items-center gap-1.5"><Link href={`/results?executionId=${encodeURIComponent(executionId)}`}
    aria-label="Saved results for this execution"><FileCheck2 size={14} /><span className="hidden sm:inline">Results</span></Link></Button>;
}
