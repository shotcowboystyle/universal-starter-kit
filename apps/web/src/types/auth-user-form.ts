import { z } from 'zod';

export const SignInValidation = z.object({
  email: z.string().min(1, 'Email is required').pipe(z.email('Invalid email')),
});

export type SignInFormValue = z.infer<typeof SignInValidation>;
