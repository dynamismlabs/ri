'use client';

import { Button } from '@/components/system/button';
import { useEffect, useState } from 'react';

/** How long the page is on screen before Allow takes a click, as Ri's approval cards arm (docs/connected-mcp-apps.md). */
const ARM_MS = 500;

/**
 * Cancel and Allow. Allow takes nothing until the page has been visible for
 * a moment, and isn't focused, so a click or key meant for the page that
 * opened this one can't land on it (docs/mcp-oauth.md, "Security").
 */
export function ConsentButtons() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const arm = () => window.setTimeout(() => setArmed(document.visibilityState === 'visible'), ARM_MS);
    let timer = arm();
    const onVisibility = () => {
      window.clearTimeout(timer);
      setArmed(false);
      timer = arm();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="flex gap-2">
      <Button
        type="submit"
        name="decision"
        value="deny"
        variant="secondary"
        size="sm"
        className="flex-1"
      >
        Cancel
      </Button>
      <Button
        type="submit"
        name="decision"
        value="allow"
        disabled={!armed}
        variant="primary"
        size="md"
        className="flex-1"
      >
        Allow
      </Button>
    </div>
  );
}
