import { createContext } from 'react';

/** Lets charts inside a visual know when the visual is in focus (full-screen) mode. */
export const VisualContext = createContext<{ focus: boolean }>({ focus: false });
