/** DOM-only domain tests keep menu paint inline while preserving controlled trigger events. */
import {
  cloneElement,
  createContext,
  createElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
const Toggle = createContext<() => void>(() => {});
export function Popover({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const [local, setLocal] = useState(false);
  return createElement(
    Toggle.Provider,
    {
      value: () => {
        setLocal(!local);
        onOpenChange?.(!(open ?? local));
      },
    },
    children,
  );
}
export function PopoverTrigger({
  children,
}: {
  children: ReactElement<{ onClick?: () => void }>;
}) {
  const toggle = useContext(Toggle);
  return cloneElement(children, {
    onClick: () => {
      children.props.onClick?.();
      toggle();
    },
  });
}
export function PopoverContent({ children }: { children?: ReactNode }) {
  return createElement('div', { 'data-chat-menu': '' }, children);
}
