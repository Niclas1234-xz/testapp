import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { Marquee } from '@/components/marquee';
import { availability, openSession } from '@/components/session-card';
import { Button, Eyebrow } from '@/components/ui';
import { useNest } from '@/lib/nest-store';
import {
  addDays,
  classTypes,
  dayKey,
  formatTime,
  getClassType,
  getInstructor,
  sessions,
  weekdayShort,
  type Session,
} from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

const WEBSITE = 'https://www.thewellnest.ch';

const PILLARS: { title: string; icon: IconName; text: string }[] = [
  {
    title: 'Presence',
    icon: 'target',
    text: 'An invitation to slow down, tune in and reconnect with what is here - bringing intention to the way we move, gather and care.',
  },
  {
    title: 'Ease',
    icon: 'waves',
    text: 'Effort without strain. Finding comfort in the challenge, softening where we can and leaving lighter than we came.',
  },
  {
    title: 'Connection',
    icon: 'rings',
    text: 'To ourselves, to each other and to the moments that matter - through movement, music and shared time.',
  },
];

const MARQUEE = [
  'THE NOW',
  'THE NATURE',
  'THE NOURISH',
  'THE NETWORK',
  'THE NOMAD',
  'THE NEWS',
  'THE NEST',
];

function greeting(now: number) {
  const hour = new Date(now).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function dayLabel(date: Date, now: number) {
  const today = new Date(now);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(addDays(today, 1))) return 'Tomorrow';
  return `${weekdayShort(date)} ${date.getDate()}`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isBooked, now } = useNest();
  const upNext = sessions.filter((session) => session.start.getTime() > now).slice(0, 6);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>
            {greeting(now)}
            {user ? `, ${user.name}` : ''}
          </Text>
          <Text style={styles.wordmark}>THE WELLNEST</Text>
        </View>
        <Pressable
          accessibilityLabel="Profile"
          onPress={() => router.navigate('/profile')}
          style={styles.roundButton}>
          <Icon name="user" size={18} />
        </Pressable>
      </View>

      <Animated.View entering={FadeInDown.duration(600)} style={styles.hero}>
        <Svg width={260} height={260} style={styles.heroRings}>
          <Circle cx={100} cy={130} r={90} stroke="rgba(246,241,234,0.14)" strokeWidth={1} fill="none" />
          <Circle cx={160} cy={130} r={90} stroke="rgba(246,241,234,0.14)" strokeWidth={1} fill="none" />
        </Svg>
        <Eyebrow color={colors.onDarkMuted}>Move · Feel · Listen · Connect</Eyebrow>
        <Text style={styles.heroTitle}>Get out of your head and into your body.</Text>
        <Text style={styles.heroText}>
          Rhythm-led classes, music and community - for a more intentional way of living.
        </Text>
        <Button
          label="Book a class"
          variant="light"
          icon="arrowRight"
          onPress={() => router.navigate('/book')}
          style={styles.heroButton}
        />
        <View style={styles.heroRow}>
          <Button
            label="Join an event"
            variant="outlineLight"
            size="sm"
            style={styles.flex}
            onPress={() => router.navigate({ pathname: '/book', params: { type: 'event' } })}
          />
          <Button
            label="Retreats"
            variant="outlineLight"
            size="sm"
            style={styles.flex}
            onPress={() =>
              Alert.alert('The Nomad', 'Our first retreats are coming soon. Join The Nest to hear first.')
            }
          />
        </View>
      </Animated.View>

      <View style={styles.marquee}>
        <Marquee items={MARQUEE} />
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Eyebrow>Up next</Eyebrow>
          <Text style={styles.sectionTitle}>Find your moment</Text>
        </View>
        <Pressable hitSlop={8} onPress={() => router.navigate('/book')} style={styles.link}>
          <Text style={styles.linkText}>See all</Text>
          <Icon name="arrowRight" size={14} color={colors.bronze} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.upNextList}
        snapToInterval={232}
        decelerationRate="fast">
        {upNext.map((session, index) => (
          <Animated.View key={session.id} entering={FadeInDown.delay(100 + index * 60).duration(500)}>
            <UpNextCard session={session} booked={isBooked(session.id)} now={now} />
          </Animated.View>
        ))}
      </ScrollView>

      <View style={styles.section}>
        <Eyebrow>About</Eyebrow>
        <Text style={styles.aboutTitle}>Wellbeing is more than a practice.</Text>
        <Text style={styles.body}>
          It is a way of experiencing the world around us, shaped by the way we move, feel, listen and
          connect. At The Wellnest, movement, music, nourishment and connection come together to inspire
          a more intentional way of living - bringing us closer to ourselves, to others and to the
          moments that matter.
        </Text>
      </View>

      <View style={styles.pillars}>
        {PILLARS.map((pillar, index) => (
          <View key={pillar.title} style={styles.pillar}>
            <View style={styles.pillarHead}>
              <View style={styles.pillarIcon}>
                <Icon name={pillar.icon} size={22} color={colors.bronze} />
              </View>
              <Text style={styles.pillarIndex}>0{index + 1}</Text>
            </View>
            <Text style={styles.pillarTitle}>{pillar.title}</Text>
            <Text style={styles.pillarText}>{pillar.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Eyebrow>Classes</Eyebrow>
        <Text style={styles.sectionTitle}>Three ways to move</Text>
        <Text style={[styles.body, styles.spacedBody]}>
          Every practice follows the same full-body sequence of strength, cardio, mobility and breath.
          What changes is the music - and with it, the energy.
        </Text>
        <View style={styles.classList}>
          {classTypes
            .filter((type) => type.id !== 'event')
            .map((type) => (
              <Pressable
                key={type.id}
                onPress={() => router.navigate({ pathname: '/classes', params: { focus: type.id } })}
                style={({ pressed }) => [styles.classRow, pressed && { opacity: 0.6 }]}>
                <View style={styles.classIcon}>
                  <Icon name={type.icon} size={26} color={type.color} strokeWidth={1.2} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.className}>{type.label}</Text>
                  <Text style={styles.classMeta}>{type.name} · 50 min</Text>
                </View>
                <Icon name="chevronRight" size={18} color={colors.muted} />
              </Pressable>
            ))}
        </View>
      </View>

      <Newsletter />

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Are you a brand or creator looking to collaborate?</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${WEBSITE}/kontakt`)} style={styles.link}>
          <Text style={styles.linkText}>Get in touch</Text>
          <Icon name="arrowRight" size={14} color={colors.bronze} />
        </Pressable>
        <View style={styles.footerLinks}>
          <Text
            style={styles.footerLink}
            onPress={() => WebBrowser.openBrowserAsync(`${WEBSITE}/legal-terms`)}>
            Legal Terms
          </Text>
          <Text style={styles.footerLink} onPress={() => WebBrowser.openBrowserAsync(`${WEBSITE}/kontakt`)}>
            Contact
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function UpNextCard({ session, booked, now }: { session: Session; booked: boolean; now: number }) {
  const type = getClassType(session.typeId);
  const status = availability(session, booked);
  return (
    <Pressable
      onPress={() => openSession(session.id)}
      style={({ pressed }) => [styles.upNextCard, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={styles.upNextTop}>
        <Text style={styles.upNextDay}>{dayLabel(session.start, now)}</Text>
        <View style={[styles.upNextBadge, { backgroundColor: type.color }]}>
          <Icon name={type.icon} size={16} color={colors.onDark} />
        </View>
      </View>
      <Text style={styles.upNextTime}>{formatTime(session.start)}</Text>
      <Text style={styles.upNextTitle} numberOfLines={1}>
        {session.title}
      </Text>
      <Text style={styles.upNextMeta} numberOfLines={1}>
        {getInstructor(session.instructorId).name} · {session.location}
      </Text>
      <Text style={[styles.upNextStatus, { color: status.color }]}>{status.text}</Text>
    </Pressable>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [joined, setJoined] = useState(false);
  const valid = /\S+@\S+\.\S+/.test(email);

  return (
    <View style={styles.newsletter}>
      <Icon name="mail" size={26} color={colors.onDark} strokeWidth={1.2} />
      <Text style={styles.newsletterTitle}>Join The Nest</Text>
      {joined ? (
        <Text style={styles.newsletterText}>
          Thank you! You will be the first to hear about new classes, events and retreats.
        </Text>
      ) : (
        <>
          <Text style={styles.newsletterText}>
            Sign up with your email address to receive news and updates.
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor={colors.onDarkMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.newsletterInput}
          />
          <Button label="Sign up" variant="light" disabled={!valid} onPress={() => setJoined(true)} />
        </>
      )}
    </View>
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
  topBar: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  greeting: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  wordmark: {
    fontFamily: fonts.light,
    fontSize: 20,
    letterSpacing: 6,
    color: colors.ink,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    marginHorizontal: 16,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.oliveDeep,
    padding: 28,
    paddingTop: 36,
    overflow: 'hidden',
  },
  heroRings: {
    position: 'absolute',
    top: -60,
    right: -90,
  },
  heroTitle: {
    fontFamily: fonts.light,
    fontSize: 34,
    lineHeight: 42,
    color: colors.onDark,
    marginTop: 16,
    letterSpacing: -0.3,
  },
  heroText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.onDarkMuted,
    marginTop: 14,
  },
  heroButton: {
    marginTop: 28,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  marquee: {
    marginTop: 32,
  },
  sectionHeader: {
    marginTop: 40,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: fonts.light,
    fontSize: 26,
    color: colors.ink,
    marginTop: 8,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  linkText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.bronze,
  },
  upNextList: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12,
  },
  upNextCard: {
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    padding: 18,
  },
  upNextTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upNextDay: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  upNextBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upNextTime: {
    fontFamily: fonts.light,
    fontSize: 32,
    color: colors.ink,
    marginTop: 14,
    fontVariant: ['tabular-nums'],
  },
  upNextTitle: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
    marginTop: 6,
  },
  upNextMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  upNextStatus: {
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 14,
  },
  section: {
    marginTop: 48,
    paddingHorizontal: 24,
  },
  aboutTitle: {
    fontFamily: fonts.light,
    fontSize: 28,
    lineHeight: 36,
    color: colors.ink,
    marginTop: 10,
    marginBottom: 14,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 25,
    color: colors.inkSoft,
  },
  spacedBody: {
    marginTop: 12,
  },
  pillars: {
    marginTop: 28,
    paddingHorizontal: 16,
    gap: 12,
  },
  pillar: {
    backgroundColor: colors.sand,
    borderRadius: radius.md,
    padding: 22,
  },
  pillarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pillarIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarIndex: {
    fontFamily: fonts.light,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.muted,
  },
  pillarTitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.ink,
    marginTop: 18,
  },
  pillarText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkSoft,
    marginTop: 8,
  },
  classList: {
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  classIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  className: {
    fontFamily: fonts.regular,
    fontSize: 14,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  classMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  newsletter: {
    marginTop: 48,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    padding: 28,
    gap: 14,
  },
  newsletterTitle: {
    fontFamily: fonts.light,
    fontSize: 28,
    color: colors.onDark,
  },
  newsletterText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.onDarkMuted,
  },
  newsletterInput: {
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(246, 241, 234, 0.3)',
    paddingHorizontal: 22,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.onDark,
    marginTop: 4,
  },
  footer: {
    marginTop: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  footerTitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 21,
    color: colors.inkSoft,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 16,
  },
  footerLink: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
});
