'use client';

import { Button } from '@/components/system/button';
import { useAppsLayoutReview, type AppsReviewProps } from '@/hooks/use-apps-layout-review';
import { LibraryChat } from '../library-chat';
import { AppsReviewContext } from './context';
import { SplitLibrary } from './layouts/split-library';
import s from './review.module.css';

/** One library and discovery surface: your apps, connectors, custom MCP servers and skills beside the catalog. */
export function AppsLibraryScreen(props: AppsReviewProps) {
  const review = useAppsLayoutReview(props);
  return (
    <AppsReviewContext.Provider value={review}>
      <div className={s.review} data-apps-library aria-busy={review.loading}>
        {review.failures.map(failure => (
          <div className={s.error} role="alert" key={failure.name}>
            {failure.name} could not load. {failure.error?.message}
            <Button
              onClick={failure.retry}
              variant="secondary"
              size="xs"
              className="ml-2"
            >Retry</Button>
          </div>
        ))}
        <SplitLibrary />
        <LibraryChat item={review.chatItem} onClose={() => review.setChatItem(null)} />
      </div>
    </AppsReviewContext.Provider>
  );
}
