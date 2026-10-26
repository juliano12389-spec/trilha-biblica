import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '../../theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ focused, size }) => <Ionicons name="grid-outline" size={size} color={focused ? colors.primary : colors.textMuted} />,
        }}
      />
      <Tabs.Screen
        name="estoque"
        options={{
          title: 'Estoque',
          tabBarIcon: ({ focused, size }) => <Ionicons name="file-tray-stacked-outline" size={size} color={focused ? colors.primary : colors.textMuted} />,
        }}
      />
      <Tabs.Screen
        name="producao"
        options={{
          title: 'Produção',
          tabBarIcon: ({ focused, size }) => <Ionicons name="restaurant-outline" size={size} color={focused ? colors.primary : colors.textMuted} />,
        }}
      />
      <Tabs.Screen
        name="auditoria"
        options={{
          title: 'Auditoria',
          tabBarIcon: ({ focused, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={focused ? colors.primary : colors.textMuted} />,
        }}
      />
    </Tabs>
  );
}
