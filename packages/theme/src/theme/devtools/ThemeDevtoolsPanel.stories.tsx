import { ThemeDevtoolsPanel } from './ThemeDevtoolsPanel';

export default {
  title: 'Theme/ThemeDevtoolsPanel',
  component: ThemeDevtoolsPanel,
  parameters: { status: { type: 'beta' } },
};

export const main = {
  name: 'Main',
  render: () => (
    <div data-testid="theme-devtools-panel" style={{ maxHeight: 640, overflow: 'auto' }}>
      <ThemeDevtoolsPanel devtoolsTheme="light" />
    </div>
  ),
};
