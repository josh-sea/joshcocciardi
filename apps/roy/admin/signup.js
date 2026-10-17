import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { auth } from "./firebaseConfig";
import { useNavigation } from "@react-navigation/native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, set } from "firebase/database";
import { database } from "./firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import Banner from "../components/royBanner";

const Signup = () => {
  const { width } = Dimensions.get("window");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hidePass, setHidePass] = useState(true);

  const navigation = useNavigation();

  const handleSignup = () => {
    if (username.length > 16) {
      Alert.alert("Invalid Username", "Username cannot be longer than 16 characters.");
      return;
    }
  
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        const userId = user.uid; // User ID from Firebase Authentication
        const friendCode = Math.floor(10000000 + Math.random() * 90000000).toString();
        const userData = {
          username,
          email: user.email,
          friendCode,
        };

        set(ref(database, `/users/${userId}`), userData)
          .then(() => {
            console.log("User data saved successfully!");
            navigation.navigate("Games", { userEmail: user.email, userId });
          })
          .catch((error) => {
            Alert.alert("Signup Failed", error.message);
          });
      })
      .catch((error) => {
        Alert.alert("Signup Failed", error.message);
      });
  };

  return (
    <View style={styles.container}>
      <Banner />
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Username"
          autoCorrect={false}
          autoCapitalize="none"
          value={username}
          onChangeText={(text) => setUsername(text)}
        />
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          placeholder="Email"
          value={email}
          onChangeText={(text) => setEmail(text)}
        />
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry={hidePass}
          value={password}
          autoCorrect={false}
          autoCapitalize="none"
          onChangeText={(text) => setPassword(text)}
          onSubmitEditing={handleSignup}
        />
        <TouchableOpacity onPress={() => setHidePass(!hidePass)}>
          <Ionicons
            name={hidePass ? "ios-eye" : "ios-eye-off"}
            size={24}
            color="black"
          />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.button, { width: width * 0.5 }]}
        onPress={handleSignup}
      >
        <Text style={styles.buttonText}>Signup</Text>
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
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    height: 40,
    paddingHorizontal: 8,
    backgroundColor: "white",
    borderRadius: 15,
    width: "100%",
  },
  input: {
    flex: 1,
    height: "100%",
    backgroundColor: "white",
    paddingHorizontal: 8,
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
  button: {
    marginTop: 16,
    height: 40,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "darkgreen",
    borderRadius: 15,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
});

export default Signup;
