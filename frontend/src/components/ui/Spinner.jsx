import { clsx } from 'clsx';

const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-4',
};

/**
 * Spinner loading indicator.
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} fullPage - Center in viewport
 */
export const Spinner = ({ size = 'md', fullPage = false, className = '' }) => {
  const spinner = (
    <div
      role="status"
      aria-label="Loading"
      className={clsx(
        'rounded-full border-slate-200 border-t-[var(--accent-color)] animate-spin',
        sizes[size],
        className
      )}
    />
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
};
