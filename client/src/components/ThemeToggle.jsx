import React from 'react';
import {Sun,Moon} from 'lucide-react';
import {useTheme} from '../utils/theme';

/** Small sun/moon button for headers. The full choice (light / dark / system) lives in Settings. */
export default function ThemeToggle({className='icon-button'}){
  const {resolved,toggle}=useTheme();const dark=resolved==='dark';
  return <button type="button" className={className} onClick={toggle} title={dark?'Switch to light mode':'Switch to dark mode'} aria-label={dark?'Switch to light mode':'Switch to dark mode'}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button>;
}
