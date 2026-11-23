const handleGoogleLogin = async () => {
  setLoading(true);
  try {
    if (Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      const webCred = await signInWithPopup(auth, provider);
      await syncGuestLocalDataOnRegistration({
        userId: webCred.user.uid,
        email: webCred.user.email,
        displayName: webCred.user.displayName,
      });
      router.replace('/dashboard');
      return;
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // প্রতিবার অ্যাকাউন্ট তালিকা দেখানোর জন্য আগের Google সাইন-ইন সেশন পরিষ্কার করা
    try {
      await GoogleSignin.signOut();
    } catch {
      // আগে সাইন-ইন না থাকলে বা এরর হলে ইগনোর করা হবে
    }

    const signInResult = await GoogleSignin.signIn();

    if ((signInResult as any)?.type === 'cancelled') {
      setLoading(false);
      return;
    }

    const idToken =
      signInResult?.data?.idToken ?? (signInResult as any)?.idToken ?? null;

    if (!idToken) {
      throw new Error(
        'Google ID Token পাওয়া যায়নি। Firebase Console-এ Web Client ID এবং Android SHA-1 ফিঙ্গারপ্রিন্ট যুক্ত আছে কি না যাচাই করুন।'
      );
    }

    const googleCredential = GoogleAuthProvider.credential(idToken);
    const userCred = await signInWithCredential(auth, googleCredential);

    await syncGuestLocalDataOnRegistration({
      userId: userCred.user.uid,
      email: userCred.user.email,
      displayName: userCred.user.displayName,
    });

    router.replace('/dashboard');
  } catch (error: any) {
    if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
      return;
    }

    let friendlyMsg = error?.message || 'Unable to sign in with Google.';
    if (error?.code === statusCodes.DEVELOPER_ERROR || String(error?.code) === '10') {
      friendlyMsg =
        'Google Sign-In Configuration Error (SHA-1): EAS/Android বিল্ডের SHA-1 ফিঙ্গারপ্রিন্ট Firebase Console -> Project Settings -> Android App-এ যুক্ত করুন।';
    } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      friendlyMsg = 'এই ডিভাইসে Google Play Services পাওয়া যায়নি বা আপডেট প্রয়োজন।';
    }

    Alert.alert('Google Login Failed', friendlyMsg);
  } finally {
    setLoading(false);
  }
};