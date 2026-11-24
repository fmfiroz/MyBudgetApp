import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../firebase';

function isVersionOutdated(currentVersion: string, minVersion: string): boolean {
  const currentParts = currentVersion.split('.').map(Number);
  const minParts = minVersion.split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, minParts.length); i++) {
    const curr = currentParts[i] || 0;
    const min = minParts[i] || 0;
    if (curr < min) return true;
    if (curr > min) return false;
  }
  return false;
}

export default function ForceUpdateModal() {
  const [updateRequired, setUpdateRequired] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  const [message, setMessage] = useState(
    'অ্যাপের নতুন ভার্সন এসেছে। ব্যবহার চালিয়ে যেতে অনুগ্রহ করে অ্যাপটি আপডেট করুন।'
  );

  const currentAppVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    const db = getFirestore(auth.app);
    const docRef = doc(db, 'appConfig', 'versionControl');

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const minRequiredVersion = data.minRequiredVersion || '1.0.0';

          if (isVersionOutdated(currentAppVersion, minRequiredVersion)) {
            setStoreUrl(
              data.playStoreUrl ||
                'https://play.google.com/store/apps/details?id=com.yourpackage.mybudgetapp'
            );
            if (data.updateMessage) {
              setMessage(data.updateMessage);
            }
            setUpdateRequired(true);
          } else {
            setUpdateRequired(false);
          }
        }
      },
      (error) => {
        console.log('Version check error:', error);
      }
    );

    return () => unsubscribe();
  }, [currentAppVersion]);

  const handleOpenStore = async () => {
    if (!storeUrl) return;
    try {
      await Linking.openURL(storeUrl);
    } catch (err) {
      console.error('Failed to open store URL:', err);
    }
  };

  if (!updateRequired) return null;

  return (
    <Modal
      visible={updateRequired}
      transparent={false}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-download-outline" size={48} color="#2E7D32" />
          </View>

          <Text style={styles.title}>নতুন আপডেট উপলব্ধ!</Text>
          <Text style={styles.versionBadge}>
            বর্তমান ভার্সন: v{currentAppVersion}
          </Text>

          <Text style={styles.description}>{message}</Text>

          <TouchableOpacity
            style={styles.updateButton}
            activeOpacity={0.85}
            onPress={handleOpenStore}
          >
            <Ionicons name="logo-google-playstore" size={20} color="#FFF" />
            <Text style={styles.updateButtonText}>
              এখনই আপডেট করুন (Update Now)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B5E20',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 6,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  versionBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D32F2F',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 14,
  },
  description: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E7D32',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});