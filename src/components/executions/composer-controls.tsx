'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** The main action keeps its place. Mode text gives way before the model name. */
export function ComposerControls({ touch, children }: {
  touch: boolean;
  children: (modeIconOnly: boolean) => ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const modeChrome = useRef(0);
  const [modeIconOnly, setModeIconOnly] = useState(false);

  useLayoutEffect(() => {
    const el = row.current!;
    const mode = el.querySelector<HTMLElement>('[data-composer-mode]');
    const label = mode?.querySelector<HTMLElement>('.ri-chip-label');
    const model = el.querySelector<HTMLElement>('[data-composer-model]');
    const modelName = model?.querySelector<HTMLElement>('[data-model-name]');
    if (!mode || !label || !model || !modelName) return;
    // The hidden label keeps its intrinsic width, so a resize can restore it.
    if (!modeIconOnly) modeChrome.current = mode.getBoundingClientRect().width - label.getBoundingClientRect().width;
    const update = () => {
      const items = Array.from(el.children).filter(child => getComputedStyle(child).flexGrow === '0');
      const style = getComputedStyle(el);
      const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const occupied = items.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0);
      const modelOverflow = modelName.scrollWidth - modelName.clientWidth;
      const fullMode = modeChrome.current + label.getBoundingClientRect().width;
      const required = occupied + modelOverflow + fullMode - mode.getBoundingClientRect().width + parseFloat(style.columnGap) * (Array.from(el.children).filter(child => getComputedStyle(child).display !== 'none').length - 1);
      setModeIconOnly(touch && required > available + 1);
    };
    const observer = new ResizeObserver(update);
    for (const item of [el, label, modelName]) observer.observe(item);
    update();
    return () => observer.disconnect();
  });

  return <div ref={row} data-composer-controls className="flex flex-nowrap items-center gap-1 px-1.5 pb-1.5">
    {children(touch && modeIconOnly)}
  </div>;
}
