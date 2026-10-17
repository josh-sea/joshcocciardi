import React, { useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Text,
  Alert
} from "react-native";
import { auth } from "./firebaseConfig";
import { useNavigation } from "@react-navigation/native";
import { signInWithEmailAndPassword } from "firebase/auth";
import Banner from "../components/royBanner";
import { Ionicons } from "@expo/vector-icons";

const Login = () => {
  const { width } = Dimensions.get("window");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hidePass, setHidePass] = useState(true);
  const navigation = useNavigation();

  const handleLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userId = user.uid;
      const userEmail = user.email;
      console.log("logged in successfully");
      navigation.navigate("Games", { userEmail, userId });
    } catch (error) {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(errorCode, errorMessage);
      const alertMessage = errorCode === "auth/user-not-found" 
        ? "That account is not signed up yet, try signing up first!" 
        : errorCode === "auth/wrong-password" 
        ? "Wrong email or password, try again!"
        : "Login failed. Please try again.";
      Alert.alert('Login Failed', alertMessage);
    }
  };

  const handleSignup = () => {
    navigation.navigate("Signup");
  };

  const handleDemo = () => {
    navigation.navigate("Demo");
  }

  return (
    <View style={styles.container}>
      <Banner />
      <View style={styles.loginContainer}>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          placeholder="Email"
          value={email}
          onChangeText={(text) => setEmail(text)}
        />
      </View>
      <View style={styles.loginContainer}>
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry={hidePass}
          value={password}
          autoCorrect={false}
          autoCapitalize="none"
          onChangeText={(text) => setPassword(text)}
          onSubmitEditing={handleLogin}
        />
        <TouchableOpacity
          onPress={() => setHidePass(!hidePass)}
          style={styles.eyeIcon}
        >
          <Ionicons
            name={hidePass ? "eye-outline" : "eye-off-outline"}
            size={24}
            color="black"
          />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.button, { width: width * 0.5 }]}
        onPress={handleLogin}
      >
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { width: width * 0.5 }]}
        onPress={handleSignup}
      >
        <Text style={styles.buttonText}>Signup</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { width: width * 0.5 }]}
        onPress={handleDemo}
      >
        <Text style={styles.buttonText}>Practice</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: '#f5f5f5',
  },
  loginContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 15,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  input: {
    flex: 1,
    height: "100%",
    backgroundColor: "white",
    paddingHorizontal: 8,
    fontFamily: "PressStart2P-Regular",
    fontSize: 12,
  },
  eyeIcon: {
    padding: 8,
  },
  button: {
    marginTop: 16,
    height: 48,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "darkgreen",
    borderRadius: 15,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
  },
});

export default Login;
