import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

const TAB_ICONS = {
  lines: 'format-list-bulleted' as const,
  map: 'map-outline' as const,
  favorites: 'star-outline' as const,
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#1E1E24' },
        headerTintColor: '#E1E1E6',
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
      <Tabs.Screen name="favorites" options={{ title: 'Favoritos' }} />
    </Tabs>
  );
}
