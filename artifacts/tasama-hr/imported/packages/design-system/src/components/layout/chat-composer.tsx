import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { Plus, Send } from 'lucide-react';
import { cn } from '../../lib/utils';

export const CHAT_INPUT_LIMIT = 4000;
/** The counter appears only this close to the cap. */
const COUNTER_THRESHOLD = 200;

export type ComposerAttachment = {
  id: string;
  name: string;
  status?: 'uploading' | 'ready' | 'error';
};

/**
 * The chat composer: a fixed bar at the bottom of the chat column. Anatomy,
 * left to right — 36px circular "+" button, the 22px-radius input pill with a
 * borderless auto-growing textarea, and the 32px circular accent send button.
 * These sizes are part of the design system; do not re-scale them per app.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onAttach,
  onFilesDropped,
  attachments = [],
  busy = false,
  placeholder = 'Ask anything…',
  limit = CHAT_INPUT_LIMIT,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Omit to hide the attach button. */
  onAttach?: () => void;
  onFilesDropped?: (files: FileList) => void;
  attachments?: ReadonlyArray<ComposerAttachment>;
  /** True while a reply is streaming: dims the input and disables send. */
  busy?: boolean;
  placeholder?: string;
  limit?: number;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);

  const over = value.length > limit;
  const showCounter = value.length > limit - COUNTER_THRESHOLD;
  const uploading = attachments.some((file) => file.status === 'uploading');
  const canSend = value.trim().length > 0 && !busy && !over && !uploading;

  // Auto-grow the textarea up to max-h-40 (160px), then scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend();
  }, [canSend, onSend]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) onFilesDropped?.(event.dataTransfer.files);
  };

  return (
    <div
      className={cn(
        'shrink-0 border-t border-border bg-background/20 p-3 backdrop-blur-sm',
        dragging && 'ring-2 ring-inset ring-primary',
        className,
      )}
      onDragOver={(event) => {
        if (!onFilesDropped) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onFilesDropped ? onDrop : undefined}
    >
      {attachments.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((file) => (
            <li
              key={file.id}
              className={cn(
                'max-w-[160px] truncate rounded-md border border-border px-2 py-1 font-mono text-xs',
                file.status === 'error'
                  ? 'border-danger/40 text-danger'
                  : 'text-muted-foreground',
                file.status === 'uploading' && 'animate-pulse',
              )}
              title={file.name}
            >
              {file.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        {onAttach ? (
          <button
            type="button"
            onClick={onAttach}
            aria-label="Add attachment"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/40 text-muted-foreground backdrop-blur-md transition-colors hover:bg-background/60 hover:text-primary"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}

        <div
          className={cn(
            'flex min-w-0 flex-1 items-end gap-1.5 rounded-[22px] border bg-background/40 py-1.5 pe-1.5 ps-4 backdrop-blur-md transition-colors focus-within:ring-1',
            over
              ? 'border-danger focus-within:border-danger focus-within:ring-danger'
              : 'border-border focus-within:border-primary focus-within:ring-primary',
          )}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Message"
            className={cn(
              'max-h-40 min-w-0 flex-1 resize-none border-none bg-transparent py-1.5 text-xs leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none',
              busy && 'opacity-60',
            )}
          />
          {showCounter ? (
            <span
              className={cn(
                'pb-1.5 font-mono text-[10px]',
                over ? 'text-danger' : 'text-muted-foreground',
              )}
            >
              {value.length}/{limit}
            </span>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            // A disabled control that does not say why is a control the
            // viewer has to guess at, and a screen reader announces as
            // simply unavailable.
            title={canSend ? 'Send' : 'Type a message first'}
            aria-label="Send"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-primary/15 disabled:text-primary/70"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
