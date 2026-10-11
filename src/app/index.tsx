import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import type { CarResult } from '@/lib/car-schema';

// Longest edge sent to the AI. Plenty for recognition and keeps the upload small.
const MAX_IMAGE_EDGE = 1280;

const chf = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: 'CHF',
  maximumFractionDigits: 0,
});

function formatRange(range: { von: number; bis: number }) {
  if (!range.von && !range.bis) return '–';
  if (range.von === range.bis) return chf.format(range.von);
  return `${chf.format(range.von)} – ${chf.format(range.bis)}`;
}

async function prepareImage(asset: ImagePicker.ImagePickerAsset) {
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width >= asset.height && asset.width > MAX_IMAGE_EDGE) {
    context.resize({ width: MAX_IMAGE_EDGE });
  } else if (asset.height > asset.width && asset.height > MAX_IMAGE_EDGE) {
    context.resize({ height: MAX_IMAGE_EDGE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  if (!result.base64) throw new Error('Bild konnte nicht gelesen werden.');
  return { uri: result.uri, base64: result.base64 };
}

export default function ScanScreen() {
  const colors = useColorScheme() === 'dark' ? darkColors : lightColors;
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<CarResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function pick(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Berechtigung benötigt',
        source === 'camera'
          ? 'Bitte erlaube den Kamerazugriff in den Einstellungen.'
          : 'Bitte erlaube den Zugriff auf deine Fotos in den Einstellungen.'
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 1 };
    const picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) return;

    await analyze(picked.assets[0]);
  }

  async function analyze(asset: ImagePicker.ImagePickerAsset) {
    setPhotoUri(asset.uri);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const image = await prepareImage(asset);
      const response = await fetch('/api/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: image.base64, mediaType: 'image/jpeg' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Erkennung fehlgeschlagen.');
      setResult(data as CarResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erkennung fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic">
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
      ) : (
        <View style={[styles.photo, styles.placeholder, { borderColor: colors.border }]}>
          <Text style={styles.placeholderIcon}>🚗</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>
            Fotografiere ein Auto und die KI sagt dir, welches Modell es ist und was es ungefähr
            kostet.
          </Text>
        </View>
      )}

      <View style={styles.buttons}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.accent, opacity: pressed || loading ? 0.7 : 1 },
          ]}
          disabled={loading}
          onPress={() => pick('camera')}>
          <Text style={styles.buttonText}>📷  Foto aufnehmen</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            { borderColor: colors.accent, opacity: pressed || loading ? 0.7 : 1 },
          ]}
          disabled={loading}
          onPress={() => pick('library')}>
          <Text style={[styles.buttonText, { color: colors.accent }]}>Aus Galerie wählen</Text>
        </Pressable>
      </View>

      {loading && (
        <View style={styles.status}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.muted, { color: colors.muted }]}>KI analysiert das Auto …</Text>
        </View>
      )}

      {error && (
        <View style={[styles.card, { backgroundColor: colors.errorBg }]}>
          <Text style={[styles.body, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      {result && <ResultCard result={result} colors={colors} />}
    </ScrollView>
  );
}

function ResultCard({ result, colors }: { result: CarResult; colors: Palette }) {
  if (!result.autoErkannt) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text }]}>Kein Auto erkannt</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Versuche es mit einem Foto, auf dem das Auto gut sichtbar ist – am besten schräg von
          vorne.
        </Text>
      </View>
    );
  }

  const details = [result.generation, result.baujahre, result.karosserie, result.farbe].filter(
    Boolean
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {result.marke} {result.modell}
      </Text>
      {details.length > 0 && (
        <Text style={[styles.body, { color: colors.muted }]}>{details.join(' · ')}</Text>
      )}

      <View style={styles.confidenceRow}>
        <View style={[styles.confidenceTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.confidenceFill,
              {
                width: `${Math.min(100, Math.max(0, result.sicherheit))}%`,
                backgroundColor: colors.accent,
              },
            ]}
          />
        </View>
        <Text style={[styles.small, { color: colors.muted }]}>
          {result.sicherheit}% sicher
        </Text>
      </View>

      <View style={styles.prices}>
        <View style={[styles.priceBox, { borderColor: colors.border }]}>
          <Text style={[styles.small, { color: colors.muted }]}>Geschätzter Wert (gebraucht)</Text>
          <Text style={[styles.price, { color: colors.text }]}>
            {formatRange(result.gebrauchtpreisChf)}
          </Text>
        </View>
        <View style={[styles.priceBox, { borderColor: colors.border }]}>
          <Text style={[styles.small, { color: colors.muted }]}>Neupreis</Text>
          <Text style={[styles.price, { color: colors.text }]}>
            {formatRange(result.neupreisChf)}
          </Text>
        </View>
      </View>
      {result.preisHinweis ? (
        <Text style={[styles.small, { color: colors.muted }]}>{result.preisHinweis}</Text>
      ) : null}

      {result.merkmale.length > 0 && (
        <>
          <Text style={[styles.subtitle, { color: colors.text }]}>Erkannt an</Text>
          {result.merkmale.map((m) => (
            <Text key={m} style={[styles.body, { color: colors.text }]}>
              • {m}
            </Text>
          ))}
        </>
      )}

      {result.alternativen.length > 0 && (
        <>
          <Text style={[styles.subtitle, { color: colors.text }]}>Könnte auch sein</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            {result.alternativen.join(', ')}
          </Text>
        </>
      )}

      <Text style={[styles.disclaimer, { color: colors.muted }]}>
        KI-Schätzung ohne Gewähr. Der tatsächliche Preis hängt von Kilometerstand, Zustand und
        Ausstattung ab.
      </Text>
    </View>
  );
}

type Palette = typeof lightColors;

const lightColors = {
  background: '#F4F5F7',
  card: '#FFFFFF',
  text: '#111418',
  muted: '#5B6470',
  border: '#DDE1E6',
  accent: '#1F6FEB',
  error: '#B42318',
  errorBg: '#FDECEA',
};

const darkColors: Palette = {
  background: '#0D1014',
  card: '#181C22',
  text: '#F1F3F5',
  muted: '#9AA4AF',
  border: '#2B313A',
  accent: '#4C8DF6',
  error: '#FDA29B',
  errorBg: '#3A1A17',
};

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 48 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16 },
  placeholder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  placeholderIcon: { fontSize: 48 },
  buttons: { gap: 10 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1.5 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  card: { borderRadius: 16, padding: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  muted: { fontSize: 15, textAlign: 'center' },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  confidenceTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  confidenceFill: { height: '100%', borderRadius: 3 },
  prices: { flexDirection: 'row', gap: 10, marginTop: 8 },
  priceBox: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  price: { fontSize: 17, fontWeight: '700' },
  disclaimer: { fontSize: 12, lineHeight: 16, marginTop: 12 },
});
