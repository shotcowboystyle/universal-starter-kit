'use client';

import { Button, Form, Input } from '@repo/forms';
import { Paragraph } from '@repo/ui';
import { useTranslations } from 'next-intl';
import React from 'react';
import * as z from 'zod';

import { defaultEmail } from '@/constants/demoData';
import { useAuthForm } from '@/hooks/useAuth';

const emailSchema = z.email({ message: 'Invalid email address' });

export default function UserAuthForm() {
  const { handleSubmit, isLoading, error, isNavigating } = useAuthForm();
  const t = useTranslations('login');
  const busy = isLoading || isNavigating;

  // Map backend error messages to i18n keys
  const displayError = error?.includes('The login email is incorrect') ? t('invalidEmail') : error;

  return (
    <Form
      aria-label="Sign in form"
      data-testid="auth-form"
      formOptions={{ defaultValues: { email: defaultEmail } }}
      onSubmit={async (values: { email: string }) => {
        await handleSubmit(values.email);
      }}>
      <Input
        name="email"
        label={t('emailLabel')}
        placeholder={t('emailPlaceholder')}
        purpose="email"
        disabled={busy}
        inputProps={{ testID: 'email-input' }}
        validators={{
          onChange: ({ value }: { value: string }) => emailSchema.safeParse(value).error?.issues[0]?.message,
        }}
      />

      {displayError ? (
        <Paragraph color="$red10" data-testid="error-message">
          {displayError}
        </Paragraph>
      ) : null}

      <Button accent action="submit" loading={busy} disabled={busy} data-testid="submit-button">
        {t('continueButton')}
      </Button>
    </Form>
  );
}
