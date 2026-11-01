/**
 * CodeEditorField contract specs: canonical onChange emission (LC-14),
 * readOnly gating, frappeCodeLanguage (stock df.options convention),
 * table-cell chromeless branch, and registry resolution for the
 * "Code" and "JSON" fieldtypes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TableCellContext } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import type { HighlightLine } from '@repo/ui';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { CodeEditorField, frappeCodeLanguage } from '.';
import type { CodeEditorFieldProps } from '.';

const codeEditorDir = () => {
  try {
    const meta = import.meta.url;
    if (meta.startsWith('file:')) {
      return path.dirname(fileURLToPath(meta));
    }
  } catch {
    /* vite-node may serve a non-file import.meta.url */
  }
  return path.join(process.cwd(), 'src/fields/CodeEditor');
};

const readCodeEditorSource = () => readFileSync(path.join(codeEditorDir(), 'index.tsx'), 'utf-8');

const tableCellContextValue = { inTableCell: true, editable: true };

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

type CodeEditorElement = React.ReactElement<CodeEditorFieldProps>;

/** Calls a registry adapter directly and returns the field element it builds. */
const renderAdapter = (fieldtype: string, props: FieldRenderProps): CodeEditorElement => {
  const Component = getFieldComponent(fieldtype);
  if (Component === undefined) {
    throw new Error(`no adapter registered for ${fieldtype}`);
  }
  // SAFETY: the Code/JSON registry adapters are plain function components that return one CodeEditorField element.
  return (Component as (adapterProps: FieldRenderProps) => CodeEditorElement)(props);
};

// oxlint-disable-next-line vitest/require-top-level-describe -- DOM cleanup applies to every suite in this file
afterEach(cleanup);

vi.mock(import('@repo/storybook'), () => ({ action: () => vi.fn<(...args: unknown[]) => void>() }));

const painted = vi.hoisted(() => ({ tokens: [] as (HighlightLine[] | null)[] }));
vi.mock(import('@repo/ui'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    HighlightedCode: (props: React.ComponentProps<typeof actual.HighlightedCode>) => {
      painted.tokens.push(props.tokens);
      return <actual.HighlightedCode {...props} />;
    },
  };
});

describe('frappeCodeLanguage (stock ControlCode language_map)', () => {
  it('maps stock Frappe options case-insensitively', () => {
    expect(frappeCodeLanguage('Python')).toBe('python');
    expect(frappeCodeLanguage('Py')).toBe('python');
    expect(frappeCodeLanguage('PythonExpression')).toBe('python');
    expect(frappeCodeLanguage('JS')).toBe('javascript');
    expect(frappeCodeLanguage('Javascript')).toBe('javascript');
    expect(frappeCodeLanguage('HTML')).toBe('html');
    expect(frappeCodeLanguage('Jinja')).toBe('jinja');
    expect(frappeCodeLanguage('Golang')).toBe('go');
    expect(frappeCodeLanguage('JSON')).toBe('json');
  });

  it('falls back to plain text for unknown/empty options', () => {
    expect(frappeCodeLanguage()).toBe('text');
    expect(frappeCodeLanguage(null)).toBe('text');
    expect(frappeCodeLanguage('')).toBe('text');
    expect(frappeCodeLanguage('COBOL')).toBe('text');
  });
});

describe('CodeEditorField (standalone)', () => {
  it('emits the code source through canonical onChange', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <CodeEditorField
        label="Script"
        value=""
        language="python"
        onChange={onChange}
      />,
    );
    const textarea = result.getTextArea();
    expect(textarea).toBeTruthy();
    await act(async () => {
      if (textarea) {
        fireEvent.change(textarea, { target: { value: 'print(1)' } });
      }
    });
    expect(onChange).toHaveBeenCalledWith('print(1)');
  });

  it('readOnly gates onChange (no emission even if the DOM event fires)', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <TableCellContext.Provider value={tableCellContextValue}>
        <CodeEditorField
          label="Script"
          value="original"
          readOnly
          onChange={onChange}
        />
      </TableCellContext.Provider>,
    );
    const textarea = result.getTextArea();
    expect(textarea).toBeTruthy();
    await act(async () => {
      if (textarea) {
        fireEvent.change(textarea, { target: { value: 'mutated' } });
      }
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders chromeless (bare source pane, no Code/Preview tabs) in table cells', () => {
    const result = renderWithProviders(
      <TableCellContext.Provider value={tableCellContextValue}>
        <CodeEditorField
          label="Script"
          value="let x = 1;"
          onChange={() => {}}
        />
      </TableCellContext.Provider>,
    );
    expect(result.getTextArea()).toBeTruthy();
    expect(result.queryByText('Preview')).toBeNull();
  });

  it('skeleton branch renders no editable surface', () => {
    const result = renderWithProviders(
      <CodeEditorField
        label="Script"
        skeleton
        value="hidden"
        onChange={() => {}}
      />,
    );
    expect(result.getTextArea()).toBeNull();
  });

  it('ships CSF3 story objects so native gallery keeps args (KS blank-pane)', async () => {
    const { Main, Json, ReadOnly } = await import('./CodeEditor.stories');
    for (const story of [Main, Json, ReadOnly]) {
      expect(story).toBeTypeOf('object');
      expect(story.render).toBeTypeOf('function');
      expect(story.args.value?.trim().length).toBeGreaterThan(0);
    }
    expect(ReadOnly.args.readOnly).toBe(true);
  });

  it('hands the preview the held syntax tokens, not GitHub hex (MPO-474)', async () => {
    painted.tokens = [];
    renderWithProviders(
      <CodeEditorField
        label="Script"
        value="const answer = 42;"
        language="javascript"
        readOnly
        onChange={() => {}}
      />,
    );
    await waitFor(
      () => {
        expect(painted.tokens.some(Boolean)).toBe(true);
      },
      { timeout: 30_000 },
    );
    const tokens = painted.tokens.findLast(Boolean)!.flat();
    expect(tokens.find((token) => token.content === 'const')?.color).toBe('$syntaxPurple');
    expect(tokens.find((token) => token.content === '42')?.color).toBe('$syntaxBlue');
  }, 35_000);

  it('forwards knob containerRadius onto the source textarea (F14)', () => {
    const source = readCodeEditorSource();
    expect(source).toContain('...knobProps.containerRadius');
    const result = renderWithProviders(
      <CodeEditorField
        label="Script"
        value="print(1)"
        language="python"
        onChange={() => {}}
      />,
    );
    expect(result.getTextArea()).toBeTruthy();
  });
});

describe('registry resolution (Code / JSON fieldtypes)', () => {
  it("resolves 'Code' to CodeEditorField with df.options-derived language", () => {
    const Component = getFieldComponent('Code');
    expect(Component).toBeTruthy();
    expect(Component).not.toBe(getFieldComponent('Long Text'));
    const element = renderAdapter(
      'Code',
      propsFor({
        value: 'print(1)',
        label: 'Script',
        fieldMeta: { type: 'Code', name: 'script', options: 'Python' },
      }),
    );
    expect(element.type).toBe(CodeEditorField);
    expect(element.props.language).toBe('python');
    expect(element.props.value).toBe('print(1)');
  });

  it("'Code' without options falls back to plain text language", () => {
    const element = renderAdapter('Code', propsFor({ fieldMeta: { type: 'Code', name: 'script' } }));
    expect(element.props.language).toBe('text');
  });

  it("resolves 'JSON' to CodeEditorField hardwired to the json language", () => {
    const element = renderAdapter('JSON', propsFor({ value: '{}' }));
    expect(element.type).toBe(CodeEditorField);
    expect(element.props.language).toBe('json');
  });

  it('adapter passes helperText / readOnly / skeleton / compact through (passthrough parity)', () => {
    const element = renderAdapter(
      'Code',
      propsFor({ helperText: 'Server script', readOnly: true, skeleton: true, compact: true }),
    );
    expect(element.props.helperText).toBe('Server script');
    expect(element.props.readOnly).toBe(true);
    expect(element.props.skeleton).toBe(true);
    expect(element.props.compact).toBe(true);
  });
});
