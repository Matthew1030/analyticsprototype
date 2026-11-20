import { createContext } from 'react';

/** Lets charts inside a visual know when the visual is in focus (full-screen) mode. */
export const VisualContext = createContext<{ focus: boolean }>({ focus: false });

/** One-screen pages (v1 (B)): charts fill the height of their visual instead of a fixed height. */
export const ChartFillContext = createContext(false);
