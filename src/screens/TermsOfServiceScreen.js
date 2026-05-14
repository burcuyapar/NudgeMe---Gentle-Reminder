import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';

const TermsOfServiceScreen = ({ navigation }) => {
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
          <Text style={styles.headerTitle}>Terms of Service</Text>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.lastUpdated}>Last Updated: January 20, 2026</Text>
          
          <Text style={styles.paragraph}>
            Please read these Terms of Service ("Terms") carefully before using NudgeMe.
          </Text>

          <Text style={styles.sectionTitle}>Acceptance of Terms</Text>
          <Text style={styles.paragraph}>
            By accessing or using NudgeMe, you agree to be bound by these Terms. If you do not agree, do not use the app.
          </Text>

          <Text style={styles.sectionTitle}>Eligibility</Text>
          <Text style={styles.paragraph}>
            You must be at least 18 years old to use NudgeMe. By using the app, you represent that you are 18 or older.
          </Text>

          <Text style={styles.sectionTitle}>User Accounts</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• You are responsible for maintaining the confidentiality of your account</Text>
            <Text style={styles.listItem}>• You are responsible for all activities under your account</Text>
            <Text style={styles.listItem}>• You must provide accurate and complete information</Text>
            <Text style={styles.listItem}>• You may not share your account with others</Text>
          </View>

          <Text style={styles.sectionTitle}>Acceptable Use</Text>
          <Text style={styles.paragraph}>You agree not to:</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• Use the app for any illegal purpose</Text>
            <Text style={styles.listItem}>• Attempt to gain unauthorized access to our systems</Text>
            <Text style={styles.listItem}>• Interfere with the proper functioning of the app</Text>
            <Text style={styles.listItem}>• Upload malicious code or viruses</Text>
          </View>

          <Text style={styles.sectionTitle}>Intellectual Property</Text>
          <Text style={styles.paragraph}>
            NudgeMe and its content are owned by us and protected by copyright and trademark laws. You may not copy, modify, or distribute any part of the app without our permission.
          </Text>

          <Text style={styles.sectionTitle}>Service Availability</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• The app is provided "as is" without warranties of any kind</Text>
            <Text style={styles.listItem}>• We do not guarantee uninterrupted or error-free service</Text>
            <Text style={styles.listItem}>• We reserve the right to modify or discontinue the service at any time</Text>
          </View>

          <Text style={styles.sectionTitle}>Your Data</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• You retain ownership of all data you create in the app</Text>
            <Text style={styles.listItem}>• You can export or delete your data at any time</Text>
            <Text style={styles.listItem}>• We will not use your data for purposes other than providing the service</Text>
          </View>

          <Text style={styles.sectionTitle}>Termination</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• You may stop using the app and delete your account at any time</Text>
            <Text style={styles.listItem}>• We reserve the right to suspend or terminate accounts that violate these Terms</Text>
            <Text style={styles.listItem}>• Upon termination, your data will be deleted</Text>
          </View>

          <Text style={styles.sectionTitle}>Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            NudgeMe is not liable for any indirect, incidental, or consequential damages arising from your use of the app.
          </Text>

          <Text style={styles.sectionTitle}>Changes to Terms</Text>
          <Text style={styles.paragraph}>
            We may update these Terms from time to time. Continued use of the app after changes constitutes acceptance of the new Terms.
          </Text>

          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.paragraph}>
            For questions about these Terms, please contact us at:
          </Text>
          <Text style={styles.email}>info.nudgemeapp@gmail.com</Text>
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

export default TermsOfServiceScreen;
