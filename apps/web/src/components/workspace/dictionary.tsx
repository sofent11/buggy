import { createContext, useContext, type ReactNode } from 'react';
import type { Dictionary, DictionaryValue } from '@buggy/shared-types';
import { labelOf } from '../../labels.js';

const DictionaryContext = createContext<Dictionary[]>([]);

export function DictionaryProvider(props: { dictionaries: Dictionary[]; children: ReactNode }) {
  return <DictionaryContext.Provider value={props.dictionaries}>{props.children}</DictionaryContext.Provider>;
}

export function useDictionaryOptions(type?: string, fallback: readonly string[] = []): DictionaryValue[] {
  const dictionaries = useContext(DictionaryContext);
  if (!type) return fallback.map((key, index) => fallbackValue(key, index));
  const values = dictionaries.find((item) => item.type === type)?.values.filter((item) => item.enabled) || [];
  if (values.length === 0) return fallback.map((key, index) => fallbackValue(key, index));
  return [...values].sort((a, b) => a.sort - b.sort);
}

export function useDictionaryValue(key?: string, type?: string) {
  const dictionaries = useContext(DictionaryContext);
  if (!key) return undefined;
  const scoped = type ? dictionaries.filter((item) => item.type === type) : dictionaries;
  return scoped.flatMap((item) => item.values).find((item) => item.key === key && item.enabled);
}

export function dictionaryLabel(value?: DictionaryValue, key?: string) {
  if (!key) return '-';
  return value?.label || labelOf(key);
}

export function dictionaryStyle(value?: DictionaryValue) {
  if (!value?.color) return undefined;
  return {
    color: value.color,
    borderColor: `${value.color}55`,
    background: `${value.color}14`
  };
}

function fallbackValue(key: string, index: number): DictionaryValue {
  return { key, label: labelOf(key), sort: (index + 1) * 10, enabled: true };
}
