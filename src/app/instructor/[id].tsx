import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Avatar, Eyebrow } from '@/components/ui';
import { useNest } from '@/lib/nest-store';
import {
  formatDay,
  formatTime,
  getClassType,
  getInstructor,
  sessions,
} from '@/lib/schedule';
import { colors, fonts, radius } from '@/lib/theme';

export default function InstructorSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { now } = useNest();
  const instructor = getInstructor(id);
  const upcoming = sessions
    .filter((session) => session.instructorId === id && session.start.getTime() > now)
    .slice(0, 4);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Avatar name={instructor.name} size={88} />
        <Text style={styles.name}>{instructor.name}</Text>
        <Eyebrow>{instructor.role}</Eyebrow>
      </View>

      <Text style={styles.bio}>{instructor.bio}</Text>

      <Text style={styles.sectionTitle}>Upcoming classes</Text>
      <View style={styles.list}>
        {upcoming.map((session) => {
          const type = getClassType(session.typeId);
          return (
            <Pressable
              key={session.id}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
              <View style={[styles.dot, { backgroundColor: type.color }]} />
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{session.title}</Text>
                <Text style={styles.rowMeta}>
                  {formatDay(session.start)} · {formatTime(session.start)}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    paddingTop: 36,
    paddingBottom: 48,
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    gap: 10,
  },
  name: {
    fontFamily: fonts.light,
    fontSize: 28,
    color: colors.ink,
    marginTop: 8,
  },
  bio: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 20,
  },
  sectionTitle: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 32,
    marginBottom: 8,
  },
  list: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
  },
});
