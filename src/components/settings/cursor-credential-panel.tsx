'use client';
import { Card } from '@/components/system/card';

import { Field } from '@/components/system/field';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';

import { trpc, trpcClient } from '@/lib/trpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function CursorCredentialPanel() {
  const [key, setKey] = useState('');
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['cursor-credential'],
    queryFn: () => trpcClient.harness.cursorKeyGet.query({}),
  });
  const save = useMutation({
    mutationFn: () => trpcClient.harness.cursorKeyPut.mutate({body: { apiKey: key }}),
    onSuccess: (data) => {
      setKey('');
      queryClient.setQueryData(['cursor-credential'], data);
      void queryClient.invalidateQueries({ queryKey: trpc.harness.authGet.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.harness.modelsGet.pathKey() });
      toast.success('Cursor API key saved');
      void queryClient.invalidateQueries({ queryKey: trpc.homeExecutionChoices.queryKey() });
    },
  });
  const clear = useMutation({
    mutationFn: () => trpcClient.harness.cursorKeyDelete.mutate({}),
    onSuccess: (data) => {
      queryClient.setQueryData(['cursor-credential'], data);
      void queryClient.invalidateQueries({ queryKey: trpc.harness.authGet.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.harness.modelsGet.pathKey() });
      toast.success('Stored Cursor API key removed');
      void queryClient.invalidateQueries({ queryKey: trpc.homeExecutionChoices.queryKey() });
    },
  });

  return (
    <Card padding="md" className="space-y-2">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <KeyRound size={13} /> Cursor API key
      </div>
      <p className="text-[10.5px] text-muted-foreground">
        Stored locally in Ri&apos;s protected credential store. The key is only opened when Cursor starts.
      </p>
      <div className="flex gap-2">
        <Field
          type="password"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={status.data?.configured ? 'Replace configured key' : 'Paste API key'}
          aria-label={'API key'}
          purpose="code"
        />
        <Button
          disabled={!key.trim() || save.isPending}
          onClick={() => save.mutate()}
          variant="primary"
          size="md"
        >
          {save.isPending && <Loader2 className="animate-spin" />} Save
        </Button>
        {status.data?.source === 'ri_store' && (
            <IconButton
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
              label="Remove stored key"
              tooltip="Remove stored key"
              variant="ghost"
              size="sm"
            >
              <Trash2 />
            </IconButton>
        )}
      </div>
      {status.data?.configured && (
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
          Configured through {status.data.source === 'ri_store' ? 'Ri' : 'CURSOR_API_KEY'}
        </p>
      )}
    </Card>
  );
}
