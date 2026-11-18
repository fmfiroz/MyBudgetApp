
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
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const slides = [
  {
    icon: '💰',
    title: 'Manage Your Money',
    description: 'সহজেই আপনার আয়, ব্যয় ও প্রতিদিনের আর্থিক লেনদেনের হিসাব সংরক্ষণ করুন।',
  },
  {
    icon: '🎯',
    title: 'Plan & Save',
    description: 'বাজেট তৈরি করুন, সঞ্চয়ের লক্ষ্য নির্ধারণ করুন এবং আর্থিক পরিকল্পনা করুন।',
  },
  {
    icon: '📊',
    title: 'Track Everything',
    description: 'Shop Debt, Welfare, Social & Religious Activity এবং অন্যান্য হিসাব এক জায়গায় রাখুন।',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const nextSlide = () => {
    if (currentIndex < slides.length - 1) {
      scrollRef.current?.scrollTo({
        x: width * (currentIndex + 1),
        animated: true,
      });
    }
  };

  const finishOnboarding = async () => {
    if (loading) return;
    setLoading(true);

    try {
      await AsyncStorage.setItem('@onboarding_completed', 'true');
      router.replace('/login');
    } catch (error) {
      console.log('Onboarding save error:', error);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>MyBudget</Text>
        {currentIndex < 2 && (
          <TouchableOpacity onPress={finishOnboarding}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
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
          style={styles.button}
          onPress={
            currentIndex === 2 ? finishOnboarding : nextSlide
          }
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading
              ? 'Please wait...'
              : currentIndex === 2
                ? 'Get Started'
                : 'Next'}
          </Text>
        </TouchableOpacity>

        {currentIndex > 0 && (
          <TouchableOpacity
            style={styles.previousButton}
            onPress={() => {
              scrollRef.current?.scrollTo({
                x: width * (currentIndex - 1),
                animated: true,
              });
            }}
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
