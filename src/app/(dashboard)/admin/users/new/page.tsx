'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, type CreateUserInput } from '@/lib/validation/user';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createUser } from '@/app/(dashboard)/admin/users/actions';
import { useTransition, useCallback } from 'react';
import { PasswordStrengthMeter } from '@/components/ui/password-strength';
import { PageHeading } from '@/components/layout/page-heading';

export default function NewUserPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
    watch,
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      password: '',
      role: 'USER',
    },
  });

  const roleValue = watch('role');
  const passwordValue = watch('password');

  const submit = useCallback(
    async (data: CreateUserInput) => {
      startTransition(async () => {
        const raw = (await createUser(data)) as
          Record<string, unknown> | undefined;
        if (
          raw &&
          'error' in raw &&
          typeof raw.error === 'object' &&
          raw.error !== null &&
          !Array.isArray(raw.error)
        ) {
          const fieldErrors = raw.error as Record<string, string[]>;
          for (const [field, messages] of Object.entries(fieldErrors)) {
            if (messages.length > 0) {
              setError(field as keyof CreateUserInput, {
                message: messages[0],
              });
            }
          }
          return;
        }
        if (raw && 'error' in raw && typeof raw.error === 'string') {
          setError('root', { message: raw.error as string });
          return;
        }
        router.push('/admin/users');
      });
    },
    [router, setError, startTransition],
  );

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeading
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/users')}>
            Back
          </Button>
        }
      >
        Add user
      </PageHeading>
      <Card>
        <CardHeader>
          <CardTitle>New user</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
              <PasswordStrengthMeter password={passwordValue} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={roleValue}
                onValueChange={(v) =>
                  setValue('role', v as 'ADMIN' | 'USER', {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">USER</SelectItem>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-sm text-destructive">
                  {errors.role.message}
                </p>
              )}
            </div>

            {errors.root && (
              <p className="text-sm text-destructive">
                {(errors.root.message as string) ??
                  'An unexpected error occurred'}
              </p>
            )}

            <Button type="submit" disabled={isPending || isSubmitting}>
              {isSubmitting || isPending ? 'Creating…' : 'Create user'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
