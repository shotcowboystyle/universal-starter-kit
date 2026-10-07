/**
 * CodeEditorField contract specs: canonical onChange emission (LC-14),
 * readOnly gating, frappeCodeLanguage (stock df.options convention),
 * table-cell chromeless branch, and registry resolution for the
 * "Code" and "JSON" fieldtypes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HighlightLine } from '@repo/ui';
import { TableCellContext } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';

import { CodeEditorField, frappeCodeLanguage } from '.';

function codeEditorDir() {
  try {
    const meta = import.meta.url;
    if (meta.startsWith('file:')) {
      return dirname(fileURLToPath(meta));
    }
  } catch {
    /* vite-node may serve a non-file import.meta.url */
  }
  return join(process.cwd(), 'src/fields/CodeEditor');
}

function readCodeEditorSource() {
  return readFileSync(join(codeEditorDir(), 'index.tsx'), 'utf-8');
}

afterEach(cleanup);

vi.mock(import('@repo/storybook'), () => ({ action: () => vi.fn() }));

const painted = vi.hoisted(() => ({ tokens: [] as (HighlightLine[] | null)[] }));
vi.mock(import('@repo/ui'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/ui')>();
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
    const onChange = vi.fn();
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
    const onChange = vi.fn();
    const result = renderWithProviders(
      <TableCellContext.Provider value={{ inTableCell: true, editable: true }}>
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
      <TableCellContext.Provider value={{ inTableCell: true, editable: true }}>
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
    const tokens = painted.tokens.filter(Boolean).at(-1)!.flat();
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
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: '', onChange: () => {}, ...overrides };
  }

  it("resolves 'Code' to CodeEditorField with df.options-derived language", () => {
    const Component = getFieldComponent('Code')!;
    expect(Component).toBeTruthy();
    expect(Component).not.toBe(getFieldComponent('Long Text'));
    const element = (Component as Function)(
      propsFor({
        value: 'print(1)',
        label: 'Script',
        fieldMeta: { type: 'Code', name: 'script', options: 'Python' },
      }),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.type).toBe(CodeEditorField);
    expect(element.props.language).toBe('python');
    expect(element.props.value).toBe('print(1)');
  });

  it("'Code' without options falls back to plain text language", () => {
    const Component = getFieldComponent('Code')!;
    const element = (Component as Function)(
      propsFor({ fieldMeta: { type: 'Code', name: 'script' } }),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.props.language).toBe('text');
  });

  it("resolves 'JSON' to CodeEditorField hardwired to the json language", () => {
    const Component = getFieldComponent('JSON')!;
    const element = (Component as Function)(propsFor({ value: '{}' })) as React.ReactElement<Record<string, any>>;
    expect(element.type).toBe(CodeEditorField);
    expect(element.props.language).toBe('json');
  });

  it('adapter passes helperText / readOnly / skeleton / compact through (passthrough parity)', () => {
    const Component = getFieldComponent('Code')!;
    const element = (Component as Function)(
      propsFor({ helperText: 'Server script', readOnly: true, skeleton: true, compact: true }),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.props.helperText).toBe('Server script');
    expect(element.props.readOnly).toBe(true);
    expect(element.props.skeleton).toBe(true);
    expect(element.props.compact).toBe(true);
  });
});
