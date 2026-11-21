'use client';

import { SegmentedRoot, SegmentedList, SegmentedPanel } from '@/components/system/segmented-control';

import { IconButton } from '@/components/system/icon-button';
import { useEffect, useRef } from 'react';
import { BookOpen, LayoutGrid, MessageCircle, Settings2, X } from 'lucide-react';
import { Button } from '@/components/system/button';
import { Switch } from '@/components/ui/switch';
import { useSkill } from '@/hooks/use-skills';
import { APP_NAME } from '@/constants/app';
import { versionLabel } from '@/lib/apps/version-label';
import { itemType, type CatalogApp, type ReviewItem } from './catalog';
import { useReview } from './context';
import { ItemMark, PrimaryButton } from './items';
import s from './review.module.css';

/** Details stay beside the catalog. Management delegates to Ri's real editors. */
export function ItemDetails({ item }: { item: ReviewItem }) {
  const review = useReview();
  const settings = review.query.panel === 'settings';
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review.query.item !== item.key || !heading.current?.getClientRects().length) return;
    heading.current.focus({ preventScroll: true });
    const root = heading.current.closest('[data-apps-library]');
    if (root && root.clientWidth <= 760) heading.current.scrollIntoView({ block: 'start' });
  }, [item.key, review.query.item]);
  return (
    <SegmentedRoot
      mode="tabs"
      value={settings ? 'settings' : 'overview'}
      onChange={(value) => review.details(item, value === 'settings')}
    >
      <section className={s.details} aria-label={`${item.name} details`}>
        <div className={s.detailHead}>
          <ItemMark item={item} />
          <div className="min-w-0 flex-1">
            <h2 ref={heading} tabIndex={-1} className="outline-none">
              {item.name}
            </h2>
            <p className={s.muted}>
              {itemType(item)} · {item.status}
            </p>
          </div>
          <IconButton
            onClick={() => review.patch({ item: undefined, panel: undefined })}
            label="Close details"
            variant="ghost"
            size="xs"
          >
            <X size={15} />
          </IconButton>
        </div>
        <p className={s.detailCopy}>{item.description}</p>
        <div className={s.actions}>
          <PrimaryButton item={item} />
          {item.added &&
            item.view &&
            item.chat &&
            item.usable !== false &&
            !item.attention &&
            item.target.kind !== 'catalog-app' && (
              <Button onClick={() => review.chat(item)} variant="secondary" size="xs">
                <MessageCircle size={12} />
                Try in chat
              </Button>
            )}
        </div>
        <div className={s.detailTabs} aria-label="Addition details">
          <SegmentedList
            ariaLabel="Addition details"
            options={[
              { value: 'overview', label: 'Overview' },
              ...(item.added ? [{ value: 'settings', label: 'Settings' }] : []),
            ]}
          />
        </div>
        <SegmentedPanel value={settings ? 'settings' : 'overview'}>
          {settings && item.added ? (
            <>
              {item.target.kind === 'mcp' && item.enabled !== undefined && (
                <div className={s.setting}>
                  <span>
                    Available to Ri<small>Turning this off keeps its setup.</small>
                  </span>
                  <Switch
                    checked={item.enabled}
                    disabled={review.busy}
                    onCheckedChange={() => review.toggle(item)}
                    aria-label={`Allow Ri to use ${item.name}`}
                  />
                </div>
              )}
              <div className={s.setting}>
                <span>
                  {item.kind === 'skills' ? 'Instructions and installation' : 'Accounts and access'}
                  <small>
                    {item.kind === 'skills'
                      ? 'Edit, move, try, or uninstall this skill.'
                      : 'Update setup, permissions, or removal.'}
                  </small>
                </span>
                <Button onClick={() => review.manage(item)} variant="secondary" size="xs">
                  <Settings2 size={12} />
                  Manage
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="my-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                {item.view && (
                  <span className="flex items-center gap-1.5">
                    <LayoutGrid size={13} />
                    Opens in Ri
                  </span>
                )}
                {item.chat && (
                  <span className="flex items-center gap-1.5">
                    <MessageCircle size={13} />
                    Works in chat
                  </span>
                )}
                {item.kind === 'skills' && (
                  <span className="flex items-center gap-1.5">
                    <BookOpen size={13} />
                    Repeatable workflow
                  </span>
                )}
              </div>
              {item.catalogApp ? (
                <CatalogAppBody app={item.catalogApp} />
              ) : item.target.kind === 'skill' ? (
                <StoredSkillBody skillRef={item.target.ref} />
              ) : item.starter ? (
                <div className={s.demo}>
                  <span className={s.eyebrow}>The workflow</span>
                  <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {item.starter.body}
                  </div>
                </div>
              ) : (
                <div className={s.demo}>
                  <h3>{item.added ? 'Ready for your work' : 'Make it available to Ri'}</h3>
                  <p className={s.muted}>
                    {item.kind === 'skills'
                      ? 'Open this skill to read its instructions, try it, or choose which agents use it.'
                      : item.view
                        ? 'Open the app to use its full interface and your records.'
                        : 'Connect an account and choose its access. Then bring the information into a conversation.'}
                  </p>
                </div>
              )}
              {!item.added && (
                <p className={`${s.muted} mt-5`}>
                  {item.catalogApp
                    ? `Add it, and ${APP_NAME} installs it, then asks what it may do in it.`
                    : item.kind === 'connectors'
                      ? 'Connect your account, then choose what Ri can use.'
                      : 'Preview and customize it before you choose to install it.'}
                </p>
              )}
            </>
          )}
        </SegmentedPanel>
      </section>
    </SegmentedRoot>
  );
}

/** A catalog app before it's added: what it can reach, its version, and where it runs. */
function CatalogAppBody({ app }: { app: CatalogApp }) {
  return <div className={s.demo}>
    <span className={s.eyebrow}>What it can reach</span>
    {app.reaches.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{app.reaches.map(reach => <li key={reach}>{reach}</li>)}</ul>
      : <p className="mt-2 text-xs text-muted-foreground">Only its own data.</p>}
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
      {APP_NAME} builds {app.name} {versionLabel(app.version)} from its own repository and runs it on your computer, with its own data. It’s yours to change with the builder.
    </p>
  </div>;
}

function StoredSkillBody({ skillRef }: { skillRef: string }) {
  const skill = useSkill(skillRef);
  return <div className={s.demo}><span className={s.eyebrow}>Your instructions</span>{skill.error ? <p className={s.muted}>{skill.error.message}<Button
    onClick={() => void skill.refetch()}
    variant="ghost"
    size="xs"
  >Retry</Button></p> : <div className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{skill.data?.body || (skill.isPending ? 'Loading instructions…' : 'No instructions yet. Open the editor to write them.')}</div>}</div>;
}
