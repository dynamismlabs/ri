'use client';
import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
const FooterTarget = createContext<HTMLDivElement | null>(null);
/** The enclosing dialog keeps its body scroller and the form action follows it in DOM order. */
export function FormFooterHost({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const inherited = useContext(FooterTarget);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return (
    <FooterTarget.Provider value={enabled ? target : inherited}>
      {children}
      {enabled && <div ref={setTarget} className="ri-form-footer-host" />}
    </FooterTarget.Provider>
  );
}
/** Supply form= on a portaled submit button to retain native form submission. */
export function FormActions({ className, ...props }: ComponentProps<'div'>) {
  const target = useContext(FooterTarget),
    actions = (
      <div
        data-slot="form-actions"
        className={cn('ri-form-actions ri-dialog-footer', className)}
        {...props}
      />
    );
  return target ? createPortal(actions, target) : actions;
}
