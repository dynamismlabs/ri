"use client";

import { TextArea } from '@/components/system/text-area';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
import { EmojiPicker } from "@/components/shared/emoji-picker";
import type { Attachment } from '@/db/types';
import { useCreateArea } from "@/hooks/use-areas";
import { useTouchFirst } from "@/hooks/use-touch-first";
import { matchesSendKey } from "@/constants/commands";
import { uploadAttachment } from "@/lib/attachments/client";
import { cn } from "@/lib/utils";
import { ImagePlus, Loader2, SmilePlus, Trash2, X } from "lucide-react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import { useCallback, useRef, useState, type FormEvent } from "react";

interface AreaCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AreaCreateModal({ open, onOpenChange }: AreaCreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const touchFirst = useTouchFirst();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createArea = useCreateArea();

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setEmoji(null);
    setAttachment(null);
  }, []);

  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) return;

      setUploading(true);
      try {
        const uploaded = await uploadAttachment(file);
        setAttachment(uploaded);
      } catch (err) {
        console.error("[area-create] image upload failed", err);
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const handleRemoveImage = useCallback(() => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName || createArea.isPending) return;

    createArea.mutate(
      {
        name: trimmedName,
        description: description.trim() || undefined,
        emoji: emoji ?? undefined,
        attachments: attachment ? [attachment] : [],
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  }, [name, description, attachment, emoji, createArea, onOpenChange, resetForm]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleNameInput = useCallback(
    (e: FormEvent<HTMLTextAreaElement>) => {
      const target = e.currentTarget;
      setName(target.value);
    },
    []
  );

  // The description takes more than one line: Enter creates on a computer
  // and adds a line on a phone or tablet, where Create area does it.
  const handleDescriptionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!matchesSendKey(e.nativeEvent, touchFirst)) return;
      e.preventDefault();
      handleSubmit();
    },
    [handleSubmit, touchFirst]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) resetForm();
      onOpenChange(open);
    },
    [onOpenChange, resetForm]
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content data-slot="dialog-content" data-kind="wrapped" className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-200">
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>New Area</DialogPrimitive.Title>
            <DialogPrimitive.Description>Create a new area</DialogPrimitive.Description>
          </VisuallyHidden.Root>
          <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="text-xs font-semibold tracking-wide text-foreground">
                New Area
              </span>
              <DialogPrimitive.Close asChild>
                <IconButton
                  label="Close new area"
                  variant="ghost"
                  size="xs"
                >
                  <X size={16} />
                </IconButton>
              </DialogPrimitive.Close>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Emoji / Image upload */}
              <div className="flex justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                {attachment ? (
                  <div className="relative group">
                    <img
                      src={`/api/attachments/${attachment.fileName}`}
                      alt="Area image"
                      className="w-20 h-20 rounded-xl object-cover border border-border"
                    />
                    <IconButton
                      onClick={handleRemoveImage}
                      label="Remove area image"
                      variant="ghost"
                      size="xs"
                      tone="danger"
                      reveal
                      className="absolute -top-1.5 -right-1.5"
                    >
                      <Trash2 size={10} />
                    </IconButton>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div className="relative group">
                      <EmojiPicker onSelect={(e) => setEmoji(e)}>
                        <button data-slot="image-picker"
                          className={cn(
                            "w-20 h-20 rounded-xl border border-border",
                            "flex flex-col items-center justify-center gap-1",
                            "transition-colors cursor-pointer",
                            emoji
                              ? "text-4xl bg-accent/30"
                              : "border-dashed border-2 text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                          )}
                        >
                          {emoji ? (
                            emoji
                          ) : (
                            <>
                              <SmilePlus size={20} />
                              <span className="text-[9px] font-medium">Emoji</span>
                            </>
                          )}
                        </button>
                      </EmojiPicker>
                      {emoji && (
                        <IconButton
                          onClick={() => setEmoji(null)}
                          label="Remove area emoji"
                          variant="ghost"
                          size="xs"
                          tone="danger"
                          reveal
                          className="absolute -top-1.5 -right-1.5"
                        >
                          <Trash2 size={10} />
                        </IconButton>
                      )}
                    </div>
                    <button data-slot="image-picker"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className={cn(
                        "w-20 h-20 rounded-xl border-2 border-dashed border-border",
                        "flex flex-col items-center justify-center gap-1",
                        "text-muted-foreground hover:text-foreground hover:border-muted-foreground",
                        "transition-colors cursor-pointer disabled:opacity-50"
                      )}
                    >
                      {uploading ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <>
                          <ImagePlus size={20} />
                          <span className="text-[9px] font-medium">Image</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Name */}
              <div>
                <TextArea
                  value={name}
                  onInput={handleNameInput}
                  onKeyDown={handleNameKeyDown}
                  aria-label="Area name"
                  placeholder="Area name"
                  className="w-full"
                  autoFocus
                  rows={1}
                  purpose="title"
                  titleSize="form"
                  autoSize
                  align="center"
                />
              </div>

              {/* Description */}
              <div>
                <TextArea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={handleDescriptionKeyDown}
                  aria-label="Area description"
                  placeholder="Description (optional)"
                  className="w-full"
                  purpose="embedded"
                  rows={3}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="md"
                >
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                onClick={handleSubmit}
                disabled={!name.trim() || createArea.isPending}
                variant="primary"
                size="md"
                className="flex items-center gap-1.5"
              >
                {createArea.isPending && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                Create area
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
