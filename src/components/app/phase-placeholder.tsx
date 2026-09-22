import { Text, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

type PhasePlaceholderProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  description: string;
};

export function PhasePlaceholder({ description, icon, title }: PhasePlaceholderProps) {
  return (
    <View className="flex-1 items-center justify-center bg-[#121212] px-8">
      <View className="mb-5 h-16 w-16 items-center justify-center rounded-3xl bg-[#1E1E24]">
        <MaterialCommunityIcons color="#80D4FF" name={icon} size={32} />
      </View>
      <Text className="text-xl font-semibold text-[#E1E1E6]">{title}</Text>
      <Text className="mt-2 text-center text-base leading-6 text-[#A4A4AB]">{description}</Text>
    </View>
  );
}
