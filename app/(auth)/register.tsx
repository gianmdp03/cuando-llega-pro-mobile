import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { AuthForm } from '@/src/components/auth/auth-form';
import { register } from '@/src/features/auth/api';
import { useAuth } from '@/src/providers/auth-provider';
import type { RegisterRequest } from '@/src/types/api';

export default function RegisterScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const mutation = useMutation({
    mutationFn: register,
    onSuccess: async (response) => {
      await signIn(response);
      router.replace('/lines');
    },
  });

  return (
    <AuthForm
      error={mutation.error}
      isSubmitting={mutation.isPending}
      mode="register"
      onSubmit={({ email, fullName, password }) =>
        mutation.mutate({ email, fullName: fullName ?? '', password } satisfies RegisterRequest)
      }
    />
  );
}
