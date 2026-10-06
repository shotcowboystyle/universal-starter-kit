import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGE_KEY = 'language-preference';

export const loadLanguagePreference = async (): Promise<string | null> => await AsyncStorage.getItem(LANGUAGE_KEY);

export const saveLanguagePreference = async (lang: string): Promise<void> => {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
};
