'use client';

import React, { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, RemoveFormatting, Strikethrough, Underline } from 'lucide-react';
import { sanitizeRichTextHtml } from '../lib/richText';

type RichTextEditorProps = {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  style?: React.CSSProperties;
  singleLine?: boolean;
};

const TOOLBAR_ITEMS: Array<{
  command: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { command: 'bold', label: 'Bold', icon: Bold },
  { command: 'italic', label: 'Italic', icon: Italic },
  { command: 'underline', label: 'Underline', icon: Underline },
  { command: 'strikeThrough', label: 'Strikethrough', icon: Strikethrough },
  { command: 'insertUnorderedList', label: 'Bulleted list', icon: List },
  { command: 'insertOrderedList', label: 'Numbered list', icon: ListOrdered },
  { command: 'removeFormat', label: 'Clear formatting', icon: RemoveFormatting },
];

function normalizeHtml(value: string): string {
  return value
    .replace(/<div><br><\/div>/gi, '<br>')
    .replace(/(\s|<br\s*\/?>)+$/gi, '')
    .trim();
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value = '',
  onChange,
  placeholder,
  className,
  editorClassName,
  style,
  singleLine = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const safeValue = sanitizeRichTextHtml(value);
    if (document.activeElement === editor) return;
    if (normalizeHtml(editor.innerHTML) !== normalizeHtml(safeValue)) {
      editor.innerHTML = safeValue;
    }
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(sanitizeRichTextHtml(editor.innerHTML));
  };

  const runCommand = (command: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand(command, false);
    emitChange();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emitChange();
  };

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-natural-border bg-white px-2 py-1.5">
        {TOOLBAR_ITEMS.map(({ command, label, icon: Icon }) => (
          <button
            key={command}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => runCommand(command)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-natural-muted transition-colors hover:bg-natural-accent hover:text-natural-primary"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline={!singleLine}
        suppressContentEditableWarning
        data-placeholder={placeholder || ''}
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (singleLine && event.key === 'Enter') {
            event.preventDefault();
          }
        }}
        className={`richtext-editor ${editorClassName || ''}`}
        style={style}
      />
    </div>
  );
};

