"use client";
import { MenuAction } from '@/components/system/menu-action';

import { IconButton } from '@/components/system/icon-button';
import { useState } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface RowAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  title?: string;
  className?: string;
  iconSize?: number;
}

export function RowActionsMenu({ actions, title = 'Actions', className, iconSize = 16 }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <>
      <IconButton
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        label={title}
        variant="ghost"
        size="xs"
        focus="inside"
        className={cn("md:hidden", className)}
      >
        <MoreHorizontal size={iconSize} />
      </IconButton>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl px-3 pb-6 pt-3">
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />
          <div className="flex flex-col">
            {actions.map((action) => (
              <MenuAction tone={action.destructive ? "error" : "neutral"}
                key={action.id}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className="flex items-center gap-3 text-left"
              >
                <action.icon size={18} className="flex-shrink-0" />
                <span className="text-sm font-medium">{action.label}</span>
              </MenuAction>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
