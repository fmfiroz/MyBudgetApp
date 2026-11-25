import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveLocalData } from '../utils/firebaseSync';

const { width } = Dimensions.get('window');

export const ONBOARDING_COMPLETED_KEY = '@mybudget_onboarding_completed_v1';

const slides = [
  {
    icon: '💰',
    title: 'Manage Your Money',
    description:
      'সহজেই আপনার আয়, ব্যয় ও প্রতিদিনের আর্থিক লেনদেনের হিসাব সংরক্ষণ করুন।',
  },
  {
    icon: '🎯',
    title: 'Plan & Save',
    description:
      'বাজেট তৈরি করুন, সঞ্চয়ের লক্ষ্য নির্ধারণ করুন এবং আর্থিক পরিকল্পনা করুন।',
  },
  {
    icon: '📊',
    title: 'Track Everything',
    description:
      'Shop Debt, Welfare, Social & Religious Activity এবং অন্যান্য হিসাব এক জায়গায় রাখুন।',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const activeIndexRef = useRef<number>(0);
  const finishingRef = useRef<boolean>(false);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const syncSlideIndex = (nextIdx: number, animated = true) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, nextIdx));
    activeIndexRef.current = clamped;
    setCurrentIndex(clamped);
    scrollRef.current?.scrollTo({
      x: width * clamped,
      animated,
    });
  };

  const handleScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const pageWidth = event.nativeEvent.layoutMeasurement?.width || width;
    if (!pageWidth) return;
    const index = Math.max(
      0,
      Math.min(
        slides.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / pageWidth)
      )
    );
    activeIndexRef.current = index;
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (loading || finishingRef.current) return;
    const idx = activeIndexRef.current;
    if (idx < slides.length - 1) {
      syncSlideIndex(idx + 1, true);
    } else {
      void finishOnboarding();
    }
  };

  const handlePrevious = () => {
    if (loading || finishingRef.current) return;
    const idx = activeIndexRef.current;
    if (idx > 0) {
      syncSlideIndex(idx - 1, true);
    }
  };

  const finishOnboarding = async () => {
    if (finishingRef.current || loading) return;
    finishingRef.current = true;
    setLoading(true);

    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
      await saveLocalData(ONBOARDING_COMPLETED_KEY, 'true');
      router.replace('/login');
    } catch (error) {
      console.log('Onboarding save error:', error);
      finishingRef.current = false;
      setLoading(false);
    }
  };

  const isLastSlide = currentIndex === slides.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>MyBudget</Text>
        {!isLastSlide && (
          <TouchableOpacity
            onPress={() => void finishOnboarding()}
            disabled={loading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
      >
        {slides.map((slide, index) => (
          <View style={styles.slide} key={index}>
            <View style={styles.illustration}>
              <Text style={styles.illustrationIcon}>{slide.icon}</Text>
            </View>

            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.description}>{slide.description}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottomSection}>
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentIndex === index && styles.activeDot,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.disabledButton]}
          onPress={handleNext}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Please wait...' : isLastSlide ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>

        {currentIndex > 0 && (
          <TouchableOpacity
            style={styles.previousButton}
            onPress={handlePrevious}
            disabled={loading}
          >
            <Text style={styles.previousText}>Previous</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    height: 55,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 35,
    paddingBottom: 30,
  },
  illustration: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 45,
  },
  illustrationIcon: {
    fontSize: 100,
  },
  title: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    lineHeight: 27,
    color: '#6B7280',
    textAlign: 'center',
  },
  bottomSection: {
    paddingHorizontal: 25,
    paddingBottom: 20,
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 28,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 5,
  },
  activeDot: {
    width: 27,
    backgroundColor: '#2563EB',
  },
  button: {
    width: '100%',
    height: 54,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  previousButton: {
    marginTop: 15,
    padding: 8,
  },
  previousText: {
    color: '#6B7280',
    fontSize: 15,
  },
});