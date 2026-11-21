'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { RadioGroup, Tabs, ToggleGroup } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { Tip } from '@/components/ui/tip';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number | null;
  countStyle?: 'plain' | 'badge';
  tone?: 'attention' | 'working';
  dot?: 'attention' | 'working' | 'neutral' | 'info' | 'danger' | 'unavailable';
  pulse?: boolean;
  selectedTone?: 'warning';
  disabled?: boolean;
  hint?: string;
  ariaLabel?: string;
  onDoubleClick?: () => void;
}

type Selection<T extends string> =
  | { mode: 'tabs'; value: T | null; onChange: (value: T) => void; allowEmpty?: never; selection?: never }
  | {
      mode: 'choice';
      value: T | null;
      onChange: (value: T | null) => void;
      allowEmpty: true;
      selection?: 'pressed';
    }
  | {
      mode: 'choice';
      value: T | null;
      onChange: (value: T) => void;
      allowEmpty?: false;
      selection?: 'pressed' | 'radio';
    };
interface SegmentContext {
  mode: 'tabs' | 'choice';
  value: string | null;
  selection?: 'pressed' | 'radio';
  change: (value: string) => void;
}
const Context = createContext<SegmentContext | null>(null);
function useSegment() {
  const context = useContext(Context);
  if (!context) throw new Error('SegmentedList and SegmentedPanel need a SegmentedRoot');
  return context;
}

/** Separate Root/List/Panel parts let a header and its panels keep their layout. */
export function SegmentedRoot<const T extends string>(
  props: Selection<T> & { children: ReactNode; className?: string },
) {
  const root = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const change = (value: string) => {
    const focused = document.activeElement;
    previousFocus.current =
      focused instanceof HTMLElement &&
      focused.matches('.ri-segment-option') &&
      root.current?.contains(focused)
        ? focused
        : null;
    if (value) props.onChange(value as T);
    else if (props.mode === 'choice' && props.allowEmpty) props.onChange(null);
  };
  useLayoutEffect(() => {
    const previous = previousFocus.current;
    previousFocus.current = null;
    // Full-page document headers live inside conditional view branches. If a
    // branch replaces its header, keep a keyboard user's focus on the new tab.
    if (previous && !previous.isConnected) {
      root.current
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus({ preventScroll: true });
    }
  }, [props.value]);
  const content =
    props.mode === 'tabs' ? (
      <Tabs.Root
        ref={root}
        value={props.value ?? ''}
        onValueChange={change}
        className={cn('contents', props.className)}
      >
        {props.children}
      </Tabs.Root>
    ) : (
      <div ref={root} className={cn('contents', props.className)}>
        {props.children}
      </div>
    );
  return (
    <Context.Provider value={{ mode: props.mode, value: props.value, selection: props.selection, change }}>
      {content}
    </Context.Provider>
  );
}

const listVariants = cva('ri-segmented', {
  variants: {
    size: { compact: '', touch: 'ri-segmented--touch' },
    grow: { true: 'ri-segmented--grow' },
    stretch: { true: 'ri-segmented--stretch' },
    iconOnly: { true: 'ri-segmented--icons' },
  },
  defaultVariants: { size: 'compact' },
});
export interface SegmentedListProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  ariaLabel: string;
  size?: 'compact' | 'touch';
  grow?: boolean;
  stretch?: boolean;
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
}

/** The measured scroller, including its fades, belongs to the control. */
export function SegmentedList<T extends string>({
  options,
  ariaLabel,
  size,
  grow,
  stretch,
  iconOnly,
  disabled,
  className,
}: SegmentedListProps<T>) {
  const context = useSegment();
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = scroller.current;
    const content = track.current;
    if (!el || !content) return;
    const measure = () =>
      setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(content);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, []);
  const reveal = (item: Element | null) => {
    const el = scroller.current;
    if (!el || !item) return;
    const viewport = el.getBoundingClientRect();
    const bounds = item.getBoundingClientRect();
    // Scroll only our own track. scrollIntoView can move the containing page.
    if (bounds.left < viewport.left) el.scrollLeft -= viewport.left - bounds.left;
    else if (bounds.right > viewport.right) el.scrollLeft += bounds.right - viewport.right;
  };
  useEffect(() => {
    reveal(
      track.current?.querySelector('[aria-selected="true"], [aria-pressed="true"], [aria-checked="true"]') ??
        null,
    );
  }, [context.value, iconOnly, size]);

  const items = options.map((option) => {
    const selected = context.value === option.value;
    const contents = (
      <>
        {option.dot && (
          <span
            aria-hidden
            className={cn(
              'ri-segment-dot',
              `ri-segment-dot--${option.dot}`,
              option.pulse && 'ri-segment-pulse',
            )}
          />
        )}
        {option.icon}
        <span className="ri-segment-label">{option.label}</span>
        {option.count != null && option.count > 0 && (
          <span
            className={cn(
              'ri-segment-count',
              option.countStyle === 'badge' && 'ri-segment-count--badge',
              option.tone && `ri-segment-count--${option.tone}`,
              option.pulse && 'ri-segment-pulse',
            )}
          >
            {option.count}
          </span>
        )}
      </>
    );
    const common = {
      value: option.value,
      'data-value': option.value,
      'data-selected-tone': option.selectedTone,
      'aria-label': option.ariaLabel ?? (iconOnly ? option.label : undefined),
      disabled: disabled || option.disabled,
      className: 'ri-segment-option',
      onDoubleClick: option.onDoubleClick,
      onFocus: (event: React.FocusEvent<HTMLButtonElement>) => reveal(event.currentTarget),
    };
    // Keep Tip inside the primitive, so its open state cannot overwrite the
    // tab/toggle/radio state and its focus policy runs after selection handlers.
    const button = (
      <Tip label={option.hint ?? option.ariaLabel ?? option.label} onlyWhenTextHidden={!option.hint}>
        <button type="button" {...common}>
          {contents}
        </button>
      </Tip>
    );
    const itemProps = { key: option.value, value: option.value, disabled: common.disabled, asChild: true };
    return context.mode === 'tabs' ? (
      <Tabs.Trigger {...itemProps}>{button}</Tabs.Trigger>
    ) : context.selection === 'radio' ? (
      <RadioGroup.Item {...itemProps}>{button}</RadioGroup.Item>
    ) : (
      <ToggleGroup.Item {...itemProps} role="button" aria-checked={undefined} aria-pressed={selected}>
        {button}
      </ToggleGroup.Item>
    );
  });
  const common = { ref: track, className: 'ri-segment-track', 'aria-label': ariaLabel };
  const content =
    context.mode === 'tabs' ? (
      <Tabs.List {...common} loop>
        {items}
      </Tabs.List>
    ) : context.selection === 'radio' ? (
      <RadioGroup.Root
        {...common}
        value={context.value ?? ''}
        onValueChange={context.change}
        orientation="horizontal"
        loop
      >
        {items}
      </RadioGroup.Root>
    ) : (
      <ToggleGroup.Root
        {...common}
        type="single"
        orientation="horizontal"
        value={context.value ?? ''}
        onValueChange={context.change}
        loop
      >
        {items}
      </ToggleGroup.Root>
    );
  return (
    <div
      className={cn(listVariants({ size, grow, stretch, iconOnly }), className)}
      data-edge-left={edges.left || undefined}
      data-edge-right={edges.right || undefined}
    >
      <div ref={scroller} className="ri-segment-scroller">
        {content}
      </div>
    </div>
  );
}

/** Filters and value choices usually need only this options-based entry point. */
export function SegmentedControl<const T extends string>(
  props: Selection<T> & SegmentedListProps<T> & { children?: ReactNode },
) {
  return (
    <SegmentedRoot {...props} className={undefined}>
      <SegmentedList {...props} />
      {props.children}
    </SegmentedRoot>
  );
}

/** Keep-mounted panels can stay laid out for embedded previews and file trees. */
export function SegmentedPanel({
  keepMounted = false,
  preserveLayout = false,
  className,
  ...props
}: Omit<ComponentProps<typeof Tabs.Content>, 'forceMount'> & {
  keepMounted?: boolean;
  preserveLayout?: boolean;
}) {
  const context = useSegment();
  const inactive = context.value !== props.value;
  return (
    <Tabs.Content
      {...props}
      forceMount={keepMounted || preserveLayout ? true : undefined}
      hidden={preserveLayout ? undefined : inactive}
      inert={inactive || undefined}
      aria-hidden={inactive || undefined}
      data-inactive={inactive || undefined}
      data-preserve-layout={preserveLayout || undefined}
      className={cn('ri-segmented-panel', className)}
    />
  );
}
