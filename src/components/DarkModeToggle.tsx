'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function DarkModeToggle({ className = '' }: { className?: string }) {
  const { isDark, toggle } = useDarkMode();

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={toggle}
        className={`p-2 rounded-full hover:bg-natural-accent transition-colors text-natural-muted hover:text-natural-primary focus:outline-none focus:ring-2 focus:ring-natural-primary/20 ${className}`}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </TooltipTrigger>
      <TooltipContent>
        <p>{isDark ? "Switch to light mode" : "Switch to dark mode"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
