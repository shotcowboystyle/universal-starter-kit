// Desk "image" view parity: card grid over meta.image_field (falling back
// to the first Attach Image field). Doctypes without any image field get a
// graceful unsupported state; card click opens the form.
import { YStack } from '@repo/ui';
import { FrappeImageView } from '@repo/frappe-ui';
import type { FrappeImageViewProps } from '@repo/frappe-ui';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { useDeskScope } from '../desk/scope';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { detectCardFields, detectImageField, useViewMeta } from './viewMeta';
import type { AnyDoc } from './viewMeta';
import { ViewError, ViewLoading, ViewUnsupported } from './ViewStates';

// The `one` compiler breaks explicit JSX generics — instantiate once.
const ImageGridOfDoc = FrappeImageView as (props: FrappeImageViewProps<AnyDoc>) => ReactElement;

export interface ImageViewProps {
  /** Proper-cased doctype name (e.g. "ToDo", "Sales Order") */
  doctype: string;
}

export function ImageView({ doctype }: ImageViewProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const deskScope = useDeskScope();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { meta, isLoading: isMetaLoading, error: metaError } = useViewMeta(doctype);

  if (isMetaLoading) {
    return <ViewLoading />;
  }
  if (metaError && !meta) {
    return (
      <ViewError
        doctype={doctype}
        error={metaError}
      />
    );
  }
  if (!meta) {
    return <ViewLoading />;
  }

  const imageField = detectImageField(meta);
  if (!imageField) {
    return (
      <ViewUnsupported
        doctype={doctype}
        title={t('views.imageUnsupported', 'Image view not available')}
        description={t('views.imageUnsupportedDetail', '{{doctype}} has no image field.', {
          doctype,
        })}
      />
    );
  }

  const { titleField, extraFields } = detectCardFields(meta, [imageField]);

  return (
    <YStack flex={1}>
      <ImageGridOfDoc
        doctype={doctype}
        {...(deskScope.length > 0 && { filters: deskScope })}
        imageField={imageField}
        titleField={titleField}
        subtitleField={extraFields[0]}
        onItemClick={(doc) => {
          if (doc.name) {
            navigator.navigate(paths.form(doctype, doc.name));
          }
        }}
        flex={1}
      />
    </YStack>
  );
}
