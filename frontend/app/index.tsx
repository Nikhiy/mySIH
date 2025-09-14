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
  Modal,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

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

  // Dropdown state for categorical fields
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showSourceTypeDropdown, setShowSourceTypeDropdown] = useState(false);

  const locationOptions = [
    { label: 'Urban Area', value: 'Urban_Area', icon: 'city' },
    { label: 'Rural Area', value: 'Rural_Area', icon: 'home' },
    { label: 'City A', value: 'CityA', icon: 'location-city' },
    { label: 'City B', value: 'CityB', icon: 'location-city' },
    { label: 'Industrial Zone', value: 'Industrial_Zone', icon: 'factory' },
  ];

  const sourceTypeOptions = [
    { label: 'River', value: 'River', icon: 'water' },
    { label: 'Lake', value: 'Lake', icon: 'water-outline' },
    { label: 'Well', value: 'Well', icon: 'home-outline' },
    { label: 'Groundwater', value: 'Groundwater', icon: 'water-off' },
    { label: 'Treated Water', value: 'Treated_Water', icon: 'water-check' },
    { label: 'Untreated Water', value: 'Untreated_Water', icon: 'water-alert' },
  ];

  // Parameter configurations for sliders and inputs
  const waterParameters = {
    pH: { min: 0, max: 14, step: 0.1, unit: '', icon: 'flask', color: '#e74c3c', optimal: [6.5, 8.5] },
    O2: { min: 0, max: 15, step: 0.1, unit: 'mg/L', icon: 'air', color: '#3498db', optimal: [5, 12] },
    Temperature: { min: 0, max: 40, step: 0.5, unit: '°C', icon: 'thermometer', color: '#f39c12', optimal: [10, 30] },
    Turbidity: { min: 0, max: 50, step: 0.5, unit: 'NTU', icon: 'eye-off', color: '#95a5a6', optimal: [0, 10] },
    NH4: { min: 0, max: 10, step: 0.1, unit: 'mg/L', icon: 'flask-outline', color: '#e67e22', optimal: [0, 2] },
    NO3: { min: 0, max: 20, step: 0.1, unit: 'mg/L', icon: 'flask', color: '#27ae60', optimal: [0, 10] },
    NO2: { min: 0, max: 5, step: 0.1, unit: 'mg/L', icon: 'flask-outline', color: '#f1c40f', optimal: [0, 2] },
    CL: { min: 0, max: 500, step: 1, unit: 'mg/L', icon: 'flask', color: '#9b59b6', optimal: [10, 250] },
    SO4: { min: 0, max: 200, step: 1, unit: 'mg/L', icon: 'flask-outline', color: '#34495e', optimal: [5, 100] },
    PO4: { min: 0, max: 10, step: 0.1, unit: 'mg/L', icon: 'flask', color: '#e74c3c', optimal: [0, 5] },
    BSK5: { min: 0, max: 30, step: 0.5, unit: 'mg/L', icon: 'bug', color: '#8e44ad', optimal: [1, 15] },
    Suspended: { min: 0, max: 100, step: 1, unit: 'mg/L', icon: 'grain', color: '#d35400', optimal: [0, 50] },
  };

  const renderDropdown = (
    options: Array<{label: string, value: string, icon: string}>,
    currentValue: string,
    onSelect: (value: string) => void,
    show: boolean,
    onToggle: () => void,
    placeholder: string
  ) => (
    <View style={styles.dropdownContainer}>
      <TouchableOpacity style={styles.dropdownButton} onPress={onToggle}>
        <View style={styles.dropdownButtonContent}>
          <Text style={styles.dropdownButtonText}>
            {currentValue ? options.find(opt => opt.value === currentValue)?.label : placeholder}
          </Text>
          <Ionicons 
            name={show ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#666" 
          />
        </View>
      </TouchableOpacity>
      
      <Modal visible={show} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          onPress={onToggle}
          activeOpacity={1}
        >
          <View style={styles.dropdownModal}>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    onSelect(item.value);
                    onToggle();
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color="#0066cc" />
                  <Text style={styles.dropdownItemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );

  const renderSliderInput = (
    key: string,
    config: typeof waterParameters[keyof typeof waterParameters],
    label: string
  ) => {
    const currentValue = parseFloat(predictionForm[key as keyof PredictionForm] || '0');
    const isOptimal = currentValue >= config.optimal[0] && currentValue <= config.optimal[1];
    
    return (
      <View key={key} style={styles.sliderContainer}>
        <View style={styles.sliderHeader}>
          <View style={styles.sliderLabelContainer}>
            <Ionicons name={config.icon as any} size={20} color={config.color} />
            <Text style={styles.sliderLabel}>{label}</Text>
          </View>
          <View style={styles.sliderValueContainer}>
            <Text style={[styles.sliderValue, isOptimal ? styles.optimalValue : styles.alertValue]}>
              {currentValue.toFixed(key === 'pH' ? 1 : (config.step < 1 ? 1 : 0))} {config.unit}
            </Text>
            <View style={[styles.statusIndicator, { backgroundColor: isOptimal ? '#27ae60' : '#e74c3c' }]} />
          </View>
        </View>
        
        <View style={styles.sliderTrackContainer}>
          <Slider
            style={styles.slider}
            minimumValue={config.min}
            maximumValue={config.max}
            step={config.step}
            value={currentValue}
            onValueChange={(value) => setPredictionForm(prev => ({ 
              ...prev, 
              [key]: value.toFixed(key === 'pH' ? 1 : (config.step < 1 ? 1 : 0))
            }))}
            minimumTrackTintColor={config.color}
            maximumTrackTintColor="#ddd"
            thumbStyle={{ backgroundColor: config.color, width: 20, height: 20 }}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderMinMax}>{config.min}</Text>
            <Text style={styles.sliderMinMax}>{config.max}</Text>
          </View>
        </View>
        
        <Text style={styles.sliderHint}>
          Optimal range: {config.optimal[0]} - {config.optimal[1]} {config.unit}
        </Text>
      </View>
    );
  };

  const renderPredictionForm = () => (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#f8fafc', '#e2e8f0', '#cbd5e1']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>🌊 Water Quality Assessment</Text>
                <Text style={styles.formSubtitle}>Analyze water safety parameters</Text>
              </View>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                <Ionicons name="log-out-outline" size={18} color="white" />
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </View>

            {/* Location Information Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location" size={24} color="#0066cc" />
                <Text style={styles.sectionTitle}>Location Information</Text>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Sample Location</Text>
                {renderDropdown(
                  locationOptions,
                  predictionForm.Location,
                  (value) => setPredictionForm(prev => ({ ...prev, Location: value })),
                  showLocationDropdown,
                  () => setShowLocationDropdown(!showLocationDropdown),
                  "Select location type"
                )}
                <Text style={styles.inputHint}>Choose the area where water sample was collected</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Water Source</Text>
                {renderDropdown(
                  sourceTypeOptions,
                  predictionForm.Source_Type,
                  (value) => setPredictionForm(prev => ({ ...prev, Source_Type: value })),
                  showSourceTypeDropdown,
                  () => setShowSourceTypeDropdown(!showSourceTypeDropdown),
                  "Select water source type"
                )}
                <Text style={styles.inputHint}>Type of water source being tested</Text>
              </View>
            </View>

            {/* Water Chemistry Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="flask" size={22} color="#e74c3c" />
                <Text style={styles.sectionTitle}>Water Chemistry</Text>
              </View>
              
              {renderSliderInput('pH', waterParameters.pH, 'pH Level')}
              {renderSliderInput('O2', waterParameters.O2, 'Dissolved Oxygen')}
              {renderSliderInput('NH4', waterParameters.NH4, 'Ammonia (NH4)')}
              {renderSliderInput('NO3', waterParameters.NO3, 'Nitrate (NO3)')}
              {renderSliderInput('NO2', waterParameters.NO2, 'Nitrite (NO2)')}
              {renderSliderInput('CL', waterParameters.CL, 'Chloride')}
              {renderSliderInput('SO4', waterParameters.SO4, 'Sulfate (SO4)')}
              {renderSliderInput('PO4', waterParameters.PO4, 'Phosphate (PO4)')}
            </View>

            {/* Physical Properties Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="science" size={24} color="#f39c12" />
                <Text style={styles.sectionTitle}>Physical Properties</Text>
              </View>
              
              {renderSliderInput('Temperature', waterParameters.Temperature, 'Temperature')}
              {renderSliderInput('Turbidity', waterParameters.Turbidity, 'Turbidity')}
              {renderSliderInput('BSK5', waterParameters.BSK5, 'BOD5 (Biological Oxygen Demand)')}
              {renderSliderInput('Suspended', waterParameters.Suspended, 'Suspended Solids')}
            </View>

            {/* Date Information Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar" size={24} color="#9b59b6" />
                <Text style={styles.sectionTitle}>Sample Date</Text>
              </View>
              
              <View style={styles.dateContainer}>
                <View style={styles.dateInputGroup}>
                  <Text style={styles.inputLabel}>Year</Text>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="2024"
                    value={predictionForm.Year}
                    onChangeText={(text) => setPredictionForm(prev => ({ ...prev, Year: text }))}
                    keyboardType="numeric"
                    maxLength={4}
                  />
                </View>
                <View style={styles.dateInputGroup}>
                  <Text style={styles.inputLabel}>Month</Text>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="12"
                    value={predictionForm.Month}
                    onChangeText={(text) => setPredictionForm(prev => ({ ...prev, Month: text }))}
                    keyboardType="numeric"
                    maxLength={2}
                  />
                </View>
                <View style={styles.dateInputGroup}>
                  <Text style={styles.inputLabel}>Day</Text>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="15"
                    value={predictionForm.Day}
                    onChangeText={(text) => setPredictionForm(prev => ({ ...prev, Day: text }))}
                    keyboardType="numeric"
                    maxLength={2}
                  />
                </View>
              </View>
              <Text style={styles.inputHint}>Date when the water sample was collected</Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
              onPress={handlePrediction}
              disabled={isSubmitting}
            >
              <LinearGradient
                colors={isSubmitting ? ['#bdc3c7', '#95a5a6'] : ['#0066cc', '#004499']}
                style={styles.submitGradient}
              >
                {isSubmitting ? (
                  <Ionicons name="reload" size={20} color="white" />
                ) : (
                  <FontAwesome5 name="microscope" size={18} color="white" />
                )}
                <Text style={styles.submitButtonText}>
                  {isSubmitting ? 'Analyzing Water Sample...' : 'Analyze Water Quality'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
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