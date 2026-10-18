// The image view (MPO-414): a card per record over the doctype's image field,
// card press opens the form, the desk scope narrows the grid, and a doctype
// with no image field gets the unsupported state with a way back to the list.

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { DeskScopeProvider } from '../desk/scope';
import { createMemoryNavigator } from '../navigation/navigator';
import type { MemoryNavigator } from '../navigation/navigator';
import type { FrappeFilters } from '../shared/types';

import { ImageView } from './ImageView';

const pokedexMeta = (name: string) => ({
  name,
  doctype: 'DocType',
  module: 'App',
  title_field: 'pokemon_name',
  image_field: 'sprite_front',
  fields: [
    { fieldname: 'pokemon_name', fieldtype: 'Data', label: 'Pokemon Name', in_list_view: 1 },
    { fieldname: 'poke_type', fieldtype: 'Data', label: 'Type', in_list_view: 1 },
    { fieldname: 'sprite_front', fieldtype: 'Attach Image', label: 'Sprite (Front)' },
  ],
  permissions: [{ role: 'All', read: 1 }],
});

const plainMeta = {
  name: 'QaImagePlain',
  doctype: 'DocType',
  module: 'QA',
  fields: [{ fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 }],
  permissions: [{ role: 'All', read: 1 }],
};

const sprite = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const pokemon = [
  ['bulbasaur', 'grass'],
  ['charmander', 'fire'],
  ['squirtle', 'water'],
].map(([name, type]) => ({
  name,
  doctype: 'QaImageDex',
  pokemon_name: name,
  poke_type: type,
  sprite_front: sprite,
}));

let run = 0;

const renderImageView = (doctype: string, scope?: FrappeFilters): MemoryNavigator => {
  run += 1;
  const navigation = createMemoryNavigator('/backoffice');
  renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: `https://image-view-${run}.spec.test`,
        fixtures: new InMemoryFixtureProvider({
          DocType: [pokedexMeta('QaImageDex'), pokedexMeta('QaImageEmpty'), plainMeta],
          QaImageDex: pokemon,
          QaImageEmpty: [],
        }),
      }}
      navigation={navigation}>
      <DeskScopeProvider scope={scope}>
        <ImageView doctype={doctype} />
      </DeskScopeProvider>
    </BackofficeProvider>,
  );
  return navigation;
};

describe('<ImageView />', () => {
  it('draws a titled card per record and opens the form on press', async () => {
    const navigation = renderImageView('QaImageDex');
    const bulbasaurName = await screen.findByTestId('qaimagedex-name-bulbasaur', {}, { timeout: 5000 });
    expect(bulbasaurName.textContent).toBe('bulbasaur');
    expect(screen.getByTestId('qaimagedex-subtitle-charmander').textContent).toBe('fire');
    fireEvent.click(screen.getByTestId('qaimagedex-card-squirtle'));
    expect(navigation.getLocation().path).toBe('/backoffice/qaimagedex/squirtle');
  });

  it('shows only the records inside the desk scope', async () => {
    renderImageView('QaImageDex', [['poke_type', '=', 'fire']]);
    await screen.findByTestId('qaimagedex-card-charmander', {}, { timeout: 5000 });
    expect(screen.queryByTestId('qaimagedex-card-bulbasaur')).toBeNull();
    expect(screen.queryByTestId('qaimagedex-card-squirtle')).toBeNull();
  });

  it('says so when an image doctype has no records', async () => {
    renderImageView('QaImageEmpty');
    await expect(screen.findByText('No items found', {}, { timeout: 5000 })).resolves.toBeTruthy();
  });

  it('offers the list back when the doctype has no image field', async () => {
    const navigation = renderImageView('QaImagePlain');
    await expect(screen.findByText('Image view not available', {}, { timeout: 5000 })).resolves.toBeTruthy();
    expect(screen.getByText('QaImagePlain has no image field.')).toBeTruthy();
    fireEvent.click(screen.getByText('Back to list'));
    expect(navigation.getLocation().path).toBe('/backoffice/qaimageplain');
  });
});
