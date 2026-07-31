import { clsx } from 'clsx';

/**
 * @param {'default'|'bordered'} variant
 */
export const Card = ({
  children,
  variant = 'default',
  className = '',
  padding = true,
  ...props
}) => {
  const variants = {
    default: 'bg-slate-50 border border-slate-200',
    bordered: 'bg-transparent border border-slate-300',
  };

  return (
    <div
      className={clsx(
        'rounded-card',
        variants[variant],
        padding && 'p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
