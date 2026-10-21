import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { openSession } from '@/components/session-card';
import { Button, Eyebrow } from '@/components/ui';
import { useNest } from '@/lib/nest-store';
import { formatTime, getInstructor, getSession, weekdayShort, type Session } from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

const WEBSITE = 'https://www.thewellnest.ch';
const MEMBERSHIP_CREDITS = 10;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, bookedIds, logOut, now } = useNest();

  const bookings = bookedIds
    .map(getSession)
    .filter((session): session is Session => !!session && session.start.getTime() > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const settings: { icon: IconName; label: string; onPress: () => void }[] = [
    ...(user
      ? [
          { icon: 'bell' as const, label: 'Notifications', onPress: comingSoon },
          { icon: 'card' as const, label: 'Payment methods', onPress: comingSoon },
        ]
      : []),
    {
      icon: 'document',
      label: 'Legal Terms',
      onPress: () => WebBrowser.openBrowserAsync(`${WEBSITE}/legal-terms`),
    },
    { icon: 'mail', label: 'Contact', onPress: () => WebBrowser.openBrowserAsync(`${WEBSITE}/kontakt`) },
    ...(user ? [{ icon: 'logout' as const, label: 'Log out', onPress: logOut }] : []),
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Eyebrow>The Nest</Eyebrow>
        <Text style={styles.title}>{user ? `Hello, ${user.name}` : 'Welcome'}</Text>
      </View>

      {user ? (
        <Animated.View entering={FadeIn.duration(400)} style={styles.member}>
          <Svg width={220} height={220} style={styles.memberRings}>
            <Circle cx={80} cy={110} r={76} stroke="rgba(246,241,234,0.14)" fill="none" />
            <Circle cx={140} cy={110} r={76} stroke="rgba(246,241,234,0.14)" fill="none" />
          </Svg>
          <Eyebrow color={colors.onDarkMuted}>Wellnest member</Eyebrow>
          <Text style={styles.memberName}>{user.email}</Text>
          <View style={styles.memberStats}>
            <View>
              <Text style={styles.memberValue}>{Math.max(MEMBERSHIP_CREDITS - bookedIds.length, 0)}</Text>
              <Text style={styles.memberLabel}>Credits left</Text>
            </View>
            <View>
              <Text style={styles.memberValue}>{bookings.length}</Text>
              <Text style={styles.memberLabel}>Upcoming</Text>
            </View>
            <View>
              <Text style={styles.memberValue}>31.12.</Text>
              <Text style={styles.memberLabel}>Valid until</Text>
            </View>
          </View>
        </Animated.View>
      ) : (
        <LoginCard />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My bookings</Text>
        {bookings.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="calendar" size={30} color={colors.lineStrong} strokeWidth={1.2} />
            <Text style={styles.emptyText}>No upcoming bookings yet.</Text>
            <Button label="Book a class" size="sm" onPress={() => router.navigate('/book')} />
          </View>
        ) : (
          <View style={styles.list}>
            {bookings.map((session) => (
              <Animated.View
                key={session.id}
                entering={FadeIn}
                exiting={FadeOut}
                layout={LinearTransition}>
                <BookingRow session={session} />
              </Animated.View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.list}>
          {settings.map((item, index) => (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              style={({ pressed }) => [
                styles.settingRow,
                index === settings.length - 1 && styles.lastRow,
                pressed && { opacity: 0.6 },
              ]}>
              <Icon name={item.icon} size={20} color={colors.inkSoft} />
              <Text style={styles.settingText}>{item.label}</Text>
              <Icon name="chevronRight" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function comingSoon() {
  Alert.alert('Coming soon', 'This part of the app is not built yet.');
}

function LoginCard() {
  const { logIn } = useNest();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const valid = /\S+@\S+\.\S+/.test(email) && password.length > 0;

  return (
    <View style={styles.login}>
      <Text style={styles.loginText}>Log in to manage your bookings, credits and memberships.</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email address"
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoComplete="password"
        style={styles.input}
        onSubmitEditing={() => valid && logIn(email)}
      />
      <Button label="Log in" disabled={!valid} onPress={() => logIn(email)} />
      <Text style={styles.demoNote}>Demo - any email and password will do.</Text>
    </View>
  );
}

function BookingRow({ session }: { session: Session }) {
  return (
    <Pressable
      onPress={() => openSession(session.id)}
      style={({ pressed }) => [styles.bookingRow, pressed && { opacity: 0.6 }]}>
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay}>{session.start.getDate()}</Text>
        <Text style={styles.dateWeekday}>{weekdayShort(session.start)}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.bookingTitle}>{session.title}</Text>
        <Text style={styles.bookingMeta}>
          {formatTime(session.start)} · {getInstructor(session.instructorId).name.split(' ')[0]} ·{' '}
          {session.location}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
  },
  title: {
    fontFamily: fonts.light,
    fontSize: 40,
    color: colors.ink,
    marginTop: 6,
  },
  member: {
    marginTop: 24,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.oliveDeep,
    padding: 24,
    overflow: 'hidden',
  },
  memberRings: {
    position: 'absolute',
    top: -50,
    right: -70,
  },
  memberName: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.onDark,
    marginTop: 10,
  },
  memberStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 36,
  },
  memberValue: {
    fontFamily: fonts.light,
    fontSize: 30,
    color: colors.onDark,
    fontVariant: ['tabular-nums'],
  },
  memberLabel: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
    marginTop: 4,
  },
  login: {
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    padding: 24,
    gap: 12,
  },
  loginText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkSoft,
    marginBottom: 6,
  },
  input: {
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    paddingHorizontal: 22,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  demoNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  section: {
    marginTop: 36,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    marginBottom: 4,
  },
  list: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    paddingHorizontal: 16,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  dateBlock: {
    width: 48,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    fontFamily: fonts.medium,
    fontSize: 18,
    color: colors.ink,
  },
  dateWeekday: {
    fontFamily: fonts.medium,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.muted,
  },
  bookingTitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  bookingMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  settingText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
});
