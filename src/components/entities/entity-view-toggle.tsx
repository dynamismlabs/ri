'use client';

import { FileText, Bot } from 'lucide-react';
import { SegmentedList } from '@/components/system/segmented-control';
import { useElementWidth } from '@/hooks/use-element-width';

/** The two entity panels share the surrounding sheet's segmented root. */
export function EntityViewToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [measure, width] = useElementWidth<HTMLElement>();
  return <div className="contents" ref={node => measure(node?.closest<HTMLElement>('[data-entity-header]') ?? null)}>
    <SegmentedList ariaLabel="View" className={className} iconOnly={compact || (width ?? 0) < 704} options={[
      {value:'agent',label:'Agent',ariaLabel:'Agent view',icon:<Bot/>},
      {value:'editor',label:'Document',ariaLabel:'Document view',icon:<FileText/>},
    ]}/>
  </div>;
}
