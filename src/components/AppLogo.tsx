import React, { useState } from 'react';
import { FAAB_GAR_LOGO_DATA_URL } from '../logoDataUrl';

interface AppLogoProps {
  className?: string;
}

const LOGO_SOURCES = [
  FAAB_GAR_LOGO_DATA_URL,
  '/faab-gar-logo.svg',
  '/assets/aistudio/logo_faab_gar_a9b4b287.png?v=3',
  '/logo.png?v=3',
  '/favicon.png?v=3'
];

export const AppLogo: React.FC<AppLogoProps> = ({ className = 'w-11 h-11' }) => {
  const [srcIndex, setSrcIndex] = useState(0);

  return (
    <img
      src={LOGO_SOURCES[srcIndex]}
      alt="Logo faab gar"
      onError={() => {
        setSrcIndex(prev => (prev < LOGO_SOURCES.length - 1 ? prev + 1 : prev));
      }}
      className={`${className} object-contain shrink-0 select-none drop-shadow-sm`}
    />
  );
};
