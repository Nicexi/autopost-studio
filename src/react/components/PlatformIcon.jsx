import React from 'react';
import { PLATFORM_ICONS } from './platforms';

export default function PlatformIcon({ platform }) {
  return <svg className="platform-icon" aria-label={platform}><use href={`#${PLATFORM_ICONS[platform] || 'icon-tuite'}`} /></svg>;
}
