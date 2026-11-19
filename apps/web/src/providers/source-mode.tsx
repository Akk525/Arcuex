'use client';
import { createContext, useContext } from 'react';
export const FixtureModeContext = createContext(false);
export const useFixtureMode = () => useContext(FixtureModeContext);
