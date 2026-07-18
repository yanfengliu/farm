/**
 * Minimal DOM patching for panel re-renders. Rewriting innerHTML on every
 * live-data change replaces nodes under the player's cursor, restarting hover
 * transitions as visible flicker. Morphing keeps every unchanged element's
 * identity - hover, focus, and CSS transitions survive - while changed text,
 * attributes, and structure update in place.
 */
export function morphInto(target: Element, markup: string): void {
  const template = target.ownerDocument.createElement('template');
  template.innerHTML = markup;
  morphChildren(target, template.content);
}

function morphChildren(current: Element | DocumentFragment, next: DocumentFragment | Element): void {
  const currentNodes = [...current.childNodes];
  const nextNodes = [...next.childNodes];
  const shared = Math.min(currentNodes.length, nextNodes.length);
  for (let index = 0; index < shared; index += 1) {
    morphNode(currentNodes[index]!, nextNodes[index]!);
  }
  for (const stale of currentNodes.slice(shared)) stale.remove();
  for (const added of nextNodes.slice(shared)) current.appendChild(added);
}

function morphNode(current: ChildNode, next: ChildNode): void {
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
    current.replaceWith(next);
    return;
  }
  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (current instanceof Element && next instanceof Element) {
    morphAttributes(current, next);
    // Form control state lives outside attributes; canvases carry painted
    // pixels. Both would be destroyed by child replacement, so leave live
    // values alone and let dedicated code own them.
    if (!(current instanceof HTMLCanvasElement)) morphChildren(current, next);
  }
}

function morphAttributes(current: Element, next: Element): void {
  for (const attribute of [...current.attributes]) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of [...next.attributes]) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
  // A rewritten value attribute does not move a dirty input's live value the
  // way innerHTML replacement used to. Focused controls stay untouched - the
  // renderer already skips them - but a blurred control follows the state.
  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    if (current.ownerDocument.activeElement !== current && current.value !== next.value) {
      current.value = next.value;
    }
  }
  if (current instanceof HTMLTextAreaElement && next instanceof HTMLTextAreaElement) {
    if (current.ownerDocument.activeElement !== current && current.value !== next.value) {
      current.value = next.value;
    }
  }
}
