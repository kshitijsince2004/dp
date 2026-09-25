import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * Measures the parent box and only mounts Recharts with positive numeric
 * width/height. Avoids the "width(-1) and height(-1)" warning that fires when
 * ResponsiveContainer uses percentage sizing inside a not-yet-laid-out parent.
 */
export default function SafeResponsiveContainer({
  children,
  className = '',
  debounce = 50,
  minWidth = 0,
  // Accept legacy width/height props from call sites but ignore percentage values —
  // measured pixel size is always used to avoid Recharts -1 warnings.
  width: _ignoredWidth,
  height: _ignoredHeight,
  ...rest
}) {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let timer = null;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const next = {
        width: Math.max(0, Math.floor(width)),
        height: Math.max(0, Math.floor(height)),
      };
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, debounce);
    });
    ro.observe(el);

    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [debounce]);

  const ready = size.width > 0 && size.height > 0;

  return (
    <div ref={ref} className={`h-full w-full min-w-0 min-h-0 ${className}`.trim()}>
      {ready ? (
        <ResponsiveContainer
          {...rest}
          width={size.width}
          height={size.height}
          minWidth={minWidth}
        >
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
