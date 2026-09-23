import { Text, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { TelemetryStatus } from '@/src/types/api';

export function TelemetryBadge({
  compact = false,
  prominent = false,
  status,
}: {
  compact?: boolean;
  prominent?: boolean;
  status: TelemetryStatus;
}) {
  const color =
    status === 'LIVE'
      ? { bg: '#0E2B18', text: '#6CD58A', label: 'En vivo' }
      : status === 'ESTIMATED_FALLBACK'
        ? { bg: '#332500', text: '#E5B842', label: 'Estimado' }
        : { bg: '#28282C', text: '#8E8E93', label: 'Vencido' };
  return (
    <View
      className={
        compact
          ? 'rounded-full px-2.5 py-1'
          : prominent
            ? 'rounded-xl px-3 py-2'
            : 'rounded-full px-3 py-1.5'
      }
      style={{ backgroundColor: color.bg }}>
      <Text
        className={prominent ? 'text-sm font-semibold' : 'text-xs font-semibold'}
        style={{ color: color.text }}>
        {color.label}
      </Text>
    </View>
  );
}

export function ArrivalDetail({
  icon,
  compact = false,
  value,
}: {
  compact?: boolean;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <MaterialCommunityIcons color="#A4A4AB" name={icon} size={compact ? 15 : 16} />
      <Text className={compact ? 'text-xs text-[#A4A4AB]' : 'text-sm text-[#A4A4AB]'}>{value}</Text>
    </View>
  );
}
