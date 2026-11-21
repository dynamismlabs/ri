"use client";
import { Field } from '@/components/system/field';

import { IconButton } from '@/components/system/icon-button';
import { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}

export function TagEditor({ tags, onChange, className }: TagEditorProps) {
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRemove = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleAdd = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setAdding(false);
  };

  return (
    <div className={cn('inline-flex items-center gap-1 flex-wrap', className)}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="group/tag inline-flex items-center gap-0.5 text-[8px] font-bold text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors"
        >
          {tag}
          <IconButton
            onClick={(e) => { e.stopPropagation(); handleRemove(tag); }}
            label={`Remove tag ${tag}`}
            reveal="tag"
            variant="ghost"
            size="xs"
          >
            <X size={7} />
          </IconButton>
        </span>
      ))}
      {adding ? (
        <Field
          ref={inputRef}
          autoFocus
          type="text"
          placeholder="tag"
          className="w-16"
          onBlur={(e) => handleAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') setAdding(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
          <IconButton
            onClick={(e) => { e.stopPropagation(); setAdding(true); }}
            label="Add tag"
            tooltip="Add tag"
            variant="ghost"
            size="xs"
            className="inline-flex items-center"
          >
            <Plus size={8} />
          </IconButton>
      )}
    </div>
  );
}
