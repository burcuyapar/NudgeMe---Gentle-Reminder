import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';

const PrivacyPolicyScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.softBlue, COLORS.lavender]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <SafeAreaView style={styles.headerContent}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Privacy Policy</Text>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.lastUpdated}>Last Updated: January 20, 2026</Text>
          
          <Text style={styles.paragraph}>
            NudgeMe is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our mobile application.
          </Text>

          <Text style={styles.sectionTitle}>Information We Collect</Text>
          <Text style={styles.paragraph}>We collect the following information:</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• Account Information: Name, email address</Text>
            <Text style={styles.listItem}>• Family Information: Children's names, ages, school schedules</Text>
            <Text style={styles.listItem}>• Reminder Data: Your personal reminders, activities, and self-care routines</Text>
            <Text style={styles.listItem}>• Device Information: Device type, operating system for notification delivery</Text>
          </View>

          <Text style={styles.sectionTitle}>How We Use Your Information</Text>
          <Text style={styles.paragraph}>We use your information to:</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• Provide reminder and notification services</Text>
            <Text style={styles.listItem}>• Maintain and improve the app</Text>
            <Text style={styles.listItem}>• Send you scheduled reminders</Text>
            <Text style={styles.listItem}>• Sync your data across devices</Text>
          </View>

          <Text style={styles.sectionTitle}>Data Storage and Security</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• Your data is securely stored using Supabase</Text>
            <Text style={styles.listItem}>• We use industry-standard encryption</Text>
            <Text style={styles.listItem}>• We do not sell, rent, or share your personal data with third parties</Text>
            <Text style={styles.listItem}>• We do not use your data for advertising</Text>
          </View>

          <Text style={styles.sectionTitle}>Your Rights</Text>
          <Text style={styles.paragraph}>You have the right to:</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• Access your personal data</Text>
            <Text style={styles.listItem}>• Delete your account and all associated data at any time</Text>
            <Text style={styles.listItem}>• Update or correct your information</Text>
          </View>

          <Text style={styles.sectionTitle}>Data Retention</Text>
          <Text style={styles.paragraph}>
            Your data is retained as long as your account is active. When you delete your account, all personal data is permanently removed from our servers.
          </Text>

          <Text style={styles.sectionTitle}>Children's Privacy</Text>
          <Text style={styles.paragraph}>
            NudgeMe is intended for users 18 years and older. We do not knowingly collect information from users under 18.
          </Text>

          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have questions about this Privacy Policy, please contact us at:
          </Text>
          <Text style={styles.email}>info.nudgemeapp@gmail.com</Text>

          <Text style={styles.sectionTitle}>Changes to This Policy</Text>
          <Text style={styles.paragraph}>
            We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last Updated" date.
          </Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  header: {
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...SHADOWS.soft,
    paddingTop: 10,
  },
  headerContent: {
    paddingHorizontal: SIZES.padding,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    height: 60,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    padding: 10,
  },
  headerTitle: {
    ...FONTS.h2,
    color: COLORS.white,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    ...SHADOWS.soft,
  },
  lastUpdated: {
    ...FONTS.small,
    color: COLORS.gray,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  sectionTitle: {
    ...FONTS.h3,
    color: COLORS.text,
    marginTop: 24,
    marginBottom: 12,
    fontWeight: '700',
  },
  paragraph: {
    ...FONTS.body,
    color: COLORS.text,
    marginBottom: 12,
    lineHeight: 22,
  },
  list: {
    marginBottom: 12,
  },
  listItem: {
    ...FONTS.body,
    color: COLORS.text,
    marginBottom: 8,
    lineHeight: 22,
    paddingLeft: 8,
  },
  email: {
    ...FONTS.body,
    color: COLORS.softBlue,
    fontWeight: '600',
    marginBottom: 12,
  },
});

export default PrivacyPolicyScreen;
