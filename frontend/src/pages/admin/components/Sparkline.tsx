import React, { useEffect, useRef, useState } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data, width = 60, height = 24,
  color = '#fb923c', className = '',
}) => {
  const pathRef = useRef<SVGPolylineElement>(null);
  const [dashLen, setDashLen] = useState(0);
  const [animated, setAnimated] = useState(false);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = (max - min) || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  useEffect(() => {
    if (pathRef.current) {
      const len = pathRef.current.getTotalLength?.() ?? 200;
      setDashLen(len);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimated(true));
      });
    }
  }, [points]);

  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <svg
      width={width} height={height}
      className={`opacity-60 ${className}`}
      aria-hidden="true"
    >
      <polyline
        ref={pathRef}
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={prefersReduced ? undefined : {
          strokeDasharray: dashLen,
          strokeDashoffset: animated ? 0 : dashLen,
          transition: 'stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
    </svg>
  );
};
