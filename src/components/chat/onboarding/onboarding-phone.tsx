'use client';

import { Button } from '@/components/system/button';
import { PairDeviceForm, PairingPanel } from '@/components/settings/devices-section';
import { PHONE_SETUP_ANCHOR } from '@/components/settings/remote-base-url';
import { openSettings } from '@/components/settings/settings-store';
import { APP_NAME } from '@/constants/app';
import { useDevices } from '@/hooks/use-devices';
import type { PairDeviceResponse } from '@/lib/api/devices';
import { settingsApi } from '@/lib/api/settings';
import { hasPairedPhone, securePhoneAddress } from '@/lib/devices/phone';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Card, PrimaryButton, QuietButton } from './onboarding-ui';

/** How often a pairing link checks whether its phone has opened it. */
const PAIRING_POLL_MS = 3_000;

/**
 * The end of first-run setup offers Ri on a phone, as one quiet line under
 * the starters, for a home that hasn't paired one. Opened, it goes one of two
 * ways:
 *
 *   - With a secure (https) remote address, Settings' own pairing form and
 *     its QR code and link, right here. It watches for the phone to sign in
 *     and says so.
 *   - Without one, Set up phone access: why a phone needs one (the
 *     microphone, and Ri away from home), a button to the remote address in
 *     Settings, and the way back. Once the address is saved this turns into
 *     the pairing form by itself.
 *
 * Nothing here is a setup step: it's never asked, and leaving it is fine.
 */
export function PhoneOffer() {
  const [open, setOpen] = useState(false);
  const [pairing, setPairing] = useState<PairDeviceResponse | null>(null);
  const [sentToSetup, setSentToSetup] = useState(false);
  const waiting = !!pairing;
  const { data: devices } = useDevices({ refetchInterval: waiting ? PAIRING_POLL_MS : false });
  const { data: baseUrls } = useQuery({
    queryKey: ['settings', 'base-url'],
    queryFn: () => settingsApi.getBaseUrls(),
  });

  // Offered or not, decided once there are devices to look at: a home that
  // already has a paired phone isn't offered another. One paired from here
  // stays to say so.
  const [offered, setOffered] = useState<boolean | null>(null);
  if (offered === null && devices) setOffered(!hasPairedPhone(devices));
  if (!offered || !baseUrls) return null;

  const paired = hasPairedPhone(devices ?? []);
  const address = securePhoneAddress(baseUrls.tunnel);
  const close = () => {
    setOpen(false);
    setPairing(null);
  };

  return (
    <section aria-label={`Use ${APP_NAME} on your phone`} className="mt-1 border-t border-border/60 pt-3">
      {paired ? (
        <p role="status" className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground/85">
          <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            Your phone is paired. On it, add {APP_NAME} to the home screen to open it like an app.
          </span>
        </p>
      ) : !open ? (
        <div className="flex min-w-0 items-center gap-2">
          <Smartphone size={13} className="flex-shrink-0 text-muted-foreground" />
          <Button type="button" onClick={() => setOpen(true)} variant="link" size="md" className="flex-shrink-0">
            Use {APP_NAME} on your phone
          </Button>
          <span className="hidden min-w-0 truncate text-[11.5px] text-muted-foreground sm:inline">
            Talk to me and check on your agents from anywhere.
          </span>
        </div>
      ) : address ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] leading-relaxed text-foreground/85">
            {sentToSetup
              ? 'Your secure address is ready. Name your phone, then scan the code with it.'
              : 'Name your phone, then scan the code with it. It opens your Ri and stays signed in.'}
          </p>
          {pairing ? (
            <>
              <PairingPanel pairing={pairing} baseUrls={baseUrls} onDone={close} />
              <p role="status" className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Loader2 size={11} className="animate-spin" />
                Waiting for your phone to open the link
              </p>
            </>
          ) : (
            <PairDeviceForm initialName="My phone" kind="phone" onPaired={setPairing} onCancel={close} />
          )}
        </div>
      ) : (
        <Card className="flex flex-col gap-2.5">
          <p className="text-[12px] leading-relaxed text-foreground/85">
            Your phone reaches {APP_NAME} at a secure address, one that starts with https. It lets you talk to
            me with the microphone, and it works away from home, not only on your Wi-Fi.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <PrimaryButton
              onClick={() => {
                setSentToSetup(true);
                openSettings('devices', { anchor: PHONE_SETUP_ANCHOR });
              }}
            >
              Set up phone access
            </PrimaryButton>
            <QuietButton onClick={close}>Not now</QuietButton>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            {sentToSetup
              ? 'Save the address in Settings, then choose Back to pairing. Your phone’s code shows up here.'
              : 'It opens Settings at your remote address. Once it’s saved, come back here to pair your phone.'}
          </p>
        </Card>
      )}
    </section>
  );
}
