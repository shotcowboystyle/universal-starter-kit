/**
 * TreeView — design-law 100%. Size/space/type ride shared knobs;
 * Home/End and selection are APG tree semantics; empty is EmptyState.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { defaultKnobs, Preset, resolveKnobs } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TreeView, type TreeNode } from './TreeView';
import { treeDefaultHeight, treeIndentStep } from './treeViewLayout';

const treeViewSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'TreeView.tsx'), 'utf8');

afterEach(cleanup);

const nodes: TreeNode[] = [
  {
    id: 'root',
    label: 'Root Node',
    children: [
      { id: 'child-1', label: 'Child 1' },
      {
        id: 'child-2',
        label: 'Child 2',
        children: [{ id: 'grandchild', label: 'Grandchild' }],
      },
    ],
  },
  { id: 'root-2', label: 'Root 2' },
];

describe('TreeView named exports', () => {
  it('exports TreeView as a named function', () => {
    expect(typeof TreeView).toBe('function');
    expect(TreeView.name).toBe('TreeView');
  });
});

describe('TreeView knob wiring', () => {
  it('publishes nestedControl px, indent step, and space on the tree', () => {
    const { knobProps } = resolveKnobs(defaultKnobs);
    renderWithProviders(<TreeView nodes={nodes} expandByDefault ariaLabel="Knob tree" height={400} />);
    const tree = screen.getByRole('tree');
    expect(tree.getAttribute('data-nested-px')).toBe(String(knobProps.nestedControl.px));
    expect(tree.getAttribute('data-indent-step')).toBe(String(treeIndentStep(knobProps.nestedControl.px)));
    expect(tree.getAttribute('data-space')).toBe(knobProps.space);
    expect(tree.getAttribute('data-size')).toBe(knobProps.size);
  });

  it('default viewport follows nestedControl when height is omitted', () => {
    const nestedPx = resolveKnobs(defaultKnobs).knobProps.nestedControl.px;
    renderWithProviders(<TreeView nodes={nodes} ariaLabel="Hug tree" />);
    const tree = screen.getByRole('tree');
    expect(tree.getAttribute('data-viewport-height')).toBe(String(treeDefaultHeight(nestedPx)));
  });

  it('compact display steps space without a private compressed pad table', () => {
    renderWithProviders(
      <Preset cascade={false} overrides={{ space: 'medium' }}>
        <TreeView nodes={nodes} display="compressed" expandByDefault ariaLabel="Compact tree" height={280} />
      </Preset>,
    );
    const tree = screen.getByRole('tree');
    expect(tree.getAttribute('data-space')).toBe('small');
    expect(tree.getAttribute('data-size')).toBe('medium');
  });

  it('stays E-FLAT and SF-TRANSPARENT when elevation and borderWidth are large', () => {
    renderWithProviders(
      <Preset cascade={false} overrides={{ elevation: 'large', borderWidth: 'large' }}>
        <TreeView nodes={nodes} expandByDefault ariaLabel="Surface tree" height={400} />
      </Preset>,
    );
    const tree = screen.getByRole('tree');
    expect(tree.getAttribute('data-elevation-class')).toBe('flat');
    expect(tree.getAttribute('data-fill')).toBe('transparent');
  });

  it('row labels are T-VALUE primary ink, never a secondary ramp step', () => {
    expect(treeViewSource).not.toMatch(/componentColors\.text\.(secondary|muted)/);
    expect(treeViewSource).toMatch(/color=\{isSelected && onAccentLabel \? onAccentLabel : ['"]\$color['"]\}/);
  });
});

describe('TreeView selection and keyboard', () => {
  it('marks selectedId with aria-selected', () => {
    renderWithProviders(
      <TreeView
        nodes={nodes}
        defaultExpandedIds={['root']}
        selectedId="child-1"
        ariaLabel="Selection tree"
        height={400}
      />,
    );
    const selected = screen.getByText('Child 1').closest('[role="treeitem"]');
    expect(selected).toHaveAttribute('aria-selected', 'true');
  });

  it('Home focuses the first row and End the last', () => {
    renderWithProviders(<TreeView nodes={nodes} expandByDefault ariaLabel="Home end tree" height={400} />);
    const tree = screen.getByRole('tree');
    tree.focus();
    fireEvent.keyDown(tree, { key: 'Home' });
    expect(screen.getByText('Root Node').closest('[data-focused]')).toBeTruthy();
    fireEvent.keyDown(tree, { key: 'End' });
    expect(screen.getByText('Root 2').closest('[data-focused]')).toBeTruthy();
  });
});

describe('TreeView empty', () => {
  it('renders EmptyState for an empty node list (Axiom 6: empty ≠ error)', () => {
    renderWithProviders(<TreeView nodes={[]} ariaLabel="Empty tree" emptyMessage="No files found" />);
    expect(screen.getByText('No files found')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).toBeNull();
  });
});
