import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bionectech.bagping',
  appName: 'BagPing',
  webDir: 'www',
  backgroundColor: '#052744',
  plugins: {
    SplashScreen: { backgroundColor: '#052744', showSpinner: false, launchAutoHide: true },
    LocalNotifications: { smallIcon: 'ic_stat_bagping', iconColor: '#0099E6' }
  },
  ios: { contentInset: 'always' }
};

export default config;
