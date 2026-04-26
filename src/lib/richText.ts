const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'BR',
  'P',
  'DIV',
  'UL',
  'OL',
  'LI',
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeRichHtml(value: string): string {
  return value
    .replace(/<div><br><\/div>/gi, '<br>')
    .replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '')
    .trim();
}

export function sanitizeRichTextHtml(value: string | undefined | null): string {
  const source = (value || '').trim();
  if (!source) return '';

  if (typeof window === 'undefined') {
    return normalizeRichHtml(escapeHtml(source).replace(/\n/g, '<br>'));
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${source}</div>`, 'text/html');
  const container = parsed.body.firstElementChild;
  if (!container) return '';

  const cleanDoc = document.implementation.createHTMLDocument('');
  const cleanRoot = cleanDoc.createElement('div');

  const appendSafeNode = (node: Node, parent: HTMLElement) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(cleanDoc.createTextNode(node.textContent || ''));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase();

    if (!ALLOWED_TAGS.has(tag)) {
      Array.from(element.childNodes).forEach((child) => appendSafeNode(child, parent));
      return;
    }

    const cleanElement = cleanDoc.createElement(tag.toLowerCase());
    parent.appendChild(cleanElement);
    Array.from(element.childNodes).forEach((child) => appendSafeNode(child, cleanElement));
  };

  Array.from(container.childNodes).forEach((node) => appendSafeNode(node, cleanRoot));
  return normalizeRichHtml(cleanRoot.innerHTML);
}

export function stripRichText(value: string | undefined | null): string {
  const source = value || '';
  if (!source) return '';

  if (typeof window === 'undefined') {
    return source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(source, 'text/html');
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
}

