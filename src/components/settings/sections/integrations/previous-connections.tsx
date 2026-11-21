'use client';
import { Card } from '@/components/system/card';

import { Button } from '@/components/system/button';
import { GroupHeading } from './parts';
import { connectionIdentity, type Connection } from './types';

export function PreviousConnections({ connections, busy, onDisconnect }: {
  connections: Connection[];
  busy: boolean;
  onDisconnect: (connection: Connection) => void;
}) {
  return <section className="space-y-2">
    <GroupHeading count={connections.length}>Previous connections</GroupHeading>
    <p className="text-xs text-muted-foreground">Connect Atlassian to use Jira and Confluence.</p>
    <Card padding="none" className="divide-y divide-border/60">
      {connections.map(connection => <div key={connection.id} className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0 text-xs">
          <p className="font-medium">{connection.providerId === 'jira' ? 'Jira' : 'Confluence'}</p>
          <p className="truncate text-muted-foreground">{connectionIdentity(connection)}</p>
        </div>
        <Button
          disabled={busy}
          onClick={() => onDisconnect(connection)}
          variant="ghost"
          size="xs"
        >Disconnect</Button>
      </div>)}
    </Card>
  </section>;
}
