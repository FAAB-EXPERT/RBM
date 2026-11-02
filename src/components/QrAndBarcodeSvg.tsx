import React, { useMemo } from 'react';
import { encodeQrMatrix, encodeCode128Bars } from '../qrAndBarcodeUtils';

interface ScannableQrCodeSvgProps {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  className?: string;
}

export const ScannableQrCodeSvg: React.FC<ScannableQrCodeSvgProps> = ({
  value,
  size = 84,
  fgColor = '#c2410c',
  bgColor = '#ffffff',
  className = ''
}) => {
  const matrix = useMemo(() => encodeQrMatrix(value || 'faab gar'), [value]);
  const n = matrix.length;
  const quietZone = 4;
  const totalUnits = n + quietZone * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${totalUnits} ${totalUnits}`}
      shapeRendering="crispEdges"
      className={className}
      aria-label="QR Code Scannable"
    >
      <rect width={totalUnits} height={totalUnits} fill={bgColor} />
      {matrix.map((row, rIdx) =>
        row.map((isDark, cIdx) =>
          isDark ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx + quietZone}
              y={rIdx + quietZone}
              width={1}
              height={1}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  );
};

interface ScannableCode128BarcodeSvgProps {
  value: string;
  width?: number;
  height?: number;
  barColor?: string;
  bgColor?: string;
  showText?: boolean;
  className?: string;
}

export const ScannableCode128BarcodeSvg: React.FC<ScannableCode128BarcodeSvgProps> = ({
  value,
  width = 180,
  height = 28,
  barColor = '#0f172a',
  bgColor = '#ffffff',
  showText = false,
  className = ''
}) => {
  const cleanCode = (value || 'MAT-PILOTE-001').trim();
  const widths = useMemo(() => encodeCode128Bars(cleanCode), [cleanCode]);
  const quietZoneUnits = 10;
  const totalUnits =
    widths.reduce((acc, w) => acc + w, 0) + quietZoneUnits * 2;

  const bars = useMemo(() => {
    const rects: Array<{ x: number; w: number }> = [];
    let curX = quietZoneUnits;
    widths.forEach((w, idx) => {
      if (idx % 2 === 0) {
        rects.push({ x: curX, w });
      }
      curX += w;
    });
    return rects;
  }, [widths]);

  const barAreaHeight = showText ? height - 8 : height;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${totalUnits} ${height}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
      aria-label={`Code-barres CODE-128 : ${cleanCode}`}
    >
      <rect width={totalUnits} height={height} fill={bgColor} />
      {bars.map((b, idx) => (
        <rect
          key={idx}
          x={b.x}
          y={1}
          width={b.w}
          height={barAreaHeight - 2}
          fill={barColor}
        />
      ))}
      {showText && (
        <text
          x={totalUnits / 2}
          y={height - 1}
          textAnchor="middle"
          fontSize="6"
          fontFamily="monospace"
          fontWeight="bold"
          fill={barColor}
        >
          {cleanCode}
        </text>
      )}
    </svg>
  );
};
