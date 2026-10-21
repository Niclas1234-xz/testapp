import { Linking } from 'react-native';

// thewellnest.ch does not list the studio's street address yet. Until `address` is filled in,
// Google Maps searches for the studio by name and city instead.
export const STUDIO = {
  name: 'The Wellnest',
  city: 'Luzern',
  address: '',
};

/** Opens the studio in Google Maps (the app if installed, otherwise the browser). */
export function openStudioInMaps() {
  const query = STUDIO.address
    ? `${STUDIO.name}, ${STUDIO.address}`
    : `${STUDIO.name} ${STUDIO.city}`;
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
}
