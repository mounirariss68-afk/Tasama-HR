/**
 * Translation and direction, at the component boundary.
 *
 * An app registers one translator and one direction; the layout primitives
 * below run every plain-string label through it. That is deliberate: it means a
 * bilingual app translates its chrome, its panel titles, its stat labels and
 * its navigation without a call site in every screen, and a monolingual app
 * pays nothing — the default translator is the identity function.
 *
 * Only `string` is translated. A ReactNode passes through untouched, because a
 * component that has already composed its own markup knows better than a
 * lookup table what its parts mean.
 */
import { createElement, type ReactNode } from 'react';

export type Direction = 'ltr' | 'rtl';

let translate: (s: string) => string = (s) => s;
let direction: Direction = 'ltr';

export function setTranslator(fn: (s: string) => string) {
  translate = fn;
}

export function setDirection(dir: Direction) {
  direction = dir;
}

export const getDirection = (): Direction => direction;

/**
 * Translate a label if it is a plain string; otherwise leave it alone.
 *
 * A string that has no translation yet is wrapped in a <bdi dir="ltr"> when the
 * page is running right-to-left. Without it, an English sentence inside an
 * Arabic page has its full stop dragged to the left-hand end — the single most
 * obvious sign of a half-finished localisation, and avoidable.
 */
export function tr(node: ReactNode): ReactNode {
  if (typeof node !== 'string') return node;
  const out = translate(node);
  if (direction === 'rtl' && out === node && /[A-Za-z]/.test(node)) {
    return createElement('bdi', { dir: 'ltr' }, node);
  }
  return out;
}

/** The string form, for placeholders, titles and aria labels. */
export const trs = (s: string): string => translate(s);
