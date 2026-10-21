import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { Monogram } from '@/components/logo';
import { PressableScale, useFocusFade } from '@/components/motion';
import { openSession } from '@/components/session-card';
import { Button, Eyebrow } from '@/components/ui';
import { useNest } from '@/lib/nest-store';
import { formatTime, getInstructor, getSession, weekdayShort, type Session } from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

const WEBSITE = 'https://www.thewellnest.ch';

export default function ProfileScreen() {
  const focusStyle = useFocusFade();
  const insets = useSafeAreaInsets();
  const { user, bookedIds, creditsLeft, logOut, now } = useNest();
  const [newsletter, setNewsletter] = useState(false);

  const bookings = bookedIds
    .map((id) => getSession(id, now))
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
      icon: 'rings',
      label: 'About The Wellnest',
      onPress: () => WebBrowser.openBrowserAsync(`${WEBSITE}/home1`),
    },
    {
      icon: 'document',
      label: 'Legal Terms',
      onPress: () => WebBrowser.openBrowserAsync(`${WEBSITE}/legal-terms`),
    },
    { icon: 'mail', label: 'Contact', onPress: () => WebBrowser.openBrowserAsync(`${WEBSITE}/kontakt`) },
    ...(user ? [{ icon: 'logout' as const, label: 'Log out', onPress: logOut }] : []),
  ];

  return (
    <Animated.ScrollView
      style={[styles.screen, focusStyle]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Eyebrow>The Nest</Eyebrow>
          <Text style={styles.title}>{user ? `Hello, ${user.name}` : 'Welcome'}</Text>
        </View>
        <Monogram height={30} />
      </View>

      {user ? (
        <Animated.View key="member" entering={FadeInDown.duration(450)} style={styles.member}>
          <Svg width={220} height={220} style={styles.memberRings}>
            <Circle cx={80} cy={110} r={76} stroke="rgba(246,241,234,0.14)" fill="none" />
            <Circle cx={140} cy={110} r={76} stroke="rgba(246,241,234,0.14)" fill="none" />
          </Svg>
          <Eyebrow color={colors.onDarkMuted}>Wellnest member</Eyebrow>
          <Text style={styles.memberName}>{user.email}</Text>
          <View style={styles.memberStats}>
            <View>
              <Text style={styles.memberValue}>{creditsLeft}</Text>
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
        <Animated.View key="login" entering={FadeInDown.duration(450)}>
          <LoginCard />
        </Animated.View>
      )}

      {/* No layout animations here: when the login card swaps for the shorter member card, an
          interrupted layout transition left these sections shifted down on the phone, with
          "Log out" pushed out of reach. */}
      <Animated.View entering={FadeInDown.delay(100).duration(450)} style={styles.section}>
        <Text style={styles.sectionTitle}>My bookings</Text>
        {bookings.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="calendar" size={30} color={colors.lineStrong} strokeWidth={1.2} />
            <Text style={styles.emptyText}>No upcoming bookings yet.</Text>
            <Button label="Book a class" size="sm" onPress={() => router.navigate('/book')} />
          </View>
        ) : (
          <View style={styles.list}>
            {bookings.map((session, index) => (
              <Animated.View key={session.id} entering={FadeIn}>
                <BookingRow session={session} last={index === bookings.length - 1} />
              </Animated.View>
            ))}
          </View>
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(450)} style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.list}>
          <View style={styles.settingRow}>
            <Icon name="mail" size={20} color={colors.inkSoft} />
            <Text style={styles.settingText}>Newsletter</Text>
            <Switch
              value={newsletter}
              onValueChange={setNewsletter}
              trackColor={{ true: colors.olive, false: colors.line }}
              thumbColor={colors.surface}
              ios_backgroundColor={colors.line}
            />
          </View>
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
      </Animated.View>
    </Animated.ScrollView>
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

  function submit() {
    if (!valid) return;
    Keyboard.dismiss();
    logIn(email);
  }

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
        onSubmitEditing={submit}
      />
      <Button label="Log in" disabled={!valid} onPress={submit} />
      <Text style={styles.demoNote}>Demo - any email and password will do.</Text>
    </View>
  );
}

function BookingRow({ session, last }: { session: Session; last: boolean }) {
  const { bookingFor } = useNest();
  const waitlist = bookingFor(session.id)?.waitlist;
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => openSession(session.id)}
      style={[styles.bookingRow, last && styles.lastRow]}>
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay}>{session.start.getDate()}</Text>
        <Text style={styles.dateWeekday}>{weekdayShort(session.start)}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.bookingTitle}>
          {session.title}
          {waitlist && <Text style={styles.waitlistTag}>  · Waitlist</Text>}
        </Text>
        <Text style={styles.bookingMeta}>
          {formatTime(session.start)} · {getInstructor(session.instructorId).name.split(' ')[0]} ·{' '}
          {session.location}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} color={colors.muted} />
    </PressableScale>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    backgroundColor: colors.surface,
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
  waitlistTag: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.terracotta,
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
