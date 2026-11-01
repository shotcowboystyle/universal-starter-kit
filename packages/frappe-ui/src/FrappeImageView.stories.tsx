import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';

import { FrappeStoryProvider } from './frappe-story-target';
import { FrappeImageView } from './FrappeImageView';
import { FrappeProvider } from './FrappeProvider';

// hex-escape: generated image fixtures are data, not paint

export default {
  title: 'FrappeUI/FrappeImageView',
  component: FrappeImageView,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Image grid view over a Frappe DocType: fetches documents (fixtures here), resolves image URLs, renders Bento product cards via the generic ImageGrid.',
      },
    },
  },
  argTypes: {
    columns: { control: { type: 'number', min: 1, max: 6 } },
    searchText: { control: 'text' },
  },
};

const MOCK_HOST = 'https://imageview.mock.test';

interface MockBody {
  message?: string;
  docs?: unknown[];
  data?: unknown;
}

// Response.json sets the same `application/json` content type the hand-built Response did.
const jsonResponse = (body: MockBody, status = 200): Response => Response.json(body, { status });

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return input;
};

(() => {
  const w: Window & { __frappeImageViewMockFetch?: boolean } = window;
  if (w.__frappeImageViewMockFetch) {
    return;
  }
  w.__frappeImageViewMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        const name = decodeURIComponent(metaMatch[1]);
        return jsonResponse({
          data: {
            name,
            module: 'QA',
            title_field: 'title',
            // QaGalleryNoImage deliberately has NO image_field in its meta
            image_field: name === 'QaGalleryNoImage' ? undefined : 'picture',
            fields: [
              { fieldname: 'title', fieldtype: 'Data', label: 'Title', in_list_view: 1 },
              { fieldname: 'subtitle', fieldtype: 'Data', label: 'Subtitle' },
              { fieldname: 'picture', fieldtype: 'Attach Image', label: 'Picture' },
            ],
            permissions: [{ role: 'All', read: 1 }],
          },
        });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const svgImage = (color: string, label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${color}"/><text x="150" y="160" font-size="48" text-anchor="middle" fill="#fff">${label}</text></svg>`,
  )}`;

const palette = ['#4a90d9', '#2ec27e', '#e5a50a', '#c061cb', '#e01b24', '#63452c'];

const makeGallery = (doctype: string, count: number, broken = false) =>
  Array.from({ length: count }, (_, i) => ({
    name: `${doctype.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
    doctype,
    title: `Item ${i + 1}`,
    subtitle: `Subtitle for item ${i + 1}`,
    picture:
      broken && i % 2 === 0 ? '/files/definitely-broken.png' : svgImage(palette[i % palette.length], String(i + 1)),
  }));

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the Storybook args bag is spread onto FrappeImageView as-is
export const Main = (args: Record<string, unknown>) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaGallery: makeGallery('QaGallery', 9) })}>
    <FrappeImageView
      doctype="QaGallery"
      imageField="picture"
      titleField="title"
      subtitleField="subtitle"
      onItemClick={action('onItemClick')}
      {...args}
    />
  </FrappeProvider>
);
Main.args = { columns: 3 };
Main.storyName = 'Main';

/** Zero documents: the grid's empty message must show. */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaGalleryEmpty: [] })}>
    <FrappeImageView
      doctype="QaGalleryEmpty"
      imageField="picture"
      titleField="title"
    />
  </FrappeProvider>
);

/** Meta has no image_field and none is passed: 48px icon + explanatory text. */
export const NoImageField = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaGalleryNoImage: makeGallery('QaGalleryNoImage', 3) })}>
    <FrappeImageView
      doctype="QaGalleryNoImage"
      titleField="title"
    />
  </FrappeProvider>
);

/** Mixed broken/valid image URLs: broken cells must not break the grid layout. */
export const BrokenImages = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaGalleryBroken: makeGallery('QaGalleryBroken', 6, true) })}>
    <FrappeImageView
      doctype="QaGalleryBroken"
      imageField="picture"
      titleField="title"
      columns={3}
      onItemClick={action('onItemClick')}
    />
  </FrappeProvider>
);

/** Long titles/subtitles must truncate inside the card footer. */
export const LongMetadata = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={
      new InMemoryFixtureProvider({
        QaGalleryLongMeta: [
          {
            name: 'QAGL-001',
            doctype: 'QaGalleryLongMeta',
            title: 'An unreasonably long product title that keeps describing itself in ever greater detail',
            subtitle: 'And an equally long subtitle full of secondary information nobody asked to see on a card',
            picture: svgImage('#4a90d9', '1'),
          },
          {
            name: 'QAGL-002',
            doctype: 'QaGalleryLongMeta',
            title: 'Short',
            subtitle: '',
            picture: svgImage('#2ec27e', '2'),
          },
        ],
      })
    }>
    <FrappeImageView
      doctype="QaGalleryLongMeta"
      imageField="picture"
      titleField="title"
      subtitleField="subtitle"
      columns={3}
    />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// Live bench story — real documents over the live data path
// ---------------------------------------------------------------------------

/**
 * Live image grid against the real bench. Defaults to the stock Contact
 * doctype (image field `image`): external creates/edits/deletes of Contact
 * docs patch the grid in place — an image field change refreshes the card
 * without a reload. imageField/titleField are passed explicitly so the story
 * never blocks on meta. Falls back to fixtures when the bench is down.
 */
export const Live = (args: { doctype?: string; imageField?: string; titleField?: string }) => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ Contact: [] })}>
    <FrappeImageView
      doctype={args.doctype ?? 'Contact'}
      imageField={args.imageField ?? 'image'}
      titleField={args.titleField ?? 'first_name'}
      columns={3}
      onItemClick={action('onItemClick')}
    />
  </FrappeStoryProvider>
);
Live.args = { doctype: '', imageField: '', titleField: '' };
Live.argTypes = {
  doctype: { control: 'text' },
  imageField: { control: 'text' },
  titleField: { control: 'text' },
};
Live.parameters = {
  docs: {
    description: {
      story:
        'Live image grid over the real bench Contact doctype: realtime events patch cards in place, image field changes refresh the card image. Empty-fixture fallback when the bench is down.',
    },
  },
};

/** searchText filters server-side (against fixtures) on the title field. */
export const Filtered = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaGalleryFiltered: makeGallery('QaGalleryFiltered', 9) })}>
    <FrappeImageView
      doctype="QaGalleryFiltered"
      imageField="picture"
      titleField="title"
      searchText="Item 1"
      columns={3}
    />
  </FrappeProvider>
);
