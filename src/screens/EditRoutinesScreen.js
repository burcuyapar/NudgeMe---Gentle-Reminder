import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { saveFamilyData } from '../services/familyService';

const EditRoutinesScreen = ({ navigation, route }) => {
  const { children = [], childIndex = 0, onSave } = route.params || {};
  
  const [childrenData, setChildrenData] = useState(children);
  const [isLoading, setIsLoading] = useState(false);

  const child = childrenData[childIndex] || {};
  
  const updateChild = (field, value) => {
    const updated = [...childrenData];
    updated[childIndex] = {
      ...updated[childIndex],
      [field]: value
    };
    setChildrenData(updated);
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    if (timeStr.match(/[AP]M$/i)) return timeStr;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = match[2];
      if (hours >= 0 && hours <= 23) {
        const period = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${minutes} ${period}`;
      }
    }
    return timeStr;
  };

  const handleSave = async () => {
    setIsLoading(true);
    // Format times
    const finalChildren = [...childrenData];
    const c = finalChildren[childIndex];
    if (c.bedtime) c.bedtime = formatTime(c.bedtime);
    
    const result = await saveFamilyData(finalChildren);
    setIsLoading(false);

    if (result.success) {
      if (onSave) await onSave();
      navigation.goBack();
    } else {
      Alert.alert('Error', 'Failed to save changes.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Daily Routines</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content}>
          <View style={styles.card}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Bedtime</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 9:00 PM"
                value={child.bedtime}
                onChangeText={(text) => updateChild('bedtime', text)}
                onBlur={() => updateChild('bedtime', formatTime(child.bedtime))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Routine Notes</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder="e.g. Bedtime is at 9pm, reads for 15 mins..."
                value={child.routine_notes}
                onChangeText={(text) => updateChild('routine_notes', text)}
                multiline
                numberOfLines={4}
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.saveButton, isLoading && styles.disabledButton]} 
            onPress={handleSave}
            disabled={isLoading}
          >
             {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.cream,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...SHADOWS.medium,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.gray,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.cream,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.primary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  footer: {
    padding: 16,
    backgroundColor: COLORS.cream,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  saveButton: {
    backgroundColor: COLORS.softBlue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default EditRoutinesScreen;
