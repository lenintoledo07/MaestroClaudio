import * as React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../../constants/Colors';
import { Fonts } from '../../constants/Typography';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: Colors.bg2,
          borderTopColor: Colors.border,
        },
        tabBarActiveTintColor: Colors.orange,
        tabBarInactiveTintColor: Colors.muted,
        tabBarLabelStyle: { fontFamily: Fonts.bodyMedium, fontSize: 11 },
        headerStyle: { backgroundColor: Colors.bg },
        headerTintColor: Colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: Fonts.display, fontSize: 22, letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: 'Materias',
          tabBarIcon: ({ color, size }) => <Ionicons name="library" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendario',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
