import { createContext, useContext } from 'react';

export const LangContext = createContext(null);

export const useLang = () => useContext(LangContext);
