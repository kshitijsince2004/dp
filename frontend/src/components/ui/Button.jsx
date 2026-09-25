import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white font-bold',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-600',
  outline: 'bg-transparent border border-[var(--accent-color)] text-[var(--accent-color)] hover:bg-[var(--accent-color)]/10',
};

const sizes = {
  sm: 'h-8 px-3 text-sm rounded-control',
  md: 'h-9 px-4 text-sm rounded-control',
  lg: 'h-10 px-5 text-sm rounded-control',
};

/**
 * Reusable Button component.
 *
 * @param {'primary'|'secondary'|'danger'|'ghost'|'outline'} variant
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} isLoading
 * @param {boolean} fullWidth
 */
export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  className = '',
  disabled,
  as: Component = 'button',
  ...props
}) => {
  return (
    <Component
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={Component === 'button' ? (isLoading || disabled) : undefined}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </Component>
  );
};
