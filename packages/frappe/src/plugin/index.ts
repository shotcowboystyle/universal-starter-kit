interface OpenAPI {
  components?: {
    schemas?: Record<string, any>;
  };
  paths?: Record<string, any>;
}

interface PluginConfig {
  openapiUrl?: string;
  namespace?: string;
  cacheTTL?: number;
}

interface LanguageServiceProxy {
  getExternalFiles(): string[];
  getSourceFile(
    fileName: string,
    languageVersion: any,
    _onError?: any,
    _shouldCreateNewSourceFile?: boolean,
    _length?: number,
  ): any;
}

function init(modules: { typescript: any }) {
  const ts = modules.typescript;
  let openapi: OpenAPI | null = null;
  let ns = '@frappe/types';
  let lastFetch = 0;
  let ttl = 60_000;

  function create(info: any): LanguageServiceProxy {
    const config: PluginConfig = info.config ?? {};
    const url = (config.openapiUrl ?? '').toString();
    ns = (config.namespace ?? ns).toString();
    ttl = Number(config.cacheTTL ?? ttl);

    async function ensureOpenAPI() {
      const now = Date.now();
      if (openapi && now - lastFetch < ttl) {
        return;
      }
      if (!url) {
        return;
      }
      try {
        const res = await fetch(url);
        openapi = await res.json();
        lastFetch = now;
      } catch {
        // Silently ignore fetch errors
      }
    }

    const proxy = new Proxy(info.languageService, {
      get(target: any, prop: string) {
        if (prop !== 'getSemanticDiagnostics') {
          return target[prop];
        }
        return async function get(this: any, ...args: any[]) {
          await ensureOpenAPI();
          return target.getSemanticDiagnostics.apply(this, args);
        };
      },
    });

    function getExternalFiles(): string[] {
      return openapi ? ['frappe-virtual-types.d.ts'] : [];
    }

    function getSourceFile(
      fileName: string,
      languageVersion: any,
      _onError?: any,
      _shouldCreateNewSourceFile?: boolean,
      _length?: number,
    ) {
      if (fileName === 'frappe-virtual-types.d.ts' && openapi) {
        const content = emitDTS(openapi, ns);
        return ts.createSourceFile(fileName, content, languageVersion);
      }
      return;
    }

    return {
      ...proxy,
      getExternalFiles,
      getSourceFile,
    };
  }

  function emitDTS(spec: OpenAPI, ns: string): string {
    const lines: string[] = [];
    lines.push(`declare module "${ns}" {`);
    const schemas = spec?.components?.schemas ?? {};
    const paths = spec.paths ?? {};
    const doctypes = new Set<string>();
    for (const p of Object.keys(paths)) {
      const parts = p.split('/').filter(Boolean);
      const idx = parts.indexOf('resource');
      if (idx !== -1 && parts[idx + 1]) {
        doctypes.add(parts[idx + 1]);
      }
    }
    lines.push(`  export type Doctype = ${[...doctypes].map((d) => `'${d}'`).join(' | ') || 'string'}`);
    for (const [name, schema] of Object.entries(schemas)) {
      if (schema?.enum) {
        const members = schema.enum.map((x) => JSON.stringify(x)).join(' | ');
        lines.push(`  export type ${safe(name)} = ${members}`);
        continue;
      }
      if (schema?.type === 'object' && schema?.properties) {
        lines.push(`  export interface ${safe(name)} {`);
        for (const [k, v] of Object.entries(schema?.properties ?? {})) {
          const t = mapType(v);
          const rq = Array.isArray(schema?.required) ? schema.required : [];
          const optional = rq.indexOf(k) === -1;
          lines.push(`    ${safe(k)}${optional ? '?' : ''}: ${t}`);
        }
        lines.push('  }');
      }
    }
    lines.push('}');
    return lines.join('\n');
  }

  function safe(s: string): string {
    return s.replaceAll(/[^a-zA-Z0-9_]/g, '_');
  }

  function mapType(v: any): string {
    if (!v) {
      return 'any';
    }
    if (v.$ref) {
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
  }

  return { create };
}

// Export for ES modules (CJS is handled by the build tool)
export default init;
