import { Keyboard } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { AuthForm } from '@/src/components/auth/auth-form';
import { login } from '@/src/features/auth/api';
import { useAuth } from '@/src/providers/auth-provider';
import type { AuthRequest } from '@/src/types/api';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: async (response) => {
      Keyboard.dismiss();
      await signIn(response);
      router.replace('/lines');
    },
  });

  return (
    <AuthForm
      error={mutation.error}
      isSubmitting={mutation.isPending}
      onSubmit={({ email, password }) => mutation.mutate({ email, password } satisfies AuthRequest)}
    />
  );
}
