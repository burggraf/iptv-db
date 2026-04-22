import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

const Progress = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { value?: number }>(
  ({ className, value = 0, ...props }, ref) => (
    <div ref={ref} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)} {...props}>
      <div
        className="h-full bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
  ),
);
Progress.displayName = 'Progress';

export { Progress };
