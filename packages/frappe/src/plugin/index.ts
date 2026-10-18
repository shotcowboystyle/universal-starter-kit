import type { CreateSourceFileOptions, createSourceFile, LanguageService, ScriptTarget, SourceFile } from 'typescript';

interface JsonSchema {
  $ref?: string;
  enum?: unknown[];
  type?: string;
  properties?: Record<string, JsonSchema | null | undefined>;
  required?: string[];
  items?: JsonSchema | null;
  schema?: { type?: string } | null;
}

interface OpenAPI {
  components?: {
    schemas?: Record<string, JsonSchema | null | undefined>;
  };
  paths?: Record<string, OpenApiPathItem>;
}

// Only the path keys are read; the item body is never inspected.
interface OpenApiPathItem {
  summary?: string;
  description?: string;
}

interface PluginConfig {
  openapiUrl?: string;
  namespace?: string;
  cacheTTL?: number;
}

type LanguageVersion = ScriptTarget | CreateSourceFileOptions;

interface PluginCreateInfo {
  config?: PluginConfig | null;
  languageService: LanguageService;
}

interface LanguageServiceProxy {
  getExternalFiles: () => string[];
  getSourceFile: (
    fileName: string,
    languageVersion: LanguageVersion,
    _onError?: (message: string) => void,
    _shouldCreateNewSourceFile?: boolean,
    _length?: number,
  ) => SourceFile | undefined;
}

const VIRTUAL_FILE = 'frappe-virtual-types.d.ts';

const safe = (s: string): string => s.replaceAll(/[^a-zA-Z0-9_]/gu, '_');

const mapType = (v: JsonSchema | null | undefined): string => {
  if (!v) {
    return 'any';
  }
  if (v.$ref !== undefined && v.$ref !== '') {
    return safe(v.$ref.split('/').pop() ?? 'any');
  }
  const t = v.type ?? v.schema?.type;
  if (t === 'string') {
    return 'string';
  }
  if (t === 'integer' || t === 'number') {
    return 'number';
  }
  if (t === 'boolean') {
    return 'boolean';
  }
  if (t === 'array') {
    return `${mapType(v.items)}[]`;
  }
  if (t === 'object') {
    return 'Record<string, any>';
  }
  return 'any';
};

const collectDoctypes = (paths: Record<string, OpenApiPathItem>): Set<string> => {
  const doctypes = new Set<string>();
  for (const p of Object.keys(paths)) {
    const parts = p.split('/').filter(Boolean);
    const idx = parts.indexOf('resource');
    if (idx !== -1 && parts[idx + 1]) {
      doctypes.add(parts[idx + 1]);
    }
  }
  return doctypes;
};

const emitSchema = (lines: string[], name: string, schema: JsonSchema | null | undefined): void => {
  if (schema?.enum) {
    const members = schema.enum.map((x) => JSON.stringify(x)).join(' | ');
    lines.push(`  export type ${safe(name)} = ${members}`);
    return;
  }
  if (schema?.type === 'object' && schema.properties) {
    lines.push(`  export interface ${safe(name)} {`);
    const rq = new Set(Array.isArray(schema.required) ? schema.required : []);
    for (const [k, v] of Object.entries(schema.properties)) {
      const optional = !rq.has(k);
      lines.push(`    ${safe(k)}${optional ? '?' : ''}: ${mapType(v)}`);
    }
    lines.push('  }');
  }
};

const emitDTS = (spec: OpenAPI, namespace: string): string => {
  const lines: string[] = [];
  lines.push(`declare module "${namespace}" {`);
  const schemas = spec.components?.schemas ?? {};
  const doctypeUnion = [...collectDoctypes(spec.paths ?? {})].map((d) => `'${d}'`).join(' | ') || 'string';
  lines.push(`  export type Doctype = ${doctypeUnion}`);
  for (const [name, schema] of Object.entries(schemas)) {
    emitSchema(lines, name, schema);
  }
  lines.push('}');
  return lines.join('\n');
};

const init = (modules: { typescript: { createSourceFile: typeof createSourceFile } }) => {
  const ts = modules.typescript;
  let openapi: OpenAPI | null = null;
  let ns = '@frappe/types';
  let lastFetch = 0;
  let ttl = 60_000;

  const getExternalFiles = (): string[] => (openapi ? [VIRTUAL_FILE] : []);

  const create = (info: PluginCreateInfo): LanguageServiceProxy => {
    const config = info.config ?? {};
    const url = config.openapiUrl ?? '';
    ns = config.namespace ?? ns;
    ttl = config.cacheTTL ?? ttl;

    const ensureOpenAPI = async () => {
      const now = Date.now();
      if (openapi && now - lastFetch < ttl) {
        return;
      }
      if (!url) {
        return;
      }
      try {
        const res = await fetch(url);
        // SAFETY: trusted dev-time OpenAPI document from the user's tsconfig; emitDTS treats every
        // nested level as optional, so a partial document only yields fewer generated types.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tsserver plugins have no schema validator; res.json() is the I/O boundary
        openapi = (await res.json()) as OpenAPI;
        lastFetch = now;
      } catch {
        // Safe to continue: generated types stay absent/stale and the next diagnostics pass retries.
      }
    };

    const proxy = new Proxy(info.languageService, {
      get(target, prop: keyof LanguageService) {
        if (prop !== 'getSemanticDiagnostics') {
          return target[prop];
        }
        return async function get(
          this: LanguageService,
          ...args: Parameters<LanguageService['getSemanticDiagnostics']>
        ) {
          await ensureOpenAPI();
          return target.getSemanticDiagnostics.apply(this, args);
        };
      },
    });

    // The trailing tsserver arguments are accepted by the interface but unused here.
    const getSourceFile = (fileName: string, languageVersion: LanguageVersion) =>
      fileName === VIRTUAL_FILE && openapi
        ? ts.createSourceFile(fileName, emitDTS(openapi, ns), languageVersion)
        : undefined;

    return {
      ...proxy,
      getExternalFiles,
      getSourceFile,
    };
  };

  return { create };
};

// Export for ES modules (CJS is handled by the build tool)
export default init;
