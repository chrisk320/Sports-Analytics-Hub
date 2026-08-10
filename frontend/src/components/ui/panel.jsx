import React from 'react';
import { cn } from '@/lib/utils';

const TONE_CLASSES = {
  default: 'rounded-xl border border-slate-800 bg-slate-900',
  primary: 'rounded-2xl border border-purple-500/40 bg-slate-900',
  plain: '',
};

export function Panel({ as = 'div', tone = 'default', padded = true, header, className, children, ...props }) {
  const Comp = as;
  if (header) {
    return (
      <Comp className={TONE_CLASSES[tone]} {...props}>
        <div className="flex items-center justify-between border-b border-slate-800 p-4">{header}</div>
        {className ? <div className={className}>{children}</div> : children}
      </Comp>
    );
  }
  return (
    <Comp className={cn(TONE_CLASSES[tone], padded && 'p-5', className)} {...props}>
      {children}
    </Comp>
  );
}

export default Panel;
