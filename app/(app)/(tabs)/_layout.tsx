import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { AdminHeaderButton } from '@/src/components/admin/admin-user-management';
import { useAuth } from '@/src/providers/auth-provider';

const TAB_ICONS = {
  lines: 'format-list-bulleted' as const,
  map: 'map-outline' as const,
  nearby: 'map-marker-radius-outline' as const,
  favorites: 'star-outline' as const,
};

export default function TabsLayout() {
  const { signOut } = useAuth();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#1E1E24' },
        headerTitle: '',
        headerTintColor: '#E1E1E6',
        headerLeft: () => (
          <Pressable
            accessibilityLabel="Ir al inicio de líneas"
            accessibilityRole="button"
            className="ml-4 h-10 w-10 items-center justify-center rounded-full bg-[#25252B] active:opacity-70"
            onPress={() =>
              router.navigate({ pathname: '/lines', params: { reset: String(Date.now()) } })
            }>
            <MaterialCommunityIcons color="#80D4FF" name="home-variant-outline" size={23} />
          </Pressable>
        ),
        headerRight: () => (
          <View className="mr-4 flex-row items-center">
            <AdminHeaderButton />
            <Pressable
              accessibilityLabel="Cerrar sesión"
              accessibilityRole="button"
              className="h-10 w-10 items-center justify-center rounded-full bg-[#25252B] active:opacity-70"
              onPress={() =>
                Alert.alert(
                  'Cerrar sesión',
                  'Vas a tener que ingresar nuevamente para usar la aplicación.',
                  [
                    { style: 'cancel', text: 'Cancelar' },
                    {
                      style: 'destructive',
                      text: 'Cerrar sesión',
                      onPress: () => void signOut(),
                    },
                  ]
                )
              }>
              <MaterialCommunityIcons color="#F38B9A" name="logout" size={22} />
            </Pressable>
          </View>
        ),
        sceneStyle: { backgroundColor: '#121212' },
        tabBarActiveTintColor: '#80D4FF',
        tabBarInactiveTintColor: '#A4A4AB',
        tabBarStyle: { backgroundColor: '#1E1E24', borderTopColor: '#25252B' },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons
            color={color}
            name={TAB_ICONS[route.name as keyof typeof TAB_ICONS]}
            size={size}
          />
        ),
      })}>
      <Tabs.Screen name="lines" options={{ title: 'Líneas' }} />
      <Tabs.Screen name="map" options={{ title: 'Mapa' }} />
      <Tabs.Screen name="nearby" options={{ title: 'Paradas cercanas' }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favoritos' }} />
    </Tabs>
  );
}
