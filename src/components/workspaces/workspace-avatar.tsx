import { agentInitials } from '@/lib/client/agent-initials';
import { cn } from '@/lib/utils';

/**
 * An agent's picture: its cover, else its emoji, else its initials. `sm` is
 * for one-line chips and menu items (chat search's agent filter). The default
 * sits a pixel low to line up with a two-line row's title.
 */
export function WorkspaceAvatar({
  wsImage,
  wsEmoji,
  wsName,
  size = 'md',
}: {
  wsImage: string | null;
  wsEmoji: string | null;
  wsName: string;
  size?: 'sm' | 'md';
}) {
  const sm = size === 'sm';
  return (
    <span
      className={cn(
        'relative flex items-center justify-center flex-shrink-0',
        sm ? 'w-4 h-4' : 'w-5 h-5 mt-px',
      )}
    >
      {wsImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wsImage} alt="" className={cn('object-cover', sm ? 'w-4 h-4 rounded-sm' : 'w-5 h-5 rounded')} />
      ) : wsEmoji ? (
        <span className={cn('leading-none', sm ? 'text-[12px]' : 'text-base')}>{wsEmoji}</span>
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center font-bold tracking-wide bg-muted text-muted-foreground',
            sm ? 'w-4 h-4 rounded-sm text-[7px]' : 'w-5 h-5 rounded text-[9px]',
          )}
        >
          {agentInitials(wsName)}
        </span>
      )}
    </span>
  );
}
