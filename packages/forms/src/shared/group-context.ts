import { createContext, useContext } from 'react';

export const ControlGroupCtx = createContext(false);
export const useControlGrouped = () => useContext(ControlGroupCtx);
