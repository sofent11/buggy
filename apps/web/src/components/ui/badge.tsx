import * as React from 'react';
import { cn } from '../../lib/utils.js';

export function Badge(props: React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn('ui-badge', props.className)} />;
}
