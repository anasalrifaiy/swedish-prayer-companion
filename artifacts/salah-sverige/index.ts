import { Platform } from 'react-native';
import 'expo-router/entry';

// The widget runs in a headless JS task, so its handler must be registered at startup.
// The widget library has no web implementation.
if (Platform.OS === 'android') {
  require('./widgets/widget-task-handler');
}
