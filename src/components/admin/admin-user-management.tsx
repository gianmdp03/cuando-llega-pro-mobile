import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';

import { createUserAdmin } from '@/src/features/auth/api';
import { getErrorMessage } from '@/src/lib/error-message';
import { useAuth } from '@/src/providers/auth-provider';
import type { AdminCreateUserRequest } from '@/src/types/api';

export function AdminHeaderButton() {
  const { session } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'ROLE_USER' | 'ROLE_ADMIN'>('ROLE_USER');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const isAdmin = session?.user?.role === 'ROLE_ADMIN';

  const mutation = useMutation({
    mutationFn: createUserAdmin,
    onSuccess: (newUser) => {
      setFeedback({
        type: 'success',
        message: `¡Usuario ${newUser.email} creado con éxito!`,
      });
      setEmail('');
      setPassword('');
      setFullName('');
      setSelectedRole('ROLE_USER');
    },
    onError: (error) => {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'No se pudo crear el usuario.'),
      });
    },
  });

  if (!isAdmin) {
    return null;
  }

  function handleCreate() {
    setFeedback(null);
    mutation.mutate({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      role: selectedRole,
    } satisfies AdminCreateUserRequest);
  }

  function handleOpenModal() {
    setFeedback(null);
    setModalVisible(true);
  }

  return (
    <>
      <Pressable
        accessibilityLabel="Administración"
        accessibilityRole="button"
        className="mr-2 flex-row items-center gap-1.5 rounded-full bg-[#25252B] px-3 py-1.5 active:opacity-70"
        onPress={handleOpenModal}>
        <MaterialCommunityIcons color="#80D4FF" name="shield-account-outline" size={18} />
        <Text className="text-xs font-bold text-[#80D4FF]">ADMIN</Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
        transparent
        visible={modalVisible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          className="flex-1 justify-end bg-black/60">
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View className="max-h-[85%] rounded-t-3xl bg-[#1E1E24] p-6">
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View className="mb-4 flex-row items-center justify-between">
                  <Text className="text-xl font-bold text-[#E1E1E6]">Crear Usuario (Admin)</Text>
                  <Pressable onPress={() => setModalVisible(false)}>
                    <MaterialCommunityIcons color="#A4A4AB" name="close" size={22} />
                  </Pressable>
                </View>

                {feedback ? (
                  <View
                    className={`mb-4 flex-row items-center gap-2 rounded-xl border p-3 ${
                      feedback.type === 'success'
                        ? 'border-[#6CD58A]/40 bg-[#0E2B18]'
                        : 'border-[#FF4D4D]/40 bg-[#381E1E]'
                    }`}>
                    <MaterialCommunityIcons
                      color={feedback.type === 'success' ? '#6CD58A' : '#FF4D4D'}
                      name={
                        feedback.type === 'success'
                          ? 'check-circle-outline'
                          : 'alert-circle-outline'
                      }
                      size={20}
                    />
                    <Text
                      className={`flex-1 text-sm font-medium ${
                        feedback.type === 'success' ? 'text-[#6CD58A]' : 'text-[#FF9999]'
                      }`}>
                      {feedback.message}
                    </Text>
                  </View>
                ) : null}

                <View className="gap-3">
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
                    icon="account-outline"
                    label="Nombre completo"
                    onChangeText={setFullName}
                    value={fullName}
                  />
                  <Field
                    autoCapitalize="none"
                    autoComplete="new-password"
                    icon="lock-outline"
                    label="Contraseña"
                    onChangeText={setPassword}
                    secureTextEntry
                    value={password}
                  />

                  {/* Selector de Rol */}
                  <View className="mt-1">
                    <Text className="mb-1.5 text-xs text-[#A4A4AB]">Rol del usuario</Text>
                    <View className="flex-row gap-2">
                      <Pressable
                        accessibilityRole="button"
                        className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border p-3 ${
                          selectedRole === 'ROLE_USER'
                            ? 'border-[#80D4FF] bg-[#80D4FF]/10'
                            : 'border-[#25252B] bg-[#25252B]'
                        }`}
                        onPress={() => setSelectedRole('ROLE_USER')}>
                        <MaterialCommunityIcons
                          color={selectedRole === 'ROLE_USER' ? '#80D4FF' : '#8E8E93'}
                          name="account-outline"
                          size={18}
                        />
                        <Text
                          className={`text-sm font-semibold ${
                            selectedRole === 'ROLE_USER' ? 'text-[#80D4FF]' : 'text-[#8E8E93]'
                          }`}>
                          USUARIO
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border p-3 ${
                          selectedRole === 'ROLE_ADMIN'
                            ? 'border-[#80D4FF] bg-[#80D4FF]/10'
                            : 'border-[#25252B] bg-[#25252B]'
                        }`}
                        onPress={() => setSelectedRole('ROLE_ADMIN')}>
                        <MaterialCommunityIcons
                          color={selectedRole === 'ROLE_ADMIN' ? '#80D4FF' : '#8E8E93'}
                          name="shield-account-outline"
                          size={18}
                        />
                        <Text
                          className={`text-sm font-semibold ${
                            selectedRole === 'ROLE_ADMIN' ? 'text-[#80D4FF]' : 'text-[#8E8E93]'
                          }`}>
                          ADMIN
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View className="mt-6 flex-row gap-3">
                  <Pressable
                    className="flex-1 items-center rounded-xl bg-[#25252B] py-3.5 active:opacity-70"
                    onPress={() => setModalVisible(false)}>
                    <Text className="font-semibold text-[#E1E1E6]">Cerrar</Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 items-center rounded-xl bg-[#80D4FF] py-3.5 active:opacity-70 disabled:opacity-50"
                    disabled={!email.trim() || !password || !fullName.trim() || mutation.isPending}
                    onPress={handleCreate}>
                    {mutation.isPending ? (
                      <ActivityIndicator color="#121212" />
                    ) : (
                      <Text className="font-semibold text-[#121212]">Crear usuario</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
      <Text className="mb-1 text-xs text-[#A4A4AB]">{label}</Text>
      <View className="flex-row items-center rounded-xl bg-[#25252B] px-3">
        <MaterialCommunityIcons color="#A4A4AB" name={icon} size={18} />
        <TextInput
          className="ml-2.5 min-h-11 flex-1 text-sm text-[#E1E1E6]"
          placeholder={label}
          placeholderTextColor="#8E8E93"
          {...inputProps}
        />
      </View>
    </View>
  );
}
