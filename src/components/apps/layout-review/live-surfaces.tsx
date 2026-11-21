'use client';

import { BookOpen } from 'lucide-react';
import { HarnessChatSession } from '@/components/chat/harness-chat';
import { useSkillChat } from '@/components/skills/use-skill-chat';
import { Button } from '@/components/system/button';
import { useReview } from './context';
import { Empty } from './shared';
import type { ReviewItem } from './catalog';
import s from './review.module.css';

export function SkillTry({ item }: { item: ReviewItem }) {
  const review = useReview();
  return <div className={s.frame}><div className={s.header}><BookOpen size={16} /><div className={s.headerCopy}><h1>Try {item.name}</h1><p>A real chat with this skill available.</p></div><Button
    onClick={() => review.setTrySkill(null)}
    variant="secondary"
    size="xs"
  >Back to Apps</Button></div>{item.target.kind === 'skill' && <SkillTryChat skillRef={item.target.ref} />}</div>;
}
function SkillTryChat({ skillRef }: { skillRef: string }) {
  const chat = useSkillChat(skillRef, 'try');
  if (chat.error) return <Empty>{chat.error.message}<Button
    onClick={() => void chat.refetch()}
    variant="primary"
    size="md"
  >Retry</Button></Empty>;
  return chat.sessionId ? <HarnessChatSession sessionId={chat.sessionId} autoFocusComposer={false} /> : <p role="status" className={s.notice}>Opening skill chat…</p>;
}
