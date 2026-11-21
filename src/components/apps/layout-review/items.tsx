'use client';
import { Card } from '@/components/system/card';
import { MenuAction } from '@/components/system/menu-action';

import { IconButton } from '@/components/system/icon-button';
import { BookOpen, Check, CirclePause, LayoutGrid, MessageCircle, Server, Settings2 } from 'lucide-react';
import { Button } from '@/components/system/button';
import { IntegrationLogo } from '@/components/integrations/integration-logo';
import { AppMark } from '../app-mark';
import { itemType, primaryLabel, type ReviewItem } from './catalog';
import { useReview } from './context';
import s from './review.module.css';

export function ItemMark({ item, small = false }: { item: ReviewItem; small?: boolean }) {
  if (item.providerId) return <IntegrationLogo providerId={item.providerId} name={item.name} size={small ? 24 : 36} />;
  if (item.kind === 'skills' || (item.target.kind === 'mcp' && item.kind !== 'apps')) {
    const Icon = item.kind === 'skills' ? BookOpen : Server;
    return <span aria-hidden className={`${s.mark} ${small ? s.markSmall : ''} ${item.kind === 'skills' ? s.skillMark : ''}`}><Icon size={small ? 13 : 18} /></span>;
  }
  return <AppMark name={item.name} size={small ? 'sm' : 'lg'} />;
}
export function ItemStatus({ item }: { item: ReviewItem }) {
  return <span className={`${s.status} ${item.attention ? s.attention : ''}`}>
    {item.added && !item.draft && !item.attention && (item.enabled === false ? <CirclePause size={11} /> : <Check size={11} />)}<span>{item.status}</span>
  </span>;
}
export function PrimaryButton({ item }: { item: ReviewItem }) {
  const review = useReview();
  return <Button
    disabled={review.busy}
    onClick={() => review.primary(item)}
    aria-label={`${primaryLabel(item)} ${item.name}`}
    variant="secondary"
    size="xs"
  >{primaryLabel(item)}</Button>;
}
export function ManageButton({ item }: { item: ReviewItem }) {
  const review = useReview();
  return <IconButton
    onClick={() => review.details(item, true)}
    label={`Manage ${item.name}`}
    variant="ghost"
    size="xs"
  ><Settings2 size={13} /></IconButton>;
}
export function ItemCard({ item }: { item: ReviewItem }) {
  const review = useReview();
  return <Card as="article" padding="none" shadow  className={s.card} data-item={item.key}>
    <MenuAction density="none"  className={s.cardTop} type="button" onClick={() => review.details(item)} aria-label={`Details for ${item.name}`}>
      <ItemMark item={item} /><span className={s.cardCopy}><h3>{item.name}</h3><span className={s.description}>{item.description}</span></span>
    </MenuAction>
    <div className={s.itemType}>{item.view ? <LayoutGrid size={11} /> : item.kind === 'skills' ? <BookOpen size={11} /> : <MessageCircle size={11} />}{itemType(item)}{item.view && ' · Opens in Ri'}</div>
    <div className={s.cardFoot}><ItemStatus item={item} /><div className={s.actions}><PrimaryButton item={item} />{item.added && <ManageButton item={item} />}</div></div>
  </Card>;
}
