/**
 * Context-scoped field-renderer overrides (MPO-14 / gap GL-4).
 *
 * The module-global registry in fieldRegistry.ts is the DEFAULT table (44
 * built-in fieldtypes) and stays the seam for registering new fieldtypes
 * globally. Per-provider overrides must NOT write that global: two providers
 * (e.g. two <Desk> instances) with different `fields` would clobber each
 * other, last render wins, no error. Overrides therefore ride this context
 * and SchemaForm resolves through {@link useFieldResolver}: context override
 * first, module registry as the (deprecated for overrides) fallback.
 */
import type { ComponentType, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';

import { getFieldComponent } from './field-registry';
import type { FieldRenderProps } from './field-registry';

export type FieldOverrides = Readonly<Record<string, ComponentType<FieldRenderProps>>>;

const FieldOverridesContext = createContext<FieldOverrides | undefined>(undefined);

export interface FieldOverridesProviderProps {
  /** Fieldtype → component overrides scoped to this subtree. */
  fields?: FieldOverrides;
  children: ReactNode;
}

/** Scopes field overrides to a subtree; nests (inner keys win over outer). */
export const FieldOverridesProvider = ({ fields, children }: FieldOverridesProviderProps) => {
  const parent = useContext(FieldOverridesContext);
  const value = useMemo(() => (parent && fields ? { ...parent, ...fields } : (fields ?? parent)), [parent, fields]);
  return <FieldOverridesContext.Provider value={value}>{children}</FieldOverridesContext.Provider>;
};

/**
 * Fieldtype → component resolver: context overrides first, then the
 * module-global registry. The resolver every schema-driven form must use.
 */
export const useFieldResolver = (): ((fieldtype: string) => ComponentType<FieldRenderProps> | undefined) => {
  const overrides = useContext(FieldOverridesContext);
  return useCallback((fieldtype: string) => overrides?.[fieldtype] ?? getFieldComponent(fieldtype), [overrides]);
};
