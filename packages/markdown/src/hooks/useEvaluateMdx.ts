import type { MDXComponents } from 'mdx/types';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';

export function useEvaluateMdx(code?: string, options?: Record<string, any>) {
  const [Component, setComponent] = useState<ComponentType<{ components?: Record<string, any> }>>();

  useEffect(() => {
    if (!code) {
      return;
    }
    try {
      const Evaluated = evaluateMdx(code, options);
      setComponent(() => Evaluated);
    } catch (error) {
      console.error('useEvaluateMdx: failed to evaluate compiled MDX', error);
      setComponent(undefined);
    }
  }, [code, options]);

  return Component;
}

function evaluateMdx(code: string, options?: Record<string, any>) {
  return run(code, {
    ...jsxRuntime,
    ...options,
  }).default as ComponentType<{ components?: MDXComponents }>;
}

const AsyncFunction = Object.getPrototypeOf(run).constructor;
function run(code: string, options: Record<string, any>) {
  return new AsyncFunction(String(code))(options);
}
