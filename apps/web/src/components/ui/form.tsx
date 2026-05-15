import * as React from 'react';
import { cn } from '../../lib/utils.js';

export function FormActions(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-form-actions', props.className)} />;
}

export function Field(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={cn('ui-field', props.className)} />;
}

export function FieldLabel(props: React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn('ui-field-label', props.className)} />;
}
