import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import { useColorScheme } from '@/lib/useColorScheme';
import { useClientOnlyValue } from '@/lib/useClientOnlyValue';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} className="-mb-1" {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colorScheme === 'dark' ? 'white' : 'blue',
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tab One',
          tabBarTestID: 'tab-one',
          tabBarIcon: ({ color }: { color: string }) => <TabBarIcon name="code" color={color} />,
          headerRight: () => (
            <Link href="/modal" asChild testID="open-modal-button">
              <Pressable testID="modal-link-pressable" className="mr-4 active:opacity-50">
                <FontAwesome
                  name="info-circle"
                  size={25}
                  color={colorScheme === 'dark' ? 'white' : 'black'}
                />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Tab Two',
          tabBarTestID: 'tab-two',
          tabBarIcon: ({ color }: { color: string }) => <TabBarIcon name="code" color={color} />,
        }}
      />
    </Tabs>
  );
}
