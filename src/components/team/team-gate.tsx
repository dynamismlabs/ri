'use client';
import { Callout } from '@/components/system/callout';

import { Field } from '@/components/system/field';

import { Button } from '@/components/system/button';
import type { ReactNode } from 'react';
import { APP_NAME } from '@/constants/app';

/**
 * The calm, centered frame a team shows before someone is in: signed out,
 * joining, signing in elsewhere, or finishing setup.
 */
export function TeamGate({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-[400px]">
        <p className="mb-6 text-[11px] font-semibold text-muted-foreground">{APP_NAME}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <div className="mt-4 space-y-4 text-sm text-muted-foreground">{children}</div>
        {footer && <div className="mt-8 text-xs text-muted-foreground/80">{footer}</div>}
      </div>
    </main>
  );
}

export function GateField({
  id,
  label,
  hint,
  size,
  ...input
}: Omit<React.ComponentProps<'input'>, 'children'> & { id: string; label: string; hint?: string }) {
  return <Field {...input} id={id} label={label} description={hint} htmlSize={size} />;
}

export function GateButton({ busy, children, ...button }: React.ComponentProps<'button'> & { busy?: boolean }) {
  return (
    <Button
      {...button}
      disabled={button.disabled || busy}
      variant="primary"
      size="md"
      className="inline-flex w-full items-center justify-center"
    >
      {busy ? 'One moment…' : children}
    </Button>
  );
}

export function GateNotice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <Callout as="p" padding="md" density="row" tone={(tone === 'error' ? "error" : "neutral")}
      role={tone === 'error' ? 'alert' : 'status'}

    >
      {children}
    </Callout>
  );
}
