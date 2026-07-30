import type { PlatformSelectors } from '../../shared/types';

let currentSelectors: PlatformSelectors | null = null;

export function setSelectors(selectors: PlatformSelectors): void {
  currentSelectors = selectors;
}

export function getSelector(key: keyof PlatformSelectors): string | null {
  if (!currentSelectors) return null;
  return currentSelectors[key] || null;
}

export function hasSelectors(): boolean {
  return currentSelectors !== null;
}
