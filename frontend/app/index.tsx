import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface LoginState {
  username: string;
  password: string;
  isLoading: boolean;
}

interface PredictionForm {
  Location: string;
  Source_Type: string;
  NH4: string;
  BSK5: string;
  Suspended: string;
  O2: string;
  NO3: string;
  NO2: string;
  SO4: string;
  PO4: string;
  CL: string;
  pH: string;
  Turbidity: string;
  Temperature: string;
  Year: string;
  Month: string;
  Day: string;
}

interface PredictionResult {
  prediction: number;
  confidence?: number;
  risk_level: string;
  message: string;
}

export default function Index() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<'login' | 'form' | 'result'>('login');
  const [authToken, setAuthToken] = useState<string | null>(null);
  
  // Login state
  const [loginState, setLoginState] = useState<LoginState>({
    username: '',
    password: '',
    isLoading: false,
  });

  // Prediction form state
  const [predictionForm, setPredictionForm] = useState<PredictionForm>({
    Location: '',
    Source_Type: '',
    NH4: '',
    BSK5: '',
    Suspended: '',
    O2: '',
    NO3: '',
    NO2: '',
    SO4: '',
    PO4: '',
    CL: '',
    pH: '',
    Turbidity: '',
    Temperature: '',
    Year: new Date().getFullYear().toString(),
    Month: (new Date().getMonth() + 1).toString(),
    Day: new Date().getDate().toString(),
  });

  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const EXPO_BACKEND_URL = Constants.expoConfig?.extra?.EXPO_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

  useEffect(() => {
    checkAuthToken();
    registerForPushNotifications();
  }, []);

  const checkAuthToken = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        setAuthToken(token);
        setIsLoggedIn(true);
        setCurrentScreen('form');
      }
    } catch (error) {
      console.error('Error checking auth token:', error);
    }
  };

  const registerForPushNotifications = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert('Permission required', 'Push notifications permission is required for outbreak alerts');
        return;
      }
      
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      console.log('Push notification token:', token);
    } catch (error) {
      console.error('Error setting up notifications:', error);
    }
  };

  const handleLogin = async () => {
    if (!loginState.username.trim() || !loginState.password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setLoginState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch(`${EXPO_BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loginState.username,
          password: loginState.password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setAuthToken(data.access_token);
        await AsyncStorage.setItem('authToken', data.access_token);
        setIsLoggedIn(true);
        setCurrentScreen('form');
        Alert.alert('Success', data.message);
      } else {
        Alert.alert('Login Failed', data.detail || 'Invalid credentials');
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoginState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handlePrediction = async () => {
    // Validate required fields
    const requiredFields = [
      'Location', 'Source_Type', 'NH4', 'BSK5', 'Suspended', 'O2',
      'NO3', 'NO2', 'SO4', 'PO4', 'CL', 'pH', 'Turbidity', 'Temperature'
    ];

    const missingFields = requiredFields.filter(field => !predictionForm[field as keyof PredictionForm].trim());
    
    if (missingFields.length > 0) {
      Alert.alert('Error', `Please fill in all required fields: ${missingFields.join(', ')}`);
      return;
    }

    setIsSubmitting(true);

    try {
      const requestData = {
        Location: predictionForm.Location,
        Source_Type: predictionForm.Source_Type,
        NH4: parseFloat(predictionForm.NH4),
        BSK5: parseFloat(predictionForm.BSK5),
        Suspended: parseFloat(predictionForm.Suspended),
        O2: parseFloat(predictionForm.O2),
        NO3: parseFloat(predictionForm.NO3),
        NO2: parseFloat(predictionForm.NO2),
        SO4: parseFloat(predictionForm.SO4),
        PO4: parseFloat(predictionForm.PO4),
        CL: parseFloat(predictionForm.CL),
        pH: parseFloat(predictionForm.pH),
        Turbidity: parseFloat(predictionForm.Turbidity),
        Temperature: parseFloat(predictionForm.Temperature),
        Year: parseInt(predictionForm.Year),
        Month: parseInt(predictionForm.Month),
        Day: parseInt(predictionForm.Day),
      };

      const response = await fetch(`${EXPO_BACKEND_URL}/api/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (response.ok) {
        setPredictionResult(data);
        setCurrentScreen('result');
        
        // Send push notification if high risk
        if (data.prediction === 1) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '⚠️ Outbreak Risk Alert',
              body: data.message,
              data: { risk_level: data.risk_level },
            },
            trigger: null, // Show immediately
          });
        }
      } else {
        Alert.alert('Prediction Failed', data.detail || 'Unable to make prediction');
      }
    } catch (error) {
      console.error('Prediction error:', error);
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      setAuthToken(null);
      setIsLoggedIn(false);
      setCurrentScreen('login');
      setPredictionResult(null);
      // Reset form
      setPredictionForm({
        Location: '',
        Source_Type: '',
        NH4: '',
        BSK5: '',
        Suspended: '',
        O2: '',
        NO3: '',
        NO2: '',
        SO4: '',
        PO4: '',
        CL: '',
        pH: '',
        Turbidity: '',
        Temperature: '',
        Year: new Date().getFullYear().toString(),
        Month: (new Date().getMonth() + 1).toString(),
        Day: new Date().getDate().toString(),
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const renderLoginScreen = () => (
    <LinearGradient
      colors={['#0077be', '#00a8e8', '#40c5c5', '#7dd3c0']}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.loginContainer}>
              <View style={styles.headerContainer}>
                <Text style={styles.title}>🌊 Smart Health</Text>
                <Text style={styles.subtitle}>Water Surveillance System</Text>
                <Text style={styles.description}>
                  Early warning system for water-borne disease outbreaks
                </Text>
              </View>

              <View style={styles.formContainer}>
                <Text style={styles.loginTitle}>Sign In</Text>
                
                <TextInput
                  style={styles.input}
                  placeholderTextColor="#rgba(255,255,255,0.7)"
                  placeholder="Username"
                  value={loginState.username}
                  onChangeText={(text) => setLoginState(prev => ({ ...prev, username: text }))}
                  autoCapitalize="none"
                />

                <TextInput
                  style={styles.input}
                  placeholderTextColor="#rgba(255,255,255,0.7)"
                  placeholder="Password"
                  value={loginState.password}
                  onChangeText={(text) => setLoginState(prev => ({ ...prev, password: text }))}
                  secureTextEntry
                />

                <Text style={styles.hint}>
                  Demo credentials: Any username with password "health123"
                </Text>

                <TouchableOpacity
                  style={[styles.button, loginState.isLoading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={loginState.isLoading}
                >
                  <Text style={styles.buttonText}>
                    {loginState.isLoading ? 'Signing In...' : 'Sign In'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );

  const renderPredictionForm = () => (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#f0f9ff', '#e0f2fe', '#b3e5fc']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Water Quality Assessment</Text>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.predictionForm}>
              {/* Categorical Fields */}
              <Text style={styles.sectionTitle}>Location Information</Text>
              
              <TextInput
                style={styles.formInput}
                placeholder="Location (e.g., CityA, UrbanArea)"
                value={predictionForm.Location}
                onChangeText={(text) => setPredictionForm(prev => ({ ...prev, Location: text }))}
              />

              <TextInput
                style={styles.formInput}
                placeholder="Source Type (e.g., River, Lake, Well)"
                value={predictionForm.Source_Type}
                onChangeText={(text) => setPredictionForm(prev => ({ ...prev, Source_Type: text }))}
              />

              {/* Water Quality Parameters */}
              <Text style={styles.sectionTitle}>Water Quality Parameters</Text>
              
              {Object.entries({
                NH4: 'Ammonia (NH4) - mg/L',
                BSK5: 'BOD5 - mg/L',
                Suspended: 'Suspended Solids - mg/L',
                O2: 'Dissolved Oxygen - mg/L',
                NO3: 'Nitrate (NO3) - mg/L',
                NO2: 'Nitrite (NO2) - mg/L',
                SO4: 'Sulfate (SO4) - mg/L',
                PO4: 'Phosphate (PO4) - mg/L',
                CL: 'Chloride - mg/L',
                pH: 'pH Level',
                Turbidity: 'Turbidity - NTU',
                Temperature: 'Temperature - °C',
              }).map(([key, label]) => (
                <TextInput
                  key={key}
                  style={styles.formInput}
                  placeholder={label}
                  value={predictionForm[key as keyof PredictionForm]}
                  onChangeText={(text) => setPredictionForm(prev => ({ ...prev, [key]: text }))}
                  keyboardType="numeric"
                />
              ))}

              {/* Date Fields */}
              <Text style={styles.sectionTitle}>Date Information</Text>
              
              <View style={styles.dateRow}>
                <TextInput
                  style={[styles.formInput, styles.dateInput]}
                  placeholder="Year"
                  value={predictionForm.Year}
                  onChangeText={(text) => setPredictionForm(prev => ({ ...prev, Year: text }))}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.formInput, styles.dateInput]}
                  placeholder="Month"
                  value={predictionForm.Month}
                  onChangeText={(text) => setPredictionForm(prev => ({ ...prev, Month: text }))}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.formInput, styles.dateInput]}
                  placeholder="Day"
                  value={predictionForm.Day}
                  onChangeText={(text) => setPredictionForm(prev => ({ ...prev, Day: text }))}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity
                style={[styles.predictButton, isSubmitting && styles.buttonDisabled]}
                onPress={handlePrediction}
                disabled={isSubmitting}
              >
                <Text style={styles.buttonText}>
                  {isSubmitting ? 'Analyzing...' : 'Analyze Water Quality'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );

  const renderResultScreen = () => (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={predictionResult?.prediction === 1 
          ? ['#fef2f2', '#fee2e2', '#fecaca'] 
          : ['#f0fdf4', '#dcfce7', '#bbf7d0']
        }
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>Analysis Results</Text>
            
            <View style={[
              styles.resultCard,
              predictionResult?.prediction === 1 ? styles.highRiskCard : styles.lowRiskCard
            ]}>
              <Text style={styles.riskLevel}>
                Risk Level: {predictionResult?.risk_level}
              </Text>
              
              <Text style={styles.riskIcon}>
                {predictionResult?.prediction === 1 ? '⚠️' : '✅'}
              </Text>
              
              <Text style={styles.resultMessage}>
                {predictionResult?.message}
              </Text>
              
              {predictionResult?.confidence && (
                <Text style={styles.confidence}>
                  Confidence: {(predictionResult.confidence * 100).toFixed(1)}%
                </Text>
              )}
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setCurrentScreen('form')}
              >
                <Text style={styles.secondaryButtonText}>New Analysis</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleLogout}
              >
                <Text style={styles.buttonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );

  // Main render logic
  if (!isLoggedIn) {
    return renderLoginScreen();
  }

  switch (currentScreen) {
    case 'form':
      return renderPredictionForm();
    case 'result':
      return renderResultScreen();
    default:
      return renderLoginScreen();
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  formContainer: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 25,
    paddingHorizontal: 20,
    marginBottom: 16,
    color: 'white',
    fontSize: 16,
  },
  hint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#0066cc',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  logoutButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  logoutText: {
    color: 'white',
    fontWeight: 'bold',
  },
  predictionForm: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0066cc',
    marginTop: 20,
    marginBottom: 15,
  },
  formInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateInput: {
    flex: 1,
    marginHorizontal: 4,
  },
  predictButton: {
    backgroundColor: '#0066cc',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  resultContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
  },
  resultCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  highRiskCard: {
    borderLeftWidth: 5,
    borderLeftColor: '#ff4444',
  },
  lowRiskCard: {
    borderLeftWidth: 5,
    borderLeftColor: '#00cc44',
  },
  riskLevel: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  riskIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  resultMessage: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 15,
  },
  confidence: {
    fontSize: 14,
    color: '#888',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0066cc',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#0066cc',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  secondaryButtonText: {
    color: '#0066cc',
    fontSize: 16,
    fontWeight: 'bold',
  },
});