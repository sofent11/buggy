import * as React from 'react';
import { cn } from '../../lib/utils.js';

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-card', props.className)} />;
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-card-header', props.className)} />;
}

export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={cn('ui-card-title', props.className)} />;
}

export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-card-content', props.className)} />;
}
