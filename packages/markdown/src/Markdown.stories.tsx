import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Markdown } from './Markdown';

const meta: Meta<typeof Markdown> = {
  title: 'Markdown/Markdown',
  component: Markdown,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Cross-platform markdown renderer with Shiki syntax highlighting. Supports GFM (tables, strikethrough, task lists).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Markdown>;

const sampleMarkdown = `# Hello World

This is **bold**, _italic_, and ~~strikethrough~~ text.

## Features

- Markdown parsing with remark
- GFM support (tables, task lists)
- Shiki syntax highlighting
- Cross-platform (web + native)

### Task Lists

- [x] Completed task
- [ ] Incomplete task
- [ ] Another task

## Code Blocks

Inline \`code\` looks like this.

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}
\`\`\`

\`\`\`python
def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(fibonacci(10))
\`\`\`

## Blockquotes

> This is a blockquote.
> It can span multiple lines.

## Tables

| Feature | Web | Native |
|---------|-----|--------|
| Markdown | Yes | Yes |
| Syntax Highlighting | Yes | Yes |
| Tables | Yes | Yes |
| HTML | Yes | No |

## Links and Images

[Visit GitHub](https://github.com)

---

That's a horizontal rule above.
`;

export const Main: Story = {
  name: 'Main',
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Markdown>{sampleMarkdown}</Markdown>
    </YStack>
  ),
};

export const CodeBlock: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Markdown>
        {`\`\`\`javascript
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
\`\`\``}
      </Markdown>
    </YStack>
  ),
};

export const Simple: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Markdown>
        {`# Simple Example

Just some **bold** and _italic_ text with a [link](https://example.com).`}
      </Markdown>
    </YStack>
  ),
};
