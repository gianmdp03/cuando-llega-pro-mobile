import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';

import { ProblemDetailError } from '@/src/lib/api-client';

type AuthFormProps = {
  mode: 'login' | 'register';
  isSubmitting: boolean;
  error: Error | null;
  onSubmit: (values: { email: string; password: string; fullName?: string }) => void;
};

export function AuthForm({ mode, error, isSubmitting, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const isRegister = mode === 'register';

  function submit(): void {
    onSubmit({
      email: email.trim(),
      password,
      ...(isRegister ? { fullName: fullName.trim() } : {}),
    });
  }

  return (
    <View className="flex-1 justify-center bg-[#121212] px-6">
      <View className="mb-10 gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#1E1E24]">
          <MaterialCommunityIcons color="#80D4FF" name="bus-clock" size={28} />
        </View>
        <Text className="text-3xl font-bold text-[#E1E1E6]">Cuando Llega Pro</Text>
        <Text className="text-base leading-6 text-[#A4A4AB]">
          {isRegister
            ? 'Creá tu cuenta para guardar tus consultas.'
            : 'Ingresá para consultar tus próximos arribos.'}
        </Text>
      </View>

      <View className="gap-4 rounded-3xl bg-[#1E1E24] p-5">
        {isRegister ? (
          <Field
            autoComplete="name"
            icon="account-outline"
            label="Nombre completo"
            onChangeText={setFullName}
            value={fullName}
          />
        ) : null}
        <Field
          autoCapitalize="none"
          autoComplete="email"
          icon="email-outline"
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          value={email}
        />
        <Field
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          icon="lock-outline"
          label="Contraseña"
          onChangeText={setPassword}
          secureTextEntry
          value={password}
        />

        {error ? (
          <View className="flex-row items-center gap-2.5 rounded-xl border border-[#FF4D4D]/40 bg-[#381E1E] p-3">
            <MaterialCommunityIcons color="#FF4D4D" name="alert-circle-outline" size={20} />
            <Text className="flex-1 text-sm font-medium leading-5 text-[#FF9999]">
              {getErrorMessage(error)}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          className="mt-2 items-center rounded-xl bg-[#80D4FF] px-4 py-4 active:opacity-75 disabled:opacity-50"
          disabled={isSubmitting}
          onPress={submit}>
          <Text className="font-semibold text-[#121212]">
            {isSubmitting ? 'Procesando…' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
          </Text>
        </Pressable>
      </View>

      <Link asChild href={isRegister ? '/login' : '/register'}>
        <Pressable className="mt-6 items-center p-3">
          <Text className="text-sm text-[#80D4FF]">
            {isRegister ? 'Ya tengo una cuenta' : 'Quiero crear una cuenta'}
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}

type FieldProps = Pick<
  React.ComponentProps<typeof TextInput>,
  'autoCapitalize' | 'autoComplete' | 'keyboardType' | 'onChangeText' | 'secureTextEntry' | 'value'
> & {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
};

function Field({ icon, label, ...inputProps }: FieldProps) {
  return (
    <View>
      <Text className="mb-2 text-sm text-[#A4A4AB]">{label}</Text>
      <View className="flex-row items-center rounded-xl bg-[#25252B] px-3">
        <MaterialCommunityIcons color="#A4A4AB" name={icon} size={20} />
        <TextInput
          className="ml-3 min-h-12 flex-1 text-base text-[#E1E1E6]"
          placeholder={label}
          placeholderTextColor="#8E8E93"
          {...inputProps}
        />
      </View>
    </View>
  );
}

function getErrorMessage(error: Error): string {
  if (error instanceof ProblemDetailError) {
    if (error.problem.errors && error.problem.errors.length > 0) {
      return error.problem.errors[0].message;
    }
    if (
      error.status === 401 ||
      error.problem.title === 'Authentication Failed' ||
      error.problem.detail === 'Invalid email or password'
    ) {
      return 'Email o contraseña incorrectos. Por favor, verificá tus datos e intentá de nuevo.';
    }
    if (error.problem.detail) {
      return error.problem.detail;
    }
  }
  return error.message || 'Ocurrió un error al procesar la solicitud.';
}
