'use client';
import { Callout } from '@/components/system/callout';

import { useOptionalHomeContext } from './home-context';
import { SHARED_COMPUTER_WARNING } from '@/lib/team/shared-computer-copy';

/** A visible explanation, never an extra approval or a launch block. */
export function SharedComputerWarning() {
  const home = useOptionalHomeContext();
  return home?.capabilities.configureAgents && home.sharedComputer
    ? <Callout as="p" padding="md" tone={"warning"} role="note" >{SHARED_COMPUTER_WARNING}</Callout>
    : null;
}
