import { Linking } from 'react-native';

export const STUDIO = {
  name: 'The Wellnest',
  city: 'Luzern',
  address: 'Museggstrasse 4, Luzern',
};

/** Opens the studio in Google Maps (the app if installed, otherwise the browser). */
export function openStudioInMaps() {
  // Search by address so the pin lands on the door; fall back to the name if it is ever empty.
  const query = STUDIO.address || `${STUDIO.name} ${STUDIO.city}`;
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
}
