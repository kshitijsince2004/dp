import { forwardRef } from 'react';
import { clsx } from 'clsx';

/**
 * Reusable Input component with label, error state, and helper text.
 */
export const Input = forwardRef(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-slate-600"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={clsx(
            'w-full h-10 px-3 rounded-control bg-white border text-slate-900 text-sm placeholder:text-slate-400 transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent',
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-300 hover:border-slate-400',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        {helperText && !error && (
          <p className="text-xs text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
