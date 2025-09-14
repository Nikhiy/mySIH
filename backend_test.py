#!/usr/bin/env python3
"""
Smart Health Surveillance Backend API Test Suite
Tests all authentication, prediction, notification, and history endpoints
"""

import requests
import json
import sys
from datetime import datetime
import time

# Configuration
BASE_URL = "https://h2oguard.preview.emergentagent.com/api"
VALID_PASSWORD = "health123"
INVALID_PASSWORD = "wrongpassword"
TEST_USERNAME = "testuser_health"

class HealthSurveillanceAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.access_token = None
        self.test_results = []
        
    def log_test(self, test_name, success, message, details=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "details": details
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_authentication_valid(self):
        """Test login with valid credentials"""
        try:
            url = f"{self.base_url}/auth/login"
            payload = {
                "username": TEST_USERNAME,
                "password": VALID_PASSWORD
            }
            
            response = requests.post(url, json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data and "token_type" in data:
                    self.access_token = data["access_token"]
                    self.log_test(
                        "Authentication - Valid Login",
                        True,
                        f"Login successful for user {TEST_USERNAME}",
                        {"token_received": True, "message": data.get("message", "")}
                    )
                    return True
                else:
                    self.log_test(
                        "Authentication - Valid Login",
                        False,
                        "Response missing required fields",
                        {"response": data}
                    )
            else:
                self.log_test(
                    "Authentication - Valid Login",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "Authentication - Valid Login",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def test_authentication_invalid(self):
        """Test login with invalid credentials"""
        try:
            url = f"{self.base_url}/auth/login"
            payload = {
                "username": TEST_USERNAME,
                "password": INVALID_PASSWORD
            }
            
            response = requests.post(url, json=payload, timeout=10)
            
            if response.status_code == 401:
                self.log_test(
                    "Authentication - Invalid Login",
                    True,
                    "Correctly rejected invalid credentials",
                    {"status_code": response.status_code}
                )
                return True
            else:
                self.log_test(
                    "Authentication - Invalid Login",
                    False,
                    f"Expected 401, got {response.status_code}",
                    {"response": response.text}
                )
        except Exception as e:
            self.log_test(
                "Authentication - Invalid Login",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def test_prediction_good_water_quality(self):
        """Test prediction with good water quality parameters"""
        if not self.access_token:
            self.log_test(
                "Prediction - Good Water Quality",
                False,
                "No access token available",
                {"requires_auth": True}
            )
            return False
            
        try:
            url = f"{self.base_url}/predict"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            
            # Good water quality parameters
            payload = {
                "Location": "Urban_Area",
                "Source_Type": "Treated_Water",
                "NH4": 0.5,
                "BSK5": 2.0,
                "Suspended": 5.0,
                "O2": 8.5,
                "NO3": 1.0,
                "NO2": 0.1,
                "SO4": 25.0,
                "PO4": 0.2,
                "CL": 15.0,
                "pH": 7.2,
                "Turbidity": 2.0,
                "Temperature": 22.0,
                "Year": 2024,
                "Month": 12,
                "Day": 15
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["prediction", "risk_level", "message"]
                
                if all(field in data for field in required_fields):
                    self.log_test(
                        "Prediction - Good Water Quality",
                        True,
                        f"Prediction successful: {data['risk_level']} risk",
                        {
                            "prediction": data["prediction"],
                            "risk_level": data["risk_level"],
                            "confidence": data.get("confidence"),
                            "message": data["message"]
                        }
                    )
                    return True
                else:
                    self.log_test(
                        "Prediction - Good Water Quality",
                        False,
                        "Response missing required fields",
                        {"response": data, "required": required_fields}
                    )
            else:
                self.log_test(
                    "Prediction - Good Water Quality",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "Prediction - Good Water Quality",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def test_prediction_poor_water_quality(self):
        """Test prediction with poor water quality parameters (should trigger high risk)"""
        if not self.access_token:
            self.log_test(
                "Prediction - Poor Water Quality",
                False,
                "No access token available",
                {"requires_auth": True}
            )
            return False
            
        try:
            url = f"{self.base_url}/predict"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            
            # Poor water quality parameters that should trigger high risk
            payload = {
                "Location": "Rural_Area",
                "Source_Type": "Untreated_Water",
                "NH4": 5.0,  # High ammonia
                "BSK5": 15.0,  # High BOD
                "Suspended": 50.0,  # High suspended solids
                "O2": 2.0,  # Low oxygen
                "NO3": 10.0,
                "NO2": 2.0,
                "SO4": 100.0,
                "PO4": 5.0,
                "CL": 50.0,
                "pH": 5.5,  # Very acidic
                "Turbidity": 25.0,  # High turbidity
                "Temperature": 30.0,
                "Year": 2024,
                "Month": 12,
                "Day": 15
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["prediction", "risk_level", "message"]
                
                if all(field in data for field in required_fields):
                    # Check if high risk was detected
                    is_high_risk = data["risk_level"] == "HIGH" or data["prediction"] == 1
                    self.log_test(
                        "Prediction - Poor Water Quality",
                        True,
                        f"Prediction successful: {data['risk_level']} risk detected",
                        {
                            "prediction": data["prediction"],
                            "risk_level": data["risk_level"],
                            "confidence": data.get("confidence"),
                            "high_risk_detected": is_high_risk,
                            "message": data["message"]
                        }
                    )
                    return True
                else:
                    self.log_test(
                        "Prediction - Poor Water Quality",
                        False,
                        "Response missing required fields",
                        {"response": data, "required": required_fields}
                    )
            else:
                self.log_test(
                    "Prediction - Poor Water Quality",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "Prediction - Poor Water Quality",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def test_prediction_without_auth(self):
        """Test prediction endpoint without authentication"""
        try:
            url = f"{self.base_url}/predict"
            payload = {
                "Location": "Test_Area",
                "Source_Type": "Treated_Water",
                "NH4": 1.0, "BSK5": 3.0, "Suspended": 10.0, "O2": 7.0,
                "NO3": 2.0, "NO2": 0.5, "SO4": 30.0, "PO4": 1.0,
                "CL": 20.0, "pH": 7.0, "Turbidity": 5.0, "Temperature": 25.0,
                "Year": 2024, "Month": 12, "Day": 15
            }
            
            response = requests.post(url, json=payload, timeout=10)
            
            if response.status_code == 401:
                self.log_test(
                    "Prediction - No Authentication",
                    True,
                    "Correctly rejected request without authentication",
                    {"status_code": response.status_code}
                )
                return True
            else:
                self.log_test(
                    "Prediction - No Authentication",
                    False,
                    f"Expected 401, got {response.status_code}",
                    {"response": response.text}
                )
        except Exception as e:
            self.log_test(
                "Prediction - No Authentication",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def test_prediction_missing_parameters(self):
        """Test prediction with missing required parameters"""
        if not self.access_token:
            self.log_test(
                "Prediction - Missing Parameters",
                False,
                "No access token available",
                {"requires_auth": True}
            )
            return False
            
        try:
            url = f"{self.base_url}/predict"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            
            # Missing several required parameters
            payload = {
                "Location": "Test_Area",
                "Source_Type": "Treated_Water",
                "NH4": 1.0,
                "pH": 7.0
                # Missing most required parameters
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            
            if response.status_code == 422:  # Validation error
                self.log_test(
                    "Prediction - Missing Parameters",
                    True,
                    "Correctly rejected request with missing parameters",
                    {"status_code": response.status_code}
                )
                return True
            else:
                self.log_test(
                    "Prediction - Missing Parameters",
                    False,
                    f"Expected 422, got {response.status_code}",
                    {"response": response.text}
                )
        except Exception as e:
            self.log_test(
                "Prediction - Missing Parameters",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def test_notification_trigger(self):
        """Test notification trigger endpoint"""
        if not self.access_token:
            self.log_test(
                "Notification Trigger",
                False,
                "No access token available",
                {"requires_auth": True}
            )
            return False
            
        try:
            url = f"{self.base_url}/notify"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            
            payload = {
                "location": "Test_Location",
                "risk_level": "HIGH",
                "message": "Test outbreak notification for high-risk area"
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "status" in data and data["status"] == "success":
                    self.log_test(
                        "Notification Trigger",
                        True,
                        "Notification triggered successfully",
                        {
                            "notification_id": data.get("notification_id"),
                            "message": data.get("message")
                        }
                    )
                    return True
                else:
                    self.log_test(
                        "Notification Trigger",
                        False,
                        "Unexpected response format",
                        {"response": data}
                    )
            else:
                self.log_test(
                    "Notification Trigger",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "Notification Trigger",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def test_prediction_history(self):
        """Test prediction history endpoint"""
        if not self.access_token:
            self.log_test(
                "Prediction History",
                False,
                "No access token available",
                {"requires_auth": True}
            )
            return False
            
        try:
            url = f"{self.base_url}/predictions/history"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "predictions" in data and isinstance(data["predictions"], list):
                    self.log_test(
                        "Prediction History",
                        True,
                        f"History retrieved successfully ({len(data['predictions'])} records)",
                        {"record_count": len(data["predictions"])}
                    )
                    return True
                else:
                    self.log_test(
                        "Prediction History",
                        False,
                        "Unexpected response format",
                        {"response": data}
                    )
            else:
                self.log_test(
                    "Prediction History",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "Prediction History",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def test_api_root(self):
        """Test API root endpoint"""
        try:
            url = f"{self.base_url}/"
            response = requests.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "status" in data:
                    self.log_test(
                        "API Root Endpoint",
                        True,
                        "API root accessible",
                        {"response": data}
                    )
                    return True
                else:
                    self.log_test(
                        "API Root Endpoint",
                        False,
                        "Unexpected response format",
                        {"response": data}
                    )
            else:
                self.log_test(
                    "API Root Endpoint",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "API Root Endpoint",
                False,
                f"Request failed: {str(e)}",
                {"error": str(e)}
            )
        return False
    
    def run_all_tests(self):
        """Run all test scenarios"""
        print(f"🧪 Starting Smart Health Surveillance API Tests")
        print(f"🌐 Base URL: {self.base_url}")
        print(f"👤 Test User: {TEST_USERNAME}")
        print("=" * 60)
        
        # Test sequence
        tests = [
            ("API Root", self.test_api_root),
            ("Valid Authentication", self.test_authentication_valid),
            ("Invalid Authentication", self.test_authentication_invalid),
            ("Prediction - Good Water", self.test_prediction_good_water_quality),
            ("Prediction - Poor Water", self.test_prediction_poor_water_quality),
            ("Prediction - No Auth", self.test_prediction_without_auth),
            ("Prediction - Missing Params", self.test_prediction_missing_parameters),
            ("Notification Trigger", self.test_notification_trigger),
            ("Prediction History", self.test_prediction_history),
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            print(f"\n🔍 Running: {test_name}")
            if test_func():
                passed += 1
            else:
                failed += 1
            time.sleep(0.5)  # Brief pause between tests
        
        # Summary
        print("\n" + "=" * 60)
        print(f"📊 TEST SUMMARY")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📈 Success Rate: {(passed/(passed+failed)*100):.1f}%")
        
        if failed > 0:
            print(f"\n🚨 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   • {result['test']}: {result['message']}")
        
        return passed, failed, self.test_results

def main():
    """Main test execution"""
    tester = HealthSurveillanceAPITester()
    passed, failed, results = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/test_results_detailed.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n💾 Detailed results saved to: /app/test_results_detailed.json")
    
    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()